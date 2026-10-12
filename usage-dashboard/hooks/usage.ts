import type { ModelTotals, Sample, Task, TaskStatus } from '../types'

export type TodoInput = { content: string; activeForm: string; status: TaskStatus }

export type Eta = {
  remaining: number
  optimisticMs: number
  likelyMs: number
  confidence: 'low' | 'medium' | 'high'
}

export type Risk = 'green' | 'amber' | 'red'

export const WINDOW_MS = 30 * 60 * 1000

export const emptyTotals = (): ModelTotals => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  messages: 0,
})

export const totalTokens = (m: ModelTotals): number =>
  m.input + m.output + m.cacheRead + m.cacheWrite

/** Latest todo list wins; status transitions stamp start and completion times. */
export const reduceTasks = (
  prev: readonly Task[],
  todos: readonly TodoInput[],
  now: number,
): { tasks: Task[]; finishedMs: number[] } => {
  const byContent = new Map(prev.map(task => [task.content, task]))
  const finishedMs: number[] = []

  const tasks = todos.map((todo): Task => {
    const before = byContent.get(todo.content)
    const seenAt = before?.seenAt ?? now
    let startedAt = before?.startedAt ?? null
    let completedAt = before?.completedAt ?? null

    if (todo.status === 'in_progress' && startedAt === null) {
      startedAt = now
    }
    if (todo.status === 'completed' && completedAt === null) {
      completedAt = now
      finishedMs.push(Math.max(0, now - (startedAt ?? seenAt)))
    }

    return {
      content: todo.content,
      activeForm: todo.activeForm,
      status: todo.status,
      seenAt,
      startedAt,
      completedAt,
    }
  })

  return { tasks, finishedMs }
}

export const percentile = (values: readonly number[], p: number): number => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const at = (sorted.length - 1) * p
  const lo = Math.floor(at)
  const hi = Math.ceil(at)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo)
}

export const estimateEta = (
  tasks: readonly Task[],
  durations: readonly number[],
  fallbackMs: number,
): Eta => {
  const remaining = tasks.filter(task => task.status !== 'completed').length
  const hasHistory = durations.length > 0
  const likely = hasHistory ? percentile(durations, 0.5) : fallbackMs
  const optimistic = hasHistory ? percentile(durations, 0.25) : fallbackMs * 0.6
  const confidence = durations.length >= 5 ? 'high' : durations.length >= 2 ? 'medium' : 'low'

  return {
    remaining,
    optimisticMs: Math.round(remaining * optimistic),
    likelyMs: Math.round(remaining * likely),
    confidence,
  }
}

/** Appends a sample; a drop in percent means the window reset, so older samples go. */
export const pushSample = (samples: readonly Sample[], sample: Sample): Sample[] => {
  const last = samples[samples.length - 1]
  const base = last !== undefined && sample.pct < last.pct ? [] : [...samples]
  return [...base, sample].filter(s => sample.t - s.t <= WINDOW_MS).slice(-120)
}

/** Percent per minute over the retained samples; 0 when there is no trend yet. */
export const burnRate = (samples: readonly Sample[]): number => {
  if (samples.length < 2) return 0
  const first = samples[0]
  const last = samples[samples.length - 1]
  const minutes = (last.t - first.t) / 60000
  return minutes > 0 ? Math.max(0, (last.pct - first.pct) / minutes) : 0
}

/** Epoch ms when the window hits 100%, or null with no burn. */
export const exhaustionAt = (pct: number, ratePerMin: number, now: number): number | null =>
  ratePerMin > 0 ? now + ((100 - pct) / ratePerMin) * 60000 : null

export const gaugeColor = (pct: number): 'green' | 'yellow' | 'red' =>
  pct > 85 ? 'red' : pct >= 60 ? 'yellow' : 'green'

/**
 * red: at the current burn the window runs out before the tasks finish and before it resets.
 * amber: usage is above 85%, or it would run out within a quarter of the ETA after finishing.
 */
export const limitRisk = (
  pct: number,
  exhaustion: number | null,
  resetAt: number | null,
  etaLikelyMs: number,
  now: number,
): Risk => {
  const finishAt = now + etaLikelyMs
  const runsOutBeforeReset = exhaustion !== null && (resetAt === null || exhaustion < resetAt)

  if (runsOutBeforeReset && etaLikelyMs > 0 && exhaustion !== null && exhaustion < finishAt) {
    return 'red'
  }
  if (pct > 85) return 'amber'
  if (runsOutBeforeReset && etaLikelyMs > 0 && exhaustion !== null) {
    return exhaustion < finishAt + etaLikelyMs * 0.25 ? 'amber' : 'green'
  }
  return 'green'
}

/** Rough USD per million tokens by model family: [input, output]. An estimate, not a bill. */
export const priceFor = (model: string): [number, number] => {
  const id = model.toLowerCase()
  if (id.includes('fable') || id.includes('mythos')) return [10, 50]
  if (id.includes('haiku-5')) return [0.1, 0.5]
  if (id.includes('haiku')) return [1, 5]
  if (id.includes('opus-5-5')) return [4, 20]
  if (id.includes('opus')) return [5, 25]
  if (id.includes('sonnet-5')) return [2, 10]
  if (id.includes('sonnet')) return [3, 15]
  return [3, 15]
}

export const estimateCostUsd = (model: string, m: ModelTotals): number => {
  const [inp, out] = priceFor(model)
  return (m.input * inp + m.output * out + m.cacheRead * inp * 0.1 + m.cacheWrite * inp * 1.25) / 1_000_000
}

export const topModel = (
  models: Readonly<Record<string, ModelTotals>>,
): { model: string; tokens: number; share: number } | null => {
  const entries = Object.entries(models).map(([model, m]) => ({ model, tokens: totalTokens(m) }))
  const sum = entries.reduce((acc, e) => acc + e.tokens, 0)
  if (entries.length === 0 || sum === 0) return null
  const best = entries.reduce((a, b) => (b.tokens > a.tokens ? b : a))
  return { ...best, share: best.tokens / sum }
}

export const dayKey = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

/** Last 7 calendar days (UTC), oldest first, zero-filled. */
export const lastSevenDays = (
  days: Readonly<Record<string, number>>,
  now: number,
): Array<{ day: string; tokens: number }> =>
  Array.from({ length: 7 }, (_, i) => {
    const day = dayKey(now - (6 - i) * 86_400_000)
    return { day, tokens: days[day] ?? 0 }
  })

export const formatTokens = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)

export const formatDuration = (ms: number): string => {
  const minutes = Math.round(ms / 60000)
  if (minutes < 1) return '<1m'
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  return `${h}h ${minutes % 60}m`
}

export const bar = (pct: number, width = 20): string => {
  const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)))
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

export const shortModel = (model: string): string => model.replace(/^claude-/, '')

const EIGHTHS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉']

/** A bar with 1/8-cell resolution, split into the filled and the empty part for two colours. */
export const smoothBar = (pct: number, width: number): { filled: string; empty: string } => {
  const clamped = Math.max(0, Math.min(100, pct))
  const eighths = Math.round((clamped / 100) * width * 8)
  const full = Math.floor(eighths / 8)
  const part = EIGHTHS[eighths % 8]
  const used = full + (part === '' ? 0 : 1)
  return { filled: '█'.repeat(full) + part, empty: '░'.repeat(Math.max(0, width - used)) }
}

export const themeColor = (pct: number): 'success' | 'warning' | 'error' =>
  pct > 85 ? 'error' : pct >= 60 ? 'warning' : 'success'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const weekdayLabel = (day: string): string => WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()]

/** Bar width that fits the pane: leaves room for borders, padding and the figures beside it. */
export const paneBarWidth = (columns: number | undefined): number =>
  Math.max(12, Math.min(50, (columns ?? 80) - 22))

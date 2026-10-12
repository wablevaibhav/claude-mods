import type { Flow, Item, ItemStatus, Limit } from '../types'

export type Report = {
  title?: string
  total?: number
  done?: number
  note?: string
  items?: ReadonlyArray<{ title: string; status?: ItemStatus }>
  finished?: boolean
}

export type Todo = { content: string; activeForm: string; status: ItemStatus }

const int = (n: number | undefined): number | undefined =>
  n === undefined || !Number.isFinite(n) ? undefined : Math.max(0, Math.round(n))

const count = (items: readonly Item[]) => items.filter(i => i.status === 'completed').length

export const blank = (now: number): Flow => ({
  title: 'Working',
  total: 0,
  done: 0,
  note: null,
  items: [],
  isFinished: false,
  startedAt: now,
  updatedAt: now,
})

/** Merges one explicit report (the progress tool) into the flow; fields left out keep their value. */
export const applyReport = (prev: Flow | null, input: Report, now: number): Flow => {
  const base = prev && !prev.isFinished ? prev : blank(now)
  const items: Item[] =
    input.items?.map(i => ({ title: i.title, status: i.status ?? 'pending' })) ?? base.items
  const fromItems = input.items !== undefined
  const total = int(input.total) ?? (fromItems ? items.length : base.total)
  const done = int(input.done) ?? (fromItems ? count(items) : base.done)

  return {
    ...base,
    title: input.title?.trim() || base.title,
    total,
    done: total > 0 ? Math.min(total, done) : done,
    note: input.note === undefined ? base.note : input.note.trim() || null,
    items,
    isFinished: input.finished === true,
    updatedAt: now,
  }
}

/** The todo list is the plan: counts and the current step follow it with no cooperation needed. */
export const applyTodos = (prev: Flow | null, todos: readonly Todo[], now: number): Flow | null => {
  if (todos.length === 0) return null
  const base = prev && !prev.isFinished ? prev : blank(now)
  const items: Item[] = todos.map(t => ({ title: t.content, status: t.status }))
  const current = todos.find(t => t.status === 'in_progress')
  const done = count(items)

  return {
    ...base,
    total: items.length,
    done,
    items,
    note: current ? current.activeForm : null,
    isFinished: done === items.length,
    updatedAt: now,
  }
}

export const percent = (flow: Pick<Flow, 'total' | 'done'>): number =>
  flow.total <= 0 ? 0 : Math.round((Math.min(flow.done, flow.total) / flow.total) * 100)

export const bar = (pct: number, width = 16): string => {
  const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)))
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

export const elapsed = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`
}

const EIGHTHS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉']

/** A bar with 1/8-cell resolution, split into the filled and the empty part for two colours. */
export const smoothBar = (pct: number, width = 36): { filled: string; empty: string } => {
  const clamped = Math.max(0, Math.min(100, pct))
  const eighths = Math.round((clamped / 100) * width * 8)
  const full = Math.floor(eighths / 8)
  const part = EIGHTHS[eighths % 8]
  const used = full + (part === '' ? 0 : 1)
  return { filled: '█'.repeat(full) + part, empty: '░'.repeat(Math.max(0, width - used)) }
}

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export const spinner = (now: number): string => FRAMES[Math.floor(now / 120) % FRAMES.length]

/** Rough time left from the average time per finished step; null until a step has finished. */
export const etaLeft = (flow: Pick<Flow, 'total' | 'done' | 'startedAt' | 'isFinished'>, now: number): number | null => {
  if (flow.isFinished || flow.done <= 0 || flow.total <= flow.done) return null
  const per = (now - flow.startedAt) / flow.done
  return Math.max(0, per * (flow.total - flow.done))
}

/** At most `max` steps, windowed around the current one, with counts of what is cut off. */
export const windowItems = (
  items: readonly Item[],
  max: number,
): { rows: Array<{ item: Item; index: number }>; before: number; after: number } => {
  if (items.length <= max) {
    return { rows: items.map((item, index) => ({ item, index })), before: 0, after: 0 }
  }
  let current = items.findIndex(i => i.status === 'in_progress')
  if (current < 0) current = items.findIndex(i => i.status === 'pending')
  if (current < 0) current = items.length - 1
  const start = Math.max(0, Math.min(items.length - max, current - 1))
  const rows = items.slice(start, start + max).map((item, i) => ({ item, index: start + i }))
  return { rows, before: start, after: items.length - start - max }
}

export const gaugeColor = (pct: number): 'success' | 'warning' | 'error' =>
  pct > 85 ? 'error' : pct >= 60 ? 'warning' : 'success'

export type UsagePart = { label: string; pct: number; color: 'success' | 'warning' | 'error'; reset: string | null }

const LABELS: Record<string, string> = { five_hour: '5h', seven_day: 'wk' }

/** The 5h and weekly windows, in that order, with a colour and time to reset. Other kinds are left out. */
export const usageParts = (limits: readonly Limit[], now: number): UsagePart[] =>
  ['five_hour', 'seven_day'].flatMap(kind => {
    const l = limits.find(x => x.kind === kind)
    if (!l) return []
    const pct = Math.max(0, Math.min(100, Math.round(l.percentUsed)))
    const at = l.resetsAt ? Date.parse(l.resetsAt) : NaN
    return [{ label: LABELS[kind], pct, color: gaugeColor(pct), reset: Number.isNaN(at) ? null : elapsed(at - now) }]
  })

export const shortModel = (model: string): string => model.replace(/^claude-/, '')

/** Bar width that fits the terminal: leaves room for the border and padding, within 12..60. */
export const barWidth = (columns: number | undefined): number =>
  Math.max(12, Math.min(60, (columns ?? 80) - 6))

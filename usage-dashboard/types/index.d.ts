export type TaskStatus = 'pending' | 'in_progress' | 'completed'

export type Task = {
  content: string
  activeForm: string
  status: TaskStatus
  seenAt: number
  startedAt: number | null
  completedAt: number | null
}

export type ModelTotals = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  messages: number
}

export type Sample = { t: number; pct: number }

export type Limit = { kind: string; percentUsed: number; resetsAt: string | null }

export type CurrentModel = { model: string; at: number }

declare module 'claude-code' {
  interface PluginState {
    'usage-dashboard': {
      tasks: Task[]
      models: Record<string, ModelTotals>
      days: Record<string, number>
      durations: number[]
      samples: Sample[]
      limits: Limit[]
      current: CurrentModel | null
      costUsd: number | null
      refreshedAt: number
    }
  }
}

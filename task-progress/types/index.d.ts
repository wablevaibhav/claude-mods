export type ItemStatus = 'pending' | 'in_progress' | 'completed'

export type Item = { title: string; status: ItemStatus }

export type Flow = {
  title: string
  total: number
  done: number
  note: string | null
  items: Item[]
  isFinished: boolean
  startedAt: number
  updatedAt: number
}

export type Working = { since: number }

export type Limit = { kind: string; percentUsed: number; resetsAt: string | null }

declare module 'claude-code' {
  interface PluginState {
    'task-progress': {
      flow: Flow | null
      working: Working | null
      now: number
      isHidden: boolean
      isCompact: boolean
      limits: Limit[]
      model: string | null
    }
  }
}

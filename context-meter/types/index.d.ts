export type Level = 'ok' | 'warn' | 'high'

export type ContextReading = {
  percent: number | null
  tokens: number | null
  window: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'context-meter': {
      reading: ContextReading
      lastLevel: Level
      isHidden: boolean
    }
  }
}

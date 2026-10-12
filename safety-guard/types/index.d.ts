export type GuardState = {
  isPaused: boolean
  blocked: number
}

declare module 'claude-code' {
  interface PluginState {
    'safety-guard': { isPaused: boolean; blocked: number }
  }
}

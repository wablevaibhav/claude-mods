export type GitStatus = {
  branch: string
  isDetached: boolean
  upstream: string | null
  ahead: number
  behind: number
  staged: number
  changed: number
  untracked: number
  conflicts: number
}

declare module 'claude-code' {
  interface PluginState {
    'git-band': {
      git: GitStatus | null
      isHidden: boolean
    }
  }
}

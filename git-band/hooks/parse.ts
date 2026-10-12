import type { GitStatus } from '../types'

/** Parses `git status --porcelain=v2 --branch` output. Null when it holds no branch header. */
export const parseStatus = (text: string): GitStatus | null => {
  const status: GitStatus = {
    branch: '',
    isDetached: false,
    upstream: null,
    ahead: 0,
    behind: 0,
    staged: 0,
    changed: 0,
    untracked: 0,
    conflicts: 0,
  }
  let sawBranch = false

  for (const line of text.split('\n')) {
    if (line.startsWith('# branch.head ')) {
      const head = line.slice('# branch.head '.length).trim()
      status.isDetached = head === '(detached)'
      status.branch = head
      sawBranch = true
    } else if (line.startsWith('# branch.upstream ')) {
      status.upstream = line.slice('# branch.upstream '.length).trim()
    } else if (line.startsWith('# branch.ab ')) {
      const m = /\+(\d+)\s+-(\d+)/.exec(line)
      if (m) {
        status.ahead = Number(m[1])
        status.behind = Number(m[2])
      }
    } else if (line.startsWith('1 ') || line.startsWith('2 ')) {
      const xy = line.split(' ')[1] ?? '..'
      if (xy[0] !== '.') status.staged += 1
      if (xy[1] !== '.') status.changed += 1
    } else if (line.startsWith('u ')) {
      status.conflicts += 1
    } else if (line.startsWith('? ')) {
      status.untracked += 1
    }
  }

  return sawBranch ? status : null
}

export const isClean = (s: GitStatus): boolean =>
  s.staged + s.changed + s.untracked + s.conflicts === 0

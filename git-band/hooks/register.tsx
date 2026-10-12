import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { GitStatus } from '../types'
import { isClean, parseStatus } from './parse'

const git = atom({ plugin: 'git-band', key: 'git' } as const, null as GitStatus | null)
const isHidden = atom({ plugin: 'git-band', key: 'isHidden' } as const, false)

async function refresh($: EngineInterface) {
  const result = await $.process.run(['git', 'status', '--porcelain=v2', '--branch'], {
    timeoutMs: 5000,
  })
  const parsed = result.exitCode === 0 ? parseStatus(result.stdout) : null
  await update($, git, () => parsed)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'gitband',
      description: 'Show or hide the git status band above the prompt',
    })
    await refresh($).catch(() => undefined)
    $.clock.every(15_000, () => {
      void refresh($).catch(() => undefined)
    })

    return next(e)
  })

  on('command.run', { command: 'gitband' }, async $ => {
    const hidden = await update($, isHidden, h => !h)
    return { text: hidden ? 'Git band hidden.' : 'Git band shown.' }
  }).catch(() => ({ text: 'Git band could not toggle.' }))

  on('turn.complete', async ($, e, next) => {
    await refresh($).catch(() => undefined)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) return next(e)

    const s = await read($, git)
    if (s === null) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const clean = isClean(s)

    return (
      <Box paddingX={1} gap={1}>
        <Text bold color="claude">
          ⎇ {s.isDetached ? 'detached HEAD' : s.branch}
        </Text>
        {s.upstream !== null && (s.ahead > 0 || s.behind > 0) && (
          <Text color="warning">
            ↑{s.ahead} ↓{s.behind}
          </Text>
        )}
        {clean ? (
          <Text color="success">✓ clean</Text>
        ) : (
          <>
            {s.staged > 0 && <Text color="success">● {s.staged} staged</Text>}
            {s.changed > 0 && <Text color="warning">✎ {s.changed} changed</Text>}
            {s.untracked > 0 && <Text dimColor>? {s.untracked} untracked</Text>}
            {s.conflicts > 0 && <Text color="error">⚠ {s.conflicts} conflicts</Text>}
          </>
        )}
        {s.upstream === null && !s.isDetached && <Text dimColor>no upstream</Text>}
      </Box>
    )
  })
}

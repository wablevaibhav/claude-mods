import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { checkBash, checkRead, checkWrite } from './rules'

const isPaused = atom({ plugin: 'safety-guard', key: 'isPaused' } as const, false)
const blocked = atom({ plugin: 'safety-guard', key: 'blocked' } as const, 0)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'safeguard',
      description: 'Safety guard: show status, or pause / resume it for this session',
    })

    return next(e)
  })

  on('command.run', { command: 'safeguard' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'pause') await update($, isPaused, () => true)
    if (arg === 'resume') await update($, isPaused, () => false)

    const paused = await read($, isPaused)
    const count = await read($, blocked)

    return {
      text:
        `Safety guard is ${paused ? 'PAUSED' : 'active'}; ${count} call(s) blocked this session.\n` +
        'Blocks: recursive delete of / ~ . * or system dirs, git push --force, curl|sh, disk writes, chmod -R 777,\n' +
        'and writes to .env, key files, service-account JSON, .npmrc, .aws/credentials, .git internals.\n' +
        'Use /safeguard pause or /safeguard resume.',
    }
  }).catch(() => ({ text: 'Safety guard status unavailable.' }))

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (await read($, isPaused)) return next(e)

    const reason = checkBash(e.command)
    if (reason === null) return next(e)

    await update($, blocked, n => n + 1)
    $.ui.toast(`Blocked: ${reason}`)

    return {
      deny: `${$.plugin.name}: blocked (${reason}). Ask the user first; they can run /safeguard pause to allow it.`,
    }
  }).catch(($, e, next) =>
    next.called ? next(e) : { deny: `${$.plugin.name}: the guard failed, so this call was blocked.` },
  )

  for (const tool of ['Edit', 'Write'] as const) {
    on('tool.call', { tool }, async ($, e, next) => {
      if (await read($, isPaused)) return next(e)

      const reason = checkWrite(e.file_path)
      if (reason === null) return next(e)

      await update($, blocked, n => n + 1)
      $.ui.toast(`Blocked write: ${reason}`)

      return {
        deny: `${$.plugin.name}: blocked (${reason}). Ask the user first; they can run /safeguard pause to allow it.`,
      }
    }).catch(($, e, next) =>
      next.called ? next(e) : { deny: `${$.plugin.name}: the guard failed, so this call was blocked.` },
    )
  }

  on('tool.call', { tool: 'Read' }, async ($, e, next) => {
    if (await read($, isPaused)) return next(e)

    const reason = checkRead(e.file_path)
    if (reason === null) return next(e)

    await update($, blocked, n => n + 1)
    $.ui.toast(`Blocked read: ${reason}`)

    return {
      deny: `${$.plugin.name}: blocked (${reason}). Ask the user first; they can run /safeguard pause to allow it.`,
    }
  }).catch(($, e, next) =>
    next.called ? next(e) : { deny: `${$.plugin.name}: the guard failed, so this call was blocked.` },
  )
}

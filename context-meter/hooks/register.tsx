import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ContextReading, Level } from '../types'
import { advice, bar, formatTokens, levelFor, risen } from './logic'

const reading = atom(
  { plugin: 'context-meter', key: 'reading' } as const,
  { percent: null, tokens: null, window: null } as ContextReading,
)
const lastLevel = atom({ plugin: 'context-meter', key: 'lastLevel' } as const, 'ok' as Level)
const isHidden = atom({ plugin: 'context-meter', key: 'isHidden' } as const, false)

/** Reads the live window and warns once each time it climbs into a higher level. */
async function refresh($: EngineInterface) {
  const { context } = await $.session.usage()
  const percent = context.percent ?? null
  await update($, reading, () => ({
    percent,
    tokens: context.tokens ?? null,
    window: context.window,
  }))

  if (percent === null) {
    $.ui.status(undefined)
    return
  }

  const prev = await read($, lastLevel)
  const up = risen(prev, percent)
  await update($, lastLevel, () => levelFor(percent))
  if (up === 'warn') $.ui.toast(`Context ${percent}% full: consider /compact soon`)
  if (up === 'high') $.ui.toast(`Context ${percent}% full: /compact or start fresh now`)
  $.ui.status(`ctx ${percent}%`)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'ctxmeter',
      description: 'Show or hide the context-window warning band',
    })
    await refresh($).catch(() => undefined)
    $.clock.every(30_000, () => {
      void refresh($).catch(() => undefined)
    })

    return next(e)
  })

  on('command.run', { command: 'ctxmeter' }, async $ => {
    const hidden = await update($, isHidden, h => !h)
    return { text: hidden ? 'Context warning band hidden.' : 'Context warning band shown.' }
  }).catch(() => ({ text: 'Context meter could not toggle.' }))

  on('turn.complete', async ($, e, next) => {
    await refresh($).catch(() => undefined)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) return next(e)

    const r = await read($, reading)
    if (r.percent === null) return next(e)
    const level = levelFor(r.percent)
    if (level === 'ok') return next(e)

    const { Box, Text, Button } = $.ui.resolve(e)
    const color = level === 'high' ? 'error' : 'warning'

    return (
      <Box paddingX={1} gap={1}>
        <Text color={color} bold>
          {level === 'high' ? '●' : '▲'} Context {r.percent}%
        </Text>
        <Text color={color}>{bar(r.percent)}</Text>
        {r.tokens !== null && r.window !== null && (
          <Text dimColor>
            {formatTokens(r.tokens)} / {formatTokens(r.window)}
          </Text>
        )}
        <Text dimColor wrap="truncate-end">
          {advice(level)}
        </Text>
        <Button key="hide" label="Hide" onPress={() => update($, isHidden, () => true)} />
      </Box>
    )
  })
}

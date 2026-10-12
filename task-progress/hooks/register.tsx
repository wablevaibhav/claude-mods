import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Flow, Limit, Working } from '../types'
import {
  applyReport,
  applyTodos,
  barWidth,
  elapsed,
  etaLeft,
  percent,
  shortModel,
  smoothBar,
  spinner,
  usageParts,
  windowItems,
} from './progress'
import type { Report } from './progress'

const TOOL = 'mcp__task-progress__progress'

const flow = atom({ plugin: 'task-progress', key: 'flow' } as const, null as Flow | null)
const working = atom({ plugin: 'task-progress', key: 'working' } as const, null as Working | null)
const nowAtom = atom({ plugin: 'task-progress', key: 'now' } as const, 0)
const isHidden = atom({ plugin: 'task-progress', key: 'isHidden' } as const, false)
const isCompact = atom({ plugin: 'task-progress', key: 'isCompact' } as const, false)
const limits = atom({ plugin: 'task-progress', key: 'limits' } as const, [] as Limit[])
const model = atom({ plugin: 'task-progress', key: 'model' } as const, null as string | null)

/** The 5h and weekly windows the last reply reported; the same source the usage dashboard reads. */
async function refreshLimits($: EngineInterface) {
  const usage = await $.session.usage()
  const list: Limit[] = usage.rateLimits.map(l => ({
    kind: l.kind,
    percentUsed: l.percentUsed,
    resetsAt: l.resetsAt ?? null,
  }))
  await update($, limits, () => list)
}

export const register: Register = on => {
  let isWorking = false

  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: 'progress',
      description:
        'Report progress of the current job to the progress bar above the prompt. ' +
        'Call it once after planning (title, total) and again as steps finish (done, note). ' +
        'Optional when a todo list is in use: the bar follows the todo list by itself. ' +
        'Pass finished: true at the end. Fields left out keep their value.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short name of the job, a few words.' },
          total: { type: 'integer', minimum: 0, description: 'Number of steps planned.' },
          done: { type: 'integer', minimum: 0, description: 'Steps finished so far.' },
          note: { type: 'string', description: 'The step in progress, a few words.' },
          finished: { type: 'boolean', description: 'True once the job is complete.' },
          items: {
            type: 'array',
            description: 'Optional step list; total and done follow it.',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
              },
              required: ['title'],
            },
          },
        },
      },
    })
    await $.command.register({
      name: 'progress',
      description: 'Show or hide the progress band above the prompt',
    })

    await refreshLimits($).catch(() => undefined)

    // Redraws the spinner and timer, only while a turn runs.
    $.clock.every(250, () => {
      if (!isWorking) return
      void $.clock.now().then(t => update($, nowAtom, () => t))
    })
    // Keeps the usage figures fresh between replies.
    $.clock.every(30_000, () => {
      void refreshLimits($).catch(() => undefined)
    })

    return next(e)
  })

  on('command.run', { command: 'progress' }, async $ => {
    const hidden = await update($, isHidden, h => !h)
    return { text: hidden ? 'Progress band hidden.' : 'Progress band shown.' }
  }).catch(() => ({ text: 'Progress band could not toggle.' }))

  on('prompt.submit', async ($, e, next) => {
    const t = await $.clock.now()
    isWorking = true
    await update($, working, () => ({ since: t }))
    await update($, nowAtom, () => t)
    // A finished job is done being shown once the next prompt starts.
    await update($, flow, f => (f && f.isFinished ? null : f))

    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      isWorking = false
      await update($, working, () => null)
    }
    if (e.usage !== undefined) {
      const used = e.usage.model
      await update($, model, () => used)
    }
    await refreshLimits($).catch(() => undefined)

    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const input = e as unknown as Report
    const t = await $.clock.now()
    const next = await update($, flow, prev => applyReport(prev, input, t))

    return { result: `ok: ${next ? `${next.title} ${next.done}/${next.total}` : 'cleared'}` }
  }).catch(() => ({ result: 'progress report failed' }))

  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const t = await $.clock.now()
    await update($, flow, prev => applyTodos(prev, e.todos, t))

    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) return next(e)

    const job = await read($, flow)
    const busy = await read($, working)
    const now = await read($, nowAtom)
    if (job === null && busy === null) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const compact = await read($, isCompact)
    const usage = usageParts(await read($, limits), now)
    const active = await read($, model)
    const secs = busy ? elapsed(now - busy.since) : null
    const hide = <Button key="hide" label="Hide" onPress={() => update($, isHidden, () => true)} />

    if (job === null) {
      return (
        <Box paddingX={1} gap={1}>
          <Text color="claude">{spinner(now)}</Text>
          <Text dimColor>Working {secs}</Text>
          {usage.map(u => (
            <Text key={u.label} color={u.color}>
              {u.label} {u.pct}%
            </Text>
          ))}
          {hide}
        </Box>
      )
    }

    const sizeKnown = job.total > 0
    const finished = job.isFinished && sizeKnown
    const pct = percent(job)
    const accent = finished ? 'success' : 'claude'
    const left = etaLeft(job, now)
    const track = smoothBar(pct, barWidth(e.viewport?.columns))
    const view = windowItems(job.items, 5)
    const icon = finished ? '✓' : spinner(now)
    const showSteps = !compact && job.items.length > 0
    const toggle = job.items.length > 0 && (
      <Button
        key="compact"
        label={compact ? 'Expand' : 'Collapse'}
        onPress={() => update($, isCompact, c => !c)}
      />
    )

    return (
      <Box flexDirection="column" borderStyle="round" borderColor={accent} paddingX={1}>
        <Box justifyContent="space-between" gap={2}>
          <Text bold color={accent} wrap="truncate-end">
            {icon} {job.title}
          </Text>
          <Text dimColor wrap="truncate-end">
            {sizeKnown ? `${job.done}/${job.total} · ${pct}%` : 'no step count yet'}
            {left !== null ? ` · ~${elapsed(left)} left` : ''}
            {secs !== null ? ` · ${secs}` : ''}
          </Text>
        </Box>
        {sizeKnown && (
          <Text>
            <Text color={accent}>{track.filled}</Text>
            <Text dimColor>{track.empty}</Text>
          </Text>
        )}
        {compact && job.note !== null && !finished && (
          <Text dimColor wrap="truncate-end">
            ▸ {job.note}
          </Text>
        )}
        {showSteps && view.before > 0 && <Text dimColor>  ↑ {view.before} earlier</Text>}
        {showSteps &&
          view.rows.map(({ item, index }) => (
            <Text
              key={`${index}-${item.title}`}
              dimColor={item.status !== 'in_progress'}
              wrap="truncate-end"
            >
              <Text
                color={
                  item.status === 'completed' ? 'success' : item.status === 'in_progress' ? 'claude' : undefined
                }
              >
                {item.status === 'completed' ? '✓' : item.status === 'in_progress' ? '▸' : '○'}
              </Text>{' '}
              <Text bold={item.status === 'in_progress'}>{item.title}</Text>
            </Text>
          ))}
        {showSteps && view.after > 0 && <Text dimColor>  ↓ {view.after} more</Text>}
        {job.items.length === 0 && job.note !== null && !finished && (
          <Text dimColor wrap="truncate-end">
            ▸ {job.note}
          </Text>
        )}
        <Box justifyContent="space-between" gap={2}>
          <Text wrap="truncate-end">
            {usage.length === 0 && active === null && <Text dimColor>usage: n/a</Text>}
            {usage.map(u => (
              <Text key={u.label}>
                <Text dimColor>{u.label} </Text>
                <Text color={u.color}>{u.pct}%</Text>
                {u.reset !== null && <Text dimColor> ({u.reset})</Text>}
                <Text dimColor> · </Text>
              </Text>
            ))}
            {active !== null && <Text dimColor>{shortModel(active)}</Text>}
          </Text>
          <Box gap={1}>
            {toggle}
            {hide}
          </Box>
        </Box>
      </Box>
    )
  })
}

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { CurrentModel, Limit, ModelTotals, Sample, Task } from '../types'
import {
  burnRate,
  dayKey,
  emptyTotals,
  estimateCostUsd,
  estimateEta,
  exhaustionAt,
  formatDuration,
  formatTokens,
  lastSevenDays,
  paneBarWidth,
  limitRisk,
  pushSample,
  reduceTasks,
  shortModel,
  smoothBar,
  themeColor,
  topModel,
  totalTokens,
  weekdayLabel,
} from './usage'

const PANE = 'usage-dashboard'
const STORE_KEY = 'usage-dashboard.v1'
const REFRESH_MS = 30_000

const tasks = atom({ plugin: 'usage-dashboard', key: 'tasks' } as const, [] as Task[])
const models = atom({ plugin: 'usage-dashboard', key: 'models' } as const, {} as Record<string, ModelTotals>)
const days = atom({ plugin: 'usage-dashboard', key: 'days' } as const, {} as Record<string, number>)
const durations = atom({ plugin: 'usage-dashboard', key: 'durations' } as const, [] as number[])
const samples = atom({ plugin: 'usage-dashboard', key: 'samples' } as const, [] as Sample[])
const limits = atom({ plugin: 'usage-dashboard', key: 'limits' } as const, [] as Limit[])
const current = atom({ plugin: 'usage-dashboard', key: 'current' } as const, null as CurrentModel | null)
const costUsd = atom({ plugin: 'usage-dashboard', key: 'costUsd' } as const, null as number | null)
const refreshedAt = atom({ plugin: 'usage-dashboard', key: 'refreshedAt' } as const, 0)

type Persisted = {
  models: Record<string, ModelTotals>
  days: Record<string, number>
  durations: number[]
}



async function persist($: EngineInterface) {
  const snapshot: Persisted = {
    models: await read($, models),
    days: await read($, days),
    durations: await read($, durations),
  }
  await $.store.set(STORE_KEY, snapshot)
}

async function statusLine($: EngineInterface) {
  const list = await read($, limits)
  const five = list.find(l => l.kind === 'five_hour')
  const week = list.find(l => l.kind === 'seven_day')
  const now = await read($, current)
  const parts: string[] = []
  if (five) parts.push(`5h ${Math.round(five.percentUsed)}%`)
  if (week) parts.push(`wk ${Math.round(week.percentUsed)}%`)
  if (now) parts.push(shortModel(now.model))
  $.ui.status(parts.length === 0 ? undefined : parts.join(' · '))
}

async function refreshLimits($: EngineInterface) {
  const usage = await $.session.usage()
  const list: Limit[] = usage.rateLimits.map(l => ({
    kind: l.kind,
    percentUsed: l.percentUsed,
    resetsAt: l.resetsAt ?? null,
  }))
  const t = await $.clock.now()
  await update($, limits, () => list)
  await update($, costUsd, () => usage.cost?.usd ?? null)
  await update($, refreshedAt, () => t)

  const five = list.find(l => l.kind === 'five_hour')
  if (five) {
    await update($, samples, prev => pushSample(prev, { t, pct: five.percentUsed }))
  }
  await statusLine($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'usage-dashboard',
      description: 'Show the usage dashboard: 5h and weekly limits, models, tasks, ETA',
    })

    const saved = (await $.store.get(STORE_KEY)) as Persisted | undefined
    if (saved) {
      await update($, models, () => saved.models ?? {})
      await update($, days, () => saved.days ?? {})
      await update($, durations, () => saved.durations ?? [])
    }

    await refreshLimits($).catch(() => undefined)
    $.clock.every(REFRESH_MS, () => {
      void refreshLimits($).catch(() => undefined)
    })

    return next(e)
  })

  on('command.run', { command: 'usage-dashboard' }, async $ => {
    await refreshLimits($).catch(() => undefined)
    await $.ui.open({ id: PANE, title: 'Usage' })

    return { text: 'Usage dashboard opened.' }
  }).catch(() => ({ text: 'Usage dashboard could not open.' }))

  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const now = await $.clock.now()
    const prev = await read($, tasks)
    const { tasks: nextTasks, finishedMs } = reduceTasks(prev, e.todos, now)

    await update($, tasks, () => nextTasks)
    if (finishedMs.length > 0) {
      await update($, durations, list => [...list, ...finishedMs].slice(-200))
      await persist($)
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const usage = e.usage
    if (usage !== undefined) {
      const now = await $.clock.now()
      await update($, models, all => {
        const before = all[usage.model] ?? emptyTotals()
        return {
          ...all,
          [usage.model]: {
            input: before.input + usage.input_tokens,
            output: before.output + usage.output_tokens,
            cacheRead: before.cacheRead + usage.cache_read_input_tokens,
            cacheWrite: before.cacheWrite + usage.cache_creation_input_tokens,
            messages: before.messages + 1,
          },
        }
      })
      const spent =
        usage.input_tokens +
        usage.output_tokens +
        usage.cache_read_input_tokens +
        usage.cache_creation_input_tokens
      await update($, days, all => {
        const key = dayKey(now)
        return { ...all, [key]: (all[key] ?? 0) + spent }
      })
      await update($, current, () => ({ model: usage.model, at: now }))
      await persist($)
    }
    await refreshLimits($).catch(() => undefined)

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const now = await $.clock.now()
    const list = await read($, limits)
    const taskList = await read($, tasks)
    const modelMap = await read($, models)
    const dayMap = await read($, days)
    const finished = await read($, durations)
    const sampleList = await read($, samples)
    const cur = await read($, current)
    const cost = await read($, costUsd)
    const updated = await read($, refreshedAt)

    const five = list.find(l => l.kind === 'five_hour')
    const week = list.find(l => l.kind === 'seven_day')
    const fiveReset = five?.resetsAt ? Date.parse(five.resetsAt) : null
    const weekReset = week?.resetsAt ? Date.parse(week.resetsAt) : null
    const width = paneBarWidth(e.props.bodyColumns ?? e.viewport?.columns)

    const firstSeen = taskList.length > 0 ? Math.min(...taskList.map(t => t.seenAt)) : now
    const doneCount = taskList.filter(t => t.status === 'completed').length
    const fallbackMs = doneCount > 0 ? (now - firstSeen) / doneCount : 10 * 60_000
    const eta = estimateEta(taskList, finished, fallbackMs)

    const rate = burnRate(sampleList)
    const exhaustion = five ? exhaustionAt(five.percentUsed, rate, now) : null
    const risk = five ? limitRisk(five.percentUsed, exhaustion, fiveReset, eta.likelyMs, now) : 'green'
    const riskColor = { green: 'success', amber: 'warning', red: 'error' } as const

    const top = topModel(modelMap)
    const rows = Object.entries(modelMap)
      .map(([model, m]) => ({ model, m, tokens: totalTokens(m) }))
      .sort((a, b) => b.tokens - a.tokens)
    const sum = rows.reduce((acc, r) => acc + r.tokens, 0)
    const week7 = lastSevenDays(dayMap, now)
    const weekMax = Math.max(1, ...week7.map(d => d.tokens))
    const today = dayKey(now)
    const nameWidth = Math.max(8, ...rows.map(r => shortModel(r.model).length))

    const inProgress = taskList.filter(t => t.status === 'in_progress')
    const pending = taskList.filter(t => t.status === 'pending')
    const startOfDay = new Date(today).getTime()
    const doneToday = taskList.filter(t => t.completedAt !== null && t.completedAt >= startOfDay)

    const gauge = (title: string, limit: typeof five, reset: number | null, extra: string | null) => {
      if (!limit) {
        return (
          <Box flexDirection="column" borderStyle="round" borderColor="inactive" paddingX={1}>
            <Text bold>{title}</Text>
            <Text dimColor>No reading yet. It appears after the first reply.</Text>
          </Box>
        )
      }
      const pct = Math.max(0, Math.min(100, limit.percentUsed))
      const color = themeColor(pct)
      const track = smoothBar(pct, width)
      return (
        <Box flexDirection="column" borderStyle="round" borderColor={color} paddingX={1}>
          <Box justifyContent="space-between" gap={2}>
            <Text bold>{title}</Text>
            <Text dimColor>{reset !== null ? `resets in ${formatDuration(reset - now)}` : ''}</Text>
          </Box>
          <Text>
            <Text color={color}>{track.filled}</Text>
            <Text dimColor>{track.empty}</Text>
            <Text bold color={color}>
              {'  '}
              {Math.round(pct)}%
            </Text>
          </Text>
          {extra !== null && <Text dimColor>{extra}</Text>}
        </Box>
      )
    }

    const burn =
      rate > 0
        ? `burning ${rate.toFixed(2)}%/min${exhaustion !== null ? ` · full in ~${formatDuration(exhaustion - now)}` : ''}`
        : 'burn rate shows after a few replies'

    return (
      <Box flexDirection="column">
        <Box justifyContent="space-between">
          <Text bold color="claude">
            Claude usage
          </Text>
          <Text dimColor>
            {updated > 0 ? `updated ${formatDuration(now - updated)} ago` : 'waiting for first reply'}
          </Text>
        </Box>

        {gauge('5-hour session', five, fiveReset, burn)}
        {gauge('Weekly', week, weekReset, null)}

        <Text>
          <Text color={riskColor[risk]}>● </Text>
          <Text bold>Limit risk </Text>
          <Text color={riskColor[risk]}>{risk}</Text>
          {cost !== null && <Text dimColor>{`   session cost ~$${cost.toFixed(2)}`}</Text>}
        </Text>

        <Box flexDirection="column" borderStyle="round" borderColor="inactive" paddingX={1}>
          <Box justifyContent="space-between">
            <Text bold>Models</Text>
            <Text dimColor>
              {cur ? `active: ${shortModel(cur.model)} (${formatDuration(now - cur.at)} ago)` : 'active: n/a'}
            </Text>
          </Box>
          {rows.length === 0 && <Text dimColor>No turns recorded yet.</Text>}
          {rows.map(r => {
            const share = sum > 0 ? (r.tokens / sum) * 100 : 0
            const mini = smoothBar(share, 10)
            const isTop = top?.model === r.model
            return (
              <Text key={r.model} wrap="truncate-end">
                <Text color={isTop ? 'claude' : undefined}>{isTop ? '★ ' : '  '}</Text>
                <Text bold={isTop}>{shortModel(r.model).padEnd(nameWidth)}</Text>
                <Text color={isTop ? 'claude' : undefined}>{` ${mini.filled}`}</Text>
                <Text dimColor>{mini.empty}</Text>
                <Text>{` ${String(Math.round(share)).padStart(3)}%`}</Text>
                <Text dimColor>
                  {`  ${formatTokens(r.tokens).padStart(6)}  ${String(r.m.messages).padStart(3)} msgs  ~$${estimateCostUsd(r.model, r.m).toFixed(2)}`}
                </Text>
              </Text>
            )
          })}
          {rows.length > 0 && (
            <Text dimColor>
              tokens: in / out / cache = {formatTokens(rows.reduce((a, r) => a + r.m.input, 0))} /{' '}
              {formatTokens(rows.reduce((a, r) => a + r.m.output, 0))} /{' '}
              {formatTokens(rows.reduce((a, r) => a + r.m.cacheRead + r.m.cacheWrite, 0))}
            </Text>
          )}
        </Box>

        <Box flexDirection="column" borderStyle="round" borderColor="inactive" paddingX={1}>
          <Text>
            <Text bold>Tasks </Text>
            <Text color="claude">{`▸ ${inProgress.length} in progress`}</Text>
            <Text dimColor>{`   ○ ${pending.length} pending`}</Text>
            <Text color="success">{`   ✓ ${doneToday.length} today`}</Text>
          </Text>
          {taskList.length === 0 && <Text dimColor>No todo list yet.</Text>}
          {inProgress.map(t => (
            <Text key={`ip-${t.content}`} wrap="truncate-end">
              <Text color="claude">▸ </Text>
              <Text bold>{t.activeForm}</Text>
              <Text dimColor>{t.startedAt !== null ? `  ${formatDuration(now - t.startedAt)}` : ''}</Text>
            </Text>
          ))}
          {pending.slice(0, 6).map(t => (
            <Text key={`p-${t.content}`} dimColor wrap="truncate-end">
              ○ {t.content}
            </Text>
          ))}
          {pending.length > 6 && <Text dimColor>… {pending.length - 6} more pending</Text>}
          {eta.remaining > 0 && (
            <Text>
              <Text dimColor>Time left </Text>
              <Text bold>{formatDuration(eta.likelyMs)}</Text>
              <Text dimColor>
                {` (best case ${formatDuration(eta.optimisticMs)}) · confidence ${eta.confidence}, ${finished.length} finished`}
              </Text>
            </Text>
          )}
          {eta.remaining > 0 && five && (
            <Text color={riskColor[risk]}>
              {risk === 'red'
                ? 'Likely to hit the 5h limit before these tasks finish.'
                : risk === 'amber'
                  ? 'Close to the 5h limit for this much work.'
                  : 'Should finish within the current 5h window.'}
            </Text>
          )}
        </Box>

        <Box flexDirection="column" borderStyle="round" borderColor="inactive" paddingX={1}>
          <Text bold>Last 7 days</Text>
          {week7.map(d => {
            const track = smoothBar((d.tokens / weekMax) * 100, Math.max(10, width - 6))
            const isToday = d.day === today
            return (
              <Text key={d.day} dimColor={d.tokens === 0}>
                <Text bold={isToday}>{`${weekdayLabel(d.day)} ${d.day.slice(8)} `}</Text>
                <Text color={isToday ? 'claude' : undefined}>{track.filled}</Text>
                <Text dimColor>{track.empty}</Text>
                <Text>{`  ${formatTokens(d.tokens)}`}</Text>
              </Text>
            )
          })}
        </Box>
      </Box>
    )
  })
}

import { expect, test } from 'claude-code/testing'

import {
  applyReport,
  applyTodos,
  bar,
  barWidth,
  elapsed,
  etaLeft,
  gaugeColor,
  percent,
  shortModel,
  smoothBar,
  usageParts,
  windowItems,
} from './progress'

test('report keeps unspecified fields and clamps done to total', () => {
  const a = applyReport(null, { title: 'Build', total: 4 }, 100)
  expect(a.title).toBe('Build')
  expect(a.total).toBe(4)
  expect(a.done).toBe(0)

  const b = applyReport(a, { done: 9, note: 'Writing tests' }, 200)
  expect(b.title).toBe('Build')
  expect(b.done).toBe(4)
  expect(b.note).toBe('Writing tests')
  expect(b.startedAt).toBe(100)
})

test('items drive total and done', () => {
  const f = applyReport(
    null,
    { title: 'Ship', items: [{ title: 'a', status: 'completed' }, { title: 'b' }, { title: 'c', status: 'in_progress' }] },
    1,
  )
  expect(f.total).toBe(3)
  expect(f.done).toBe(1)
})

test('todos follow the list, note is the in-progress step, finish is detected', () => {
  const t1 = applyTodos(
    null,
    [
      { content: 'A', activeForm: 'Doing A', status: 'completed' },
      { content: 'B', activeForm: 'Doing B', status: 'in_progress' },
    ],
    10,
  )
  expect(t1?.done).toBe(1)
  expect(t1?.note).toBe('Doing B')
  expect(t1?.isFinished).toBe(false)

  const t2 = applyTodos(
    t1,
    [
      { content: 'A', activeForm: 'Doing A', status: 'completed' },
      { content: 'B', activeForm: 'Doing B', status: 'completed' },
    ],
    20,
  )
  expect(t2?.isFinished).toBe(true)
  expect(t2?.note).toBeNull()
  expect(applyTodos(t2, [], 30)).toBeNull()
})

test('a finished flow is replaced by a new report, not extended', () => {
  const done = applyReport(null, { title: 'Old', total: 2, done: 2, finished: true }, 1)
  expect(done.isFinished).toBe(true)
  const next = applyReport(done, { title: 'New', total: 5 }, 2)
  expect(next.title).toBe('New')
  expect(next.done).toBe(0)
  expect(next.isFinished).toBe(false)
})

test('percent, bar and elapsed format', () => {
  expect(percent({ total: 4, done: 1 })).toBe(25)
  expect(percent({ total: 0, done: 3 })).toBe(0)
  expect(bar(50, 10)).toBe('█████░░░░░')
  expect(elapsed(7_000)).toBe('7s')
  expect(elapsed(125_000)).toBe('2m 5s')
})

test('smoothBar uses eighth blocks and keeps the width', () => {
  const half = smoothBar(50, 10)
  expect(half.filled).toBe('█████')
  expect(half.empty).toBe('░░░░░')

  const odd = smoothBar(55, 10)
  expect(odd.filled).toBe('█████▌')
  expect((odd.filled + odd.empty).length).toBe(10)
  expect(smoothBar(0, 4).filled).toBe('')
  expect(smoothBar(100, 4).empty).toBe('')
})

test('etaLeft needs a finished step and averages the time per step', () => {
  const flow = { total: 4, done: 2, startedAt: 0, isFinished: false }
  expect(etaLeft({ ...flow, done: 0 }, 60_000)).toBeNull()
  expect(etaLeft(flow, 120_000)).toBe(120_000)
  expect(etaLeft({ ...flow, isFinished: true }, 120_000)).toBeNull()
})

test('windowItems follows the current step and reports what is cut', () => {
  const items = Array.from({ length: 8 }, (_, i) => ({
    title: `s${i}`,
    status: i < 5 ? ('completed' as const) : i === 5 ? ('in_progress' as const) : ('pending' as const),
  }))
  const w = windowItems(items, 4)
  expect(w.rows.map(r => r.index)).toEqual([4, 5, 6, 7])
  expect(w.before).toBe(4)
  expect(w.after).toBe(0)
  expect(windowItems(items.slice(0, 3), 5).rows).toHaveLength(3)
})

test('gauge colours follow the 60 / 85 thresholds', () => {
  expect(gaugeColor(59)).toBe('success')
  expect(gaugeColor(60)).toBe('warning')
  expect(gaugeColor(86)).toBe('error')
})

test('usageParts orders 5h then weekly and formats the reset', () => {
  const now = Date.parse('2026-10-12T10:00:00Z')
  const parts = usageParts(
    [
      { kind: 'seven_day', percentUsed: 12.4, resetsAt: null },
      { kind: 'five_hour', percentUsed: 34.6, resetsAt: '2026-10-12T12:10:00Z' },
      { kind: 'spend_limit', percentUsed: 5, resetsAt: null },
    ],
    now,
  )
  expect(parts.map(p => p.label)).toEqual(['5h', 'wk'])
  expect(parts[0].pct).toBe(35)
  expect(parts[0].reset).toBe('2h 10m')
  expect(parts[1].reset).toBeNull()
  expect(usageParts([], now)).toEqual([])
})

test('barWidth fits the terminal and shortModel drops the prefix', () => {
  expect(barWidth(undefined)).toBe(60)
  expect(barWidth(30)).toBe(24)
  expect(barWidth(10)).toBe(12)
  expect(barWidth(200)).toBe(60)
  expect(shortModel('claude-opus-5-5')).toBe('opus-5-5')
})

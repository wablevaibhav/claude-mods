import { expect, test } from 'claude-code/testing'

import {
  burnRate,
  estimateEta,
  exhaustionAt,
  gaugeColor,
  limitRisk,
  percentile,
  pushSample,
  reduceTasks,
  topModel,
} from './usage'

const MIN = 60_000

test('reduceTasks stamps start and completion and reports durations', () => {
  const t0 = 1_000_000
  const a = reduceTasks([], [{ content: 'A', activeForm: 'Doing A', status: 'in_progress' }], t0)
  expect(a.tasks[0].startedAt).toBe(t0)
  expect(a.finishedMs).toEqual([])

  const b = reduceTasks(a.tasks, [{ content: 'A', activeForm: 'Doing A', status: 'completed' }], t0 + 5 * MIN)
  expect(b.tasks[0].completedAt).toBe(t0 + 5 * MIN)
  expect(b.finishedMs).toEqual([5 * MIN])

  const c = reduceTasks(b.tasks, [{ content: 'A', activeForm: 'Doing A', status: 'completed' }], t0 + 9 * MIN)
  expect(c.finishedMs).toEqual([])
})

test('estimateEta uses median of history and falls back without it', () => {
  const open = [
    { content: 'x', activeForm: 'x', status: 'pending' as const, seenAt: 0, startedAt: null, completedAt: null },
    { content: 'y', activeForm: 'y', status: 'in_progress' as const, seenAt: 0, startedAt: 1, completedAt: null },
  ]
  const withHistory = estimateEta(open, [2 * MIN, 4 * MIN, 6 * MIN], 10 * MIN)
  expect(withHistory.likelyMs).toBe(2 * 4 * MIN)
  expect(withHistory.confidence).toBe('medium')

  const noHistory = estimateEta(open, [], 10 * MIN)
  expect(noHistory.likelyMs).toBe(2 * 10 * MIN)
  expect(noHistory.confidence).toBe('low')
})

test('percentile interpolates', () => {
  expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5)
  expect(percentile([], 0.5)).toBe(0)
})

test('burn rate, reset handling and exhaustion projection', () => {
  let s = pushSample([], { t: 0, pct: 10 })
  s = pushSample(s, { t: 10 * MIN, pct: 20 })
  expect(burnRate(s)).toBe(1)
  expect(exhaustionAt(20, 1, 10 * MIN)).toBe(10 * MIN + 80 * MIN)

  const afterReset = pushSample(s, { t: 11 * MIN, pct: 2 })
  expect(afterReset).toHaveLength(1)
  expect(exhaustionAt(2, 0, 0)).toBeNull()
})

test('gauge thresholds and limit risk', () => {
  expect(gaugeColor(59)).toBe('green')
  expect(gaugeColor(60)).toBe('yellow')
  expect(gaugeColor(86)).toBe('red')

  const now = 0
  expect(limitRisk(50, 30 * MIN, 5 * 60 * MIN, 60 * MIN, now)).toBe('red')
  expect(limitRisk(90, null, null, 0, now)).toBe('amber')
  expect(limitRisk(30, null, null, 20 * MIN, now)).toBe('green')
})

test('topModel picks the largest consumer and its share', () => {
  const m = (n: number) => ({ input: n, output: 0, cacheRead: 0, cacheWrite: 0, messages: 1 })
  const top = topModel({ 'claude-sonnet-5-5': m(30), 'claude-opus-5-5': m(70) })
  expect(top?.model).toBe('claude-opus-5-5')
  expect(top?.share).toBe(0.7)
  expect(topModel({})).toBeNull()
})

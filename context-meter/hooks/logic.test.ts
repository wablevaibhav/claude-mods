import { expect, test } from 'claude-code/testing'

import { advice, bar, formatTokens, levelFor, risen } from './logic'

test('levels switch at 70 and 90', () => {
  expect(levelFor(69)).toBe('ok')
  expect(levelFor(70)).toBe('warn')
  expect(levelFor(89)).toBe('warn')
  expect(levelFor(90)).toBe('high')
})

test('risen only reports a climb into a higher level', () => {
  expect(risen('ok', 72)).toBe('warn')
  expect(risen('warn', 75)).toBeNull()
  expect(risen('warn', 93)).toBe('high')
  expect(risen('high', 95)).toBeNull()
  expect(risen('high', 40)).toBeNull()
  expect(risen('ok', 10)).toBeNull()
})

test('bar and token formatting', () => {
  expect(bar(50, 10)).toBe('█████░░░░░')
  expect(bar(150, 4)).toBe('████')
  expect(formatTokens(900)).toBe('900')
  expect(formatTokens(156_000)).toBe('156k')
  expect(formatTokens(1_000_000)).toBe('1.0M')
})

test('advice is empty when the level is ok', () => {
  expect(advice('ok')).toBe('')
  expect(advice('warn')).toContain('/compact')
  expect(advice('high')).toContain('now')
})

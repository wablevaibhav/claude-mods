import { expect, test } from 'claude-code/testing'

import { isClean, parseStatus } from './parse'

const SAMPLE = [
  '# branch.oid 1234567',
  '# branch.head feature/login',
  '# branch.upstream origin/feature/login',
  '# branch.ab +2 -1',
  '1 M. N... 100644 100644 100644 aaa bbb src/a.ts',
  '1 .M N... 100644 100644 100644 aaa bbb src/b.ts',
  '1 MM N... 100644 100644 100644 aaa bbb src/c.ts',
  '2 R. N... 100644 100644 100644 aaa bbb R100 new.ts\told.ts',
  'u UU N... 100644 100644 100644 100644 a b c conflict.ts',
  '? notes.txt',
  '? scratch/',
].join('\n')

test('parses branch, ahead/behind and file counts', () => {
  const s = parseStatus(SAMPLE)
  expect(s?.branch).toBe('feature/login')
  expect(s?.upstream).toBe('origin/feature/login')
  expect(s?.ahead).toBe(2)
  expect(s?.behind).toBe(1)
  expect(s?.staged).toBe(3)
  expect(s?.changed).toBe(2)
  expect(s?.conflicts).toBe(1)
  expect(s?.untracked).toBe(2)
})

test('clean repo and detached head', () => {
  const clean = parseStatus('# branch.oid abc\n# branch.head main\n')
  expect(clean).not.toBeNull()
  expect(clean && isClean(clean)).toBe(true)
  expect(clean?.upstream).toBeNull()

  const detached = parseStatus('# branch.oid abc\n# branch.head (detached)\n')
  expect(detached?.isDetached).toBe(true)
})

test('non-repo output parses to null', () => {
  expect(parseStatus('')).toBeNull()
  expect(parseStatus('fatal: not a git repository')).toBeNull()
})

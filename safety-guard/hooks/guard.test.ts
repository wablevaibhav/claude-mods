import { expect, test } from 'claude-code/testing'

test('the guard denies a destructive Bash call and lets a normal one through', async ($, on) => {
  on('tool.call', () => ({ result: { stdout: 'ran', stderr: '', interrupted: false } }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)

  const blocked = await $.tool.call({
    tool: 'Bash',
    tool_use_id: 't1',
    command: 'rm -rf /',
  } as never)
  expect(blocked.deny).toBeDefined()

  const allowed = await $.tool.call({
    tool: 'Bash',
    tool_use_id: 't2',
    command: 'npm test',
  } as never)
  expect(allowed.deny).toBeUndefined()
})

test('the guard denies writes to .env but not to normal files', async ($, on) => {
  on('tool.call', () => ({ result: { filePath: 'x' } }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)

  const env = await $.tool.call({
    tool: 'Write',
    tool_use_id: 'w1',
    file_path: '/app/.env',
    content: 'SECRET=1',
  } as never)
  expect(env.deny).toBeDefined()

  const ok = await $.tool.call({
    tool: 'Write',
    tool_use_id: 'w2',
    file_path: '/app/src/index.ts',
    content: 'export {}',
  } as never)
  expect(ok.deny).toBeUndefined()
})

import type { EngineInterface, Register } from 'claude-code'

import { empty, openCount, runNote, runTodo } from './lists'
import type { Data } from './lists'

const KEY = 'notes-todos.v1'

async function load($: EngineInterface): Promise<Data> {
  const saved = (await $.store.get(KEY)) as Data | undefined
  return saved && Array.isArray(saved.todos) && Array.isArray(saved.notes) ? saved : empty()
}

async function showCount($: EngineInterface, data: Data) {
  const open = openCount(data)
  $.ui.status(open > 0 ? `todo ${open}` : undefined)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'mytodo',
      description: 'Your own todo list: /mytodo [add <text> | done <id> | undo <id> | rm <id> | clear]',
    })
    await $.command.register({
      name: 'mynote',
      description: 'Your own notes: /mynote [<text> | rm <id> | find <text>]',
    })
    await showCount($, await load($)).catch(() => undefined)

    return next(e)
  })

  on('command.run', { command: 'mytodo' }, async ($, e) => {
    const now = await $.clock.now()
    const { data, text } = runTodo(await load($), e.args, now)
    await $.store.set(KEY, data)
    await showCount($, data)

    return { text }
  }).catch(() => ({ text: 'Todo list unavailable.' }))

  on('command.run', { command: 'mynote' }, async ($, e) => {
    const now = await $.clock.now()
    const { data, text } = runNote(await load($), e.args, now)
    await $.store.set(KEY, data)

    return { text }
  }).catch(() => ({ text: 'Notes unavailable.' }))
}

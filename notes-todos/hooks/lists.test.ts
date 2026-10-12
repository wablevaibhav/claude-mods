import { expect, test } from 'claude-code/testing'

import { empty, openCount, runNote, runTodo } from './lists'

test('todos: add, done, undo, rm and clear', () => {
  let d = empty()
  d = runTodo(d, 'add Buy milk', 1).data
  d = runTodo(d, 'Call the bank', 2).data
  expect(d.todos.map(t => t.text)).toEqual(['Buy milk', 'Call the bank'])
  expect(openCount(d)).toBe(2)

  d = runTodo(d, 'done 1', 3).data
  expect(openCount(d)).toBe(1)
  d = runTodo(d, 'undo #1', 4).data
  expect(openCount(d)).toBe(2)
  d = runTodo(d, 'done 2', 5).data
  d = runTodo(d, 'clear', 6).data
  expect(d.todos.map(t => t.id)).toEqual([1])
  d = runTodo(d, 'rm 1', 7).data
  expect(d.todos).toEqual([])
})

test('todos: bad ids and empty input do not change data', () => {
  const d = runTodo(empty(), 'add Task', 1).data
  expect(runTodo(d, 'done 99', 2).data).toEqual(d)
  expect(runTodo(d, 'done abc', 2).text).toContain('No todo')
  expect(runTodo(d, 'add', 2).text).toContain('Usage')
  expect(runTodo(d, '', 2).text).toContain('[ ] #1 Task')
})

test('notes: save, list, find and remove, ids shared with todos', () => {
  let d = empty()
  d = runTodo(d, 'add one', 1).data
  const saved = runNote(d, 'Wifi password is on the fridge', 2)
  d = saved.data
  expect(saved.text).toBe('Saved #2.')
  expect(runNote(d, 'find wifi', 3).text).toContain('#2')
  expect(runNote(d, 'find nothing', 3).text).toContain('No notes')
  d = runNote(d, 'rm 2', 4).data
  expect(d.notes).toEqual([])
})

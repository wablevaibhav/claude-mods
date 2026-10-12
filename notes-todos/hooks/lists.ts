export type Todo = { id: number; text: string; done: boolean; at: number }
export type Note = { id: number; text: string; at: number }
export type Data = { todos: Todo[]; notes: Note[]; nextId: number }

export const empty = (): Data => ({ todos: [], notes: [], nextId: 1 })

export const openCount = (data: Data): number => data.todos.filter(t => !t.done).length

const split = (args: string): { verb: string; rest: string } => {
  const trimmed = args.trim()
  const space = trimmed.search(/\s/)
  return space < 0
    ? { verb: trimmed.toLowerCase(), rest: '' }
    : { verb: trimmed.slice(0, space).toLowerCase(), rest: trimmed.slice(space + 1).trim() }
}

const parseId = (text: string): number | null => {
  const n = Number(text.replace(/^#/, ''))
  return Number.isInteger(n) && n > 0 ? n : null
}

export const renderTodos = (todos: readonly Todo[]): string => {
  if (todos.length === 0) return 'No todos. Add one with /mytodo add <text>.'
  const open = todos.filter(t => !t.done)
  const done = todos.filter(t => t.done)
  const line = (t: Todo) => `${t.done ? '[x]' : '[ ]'} #${t.id} ${t.text}`
  return [...open.map(line), ...(done.length > 0 ? ['', ...done.map(line)] : [])].join('\n')
}

export const renderNotes = (notes: readonly Note[]): string =>
  notes.length === 0
    ? 'No notes. Add one with /mynote <text>.'
    : notes.map(n => `#${n.id} ${n.text}`).join('\n')

/** One /mytodo command: returns the new data and the text to show. */
export const runTodo = (data: Data, args: string, now: number): { data: Data; text: string } => {
  const { verb, rest } = split(args)

  if (verb === '' || verb === 'list') return { data, text: renderTodos(data.todos) }

  if (verb === 'done' || verb === 'undo' || verb === 'rm') {
    const id = parseId(rest)
    const target = id === null ? undefined : data.todos.find(t => t.id === id)
    if (id === null || target === undefined) return { data, text: `No todo ${rest || '(missing id)'}.` }
    if (verb === 'rm') {
      const next = { ...data, todos: data.todos.filter(t => t.id !== id) }
      return { data: next, text: `Removed #${id}.\n${renderTodos(next.todos)}` }
    }
    const next = {
      ...data,
      todos: data.todos.map(t => (t.id === id ? { ...t, done: verb === 'done' } : t)),
    }
    return { data: next, text: renderTodos(next.todos) }
  }

  if (verb === 'clear') {
    const next = { ...data, todos: data.todos.filter(t => !t.done) }
    return { data: next, text: `Cleared finished todos.\n${renderTodos(next.todos)}` }
  }

  const text = verb === 'add' ? rest : args.trim()
  if (text === '') return { data, text: 'Usage: /mytodo add <text>' }
  const todo: Todo = { id: data.nextId, text, done: false, at: now }
  const next = { ...data, todos: [...data.todos, todo], nextId: data.nextId + 1 }
  return { data: next, text: `Added #${todo.id}.\n${renderTodos(next.todos)}` }
}

/** One /mynote command. */
export const runNote = (data: Data, args: string, now: number): { data: Data; text: string } => {
  const { verb, rest } = split(args)

  if (verb === '' || verb === 'list') return { data, text: renderNotes(data.notes) }

  if (verb === 'rm') {
    const id = parseId(rest)
    if (id === null || !data.notes.some(n => n.id === id)) {
      return { data, text: `No note ${rest || '(missing id)'}.` }
    }
    const next = { ...data, notes: data.notes.filter(n => n.id !== id) }
    return { data: next, text: `Removed #${id}.\n${renderNotes(next.notes)}` }
  }

  if (verb === 'find') {
    const q = rest.toLowerCase()
    const hits = data.notes.filter(n => n.text.toLowerCase().includes(q))
    return { data, text: q === '' ? 'Usage: /mynote find <text>' : renderNotes(hits) }
  }

  const text = verb === 'add' ? rest : args.trim()
  if (text === '') return { data, text: 'Usage: /mynote <text>' }
  const note: Note = { id: data.nextId, text, at: now }
  const next = { ...data, notes: [...data.notes, note], nextId: data.nextId + 1 }
  return { data: next, text: `Saved #${note.id}.` }
}

import { expect, test } from 'claude-code/testing'

test('the usage pane draws the redesigned sections', async ($, on) => {
  on('clock.now', () => ({ value: Date.parse('2026-10-12T10:00:00Z') }) as never)

  const ui = await $.ui.mount({
    plugin: 'usage-dashboard',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'usage-dashboard',
    props: {
      title: 'Usage',
      isFocused: false,
      bodyColumns: 70,
      placement: 'dock',
      scroll: {},
      view: {},
    } as never,
    viewport: { columns: 120, rows: 40 } as never,
  })

  for (const heading of ['Claude usage', '5-hour session', 'Weekly', 'Models', 'Tasks', 'Last 7 days']) {
    expect(await ui.find({ text: heading })).toBeDefined()
  }
})

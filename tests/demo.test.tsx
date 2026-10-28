import { expect, mock, test } from 'claude-code/testing'

const SIDEBAR = {
  plugin: 'mission-crew',
  component: 'Pane',
  requestId: 'mission-crew',
  props: {
    title: 'Claude Crew',
    isFocused: false,
    bodyColumns: 50,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

const RAN = { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }

test('the demo mission times its whole run and counts all its tokens', async ($, on) => {
  on('command.register', () => ({ value: { command: 'crew' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('process.run', () => ({ value: RAN }))
  on('ui.notify', () => ({ value: { isSent: true, channel: 'terminal_bell' } }))
  mock.store(on)
  const clock = mock.clock(on, { now: 1_000_000 })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  await $.command.run({
    command: 'crew',
    args: 'demo',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 100 },
  })
  // The demo ends on its 31st tick, 700 ms apart: 21.7 s.
  await clock.advance(25_000)

  const ui = await $.ui.mount({ ...SIDEBAR, surface: 'desktop' })
  const lines = (await ui.findAll({ type: 'Text' })).map(one => one.text)
  // The mission's line: its whole run, frozen at the end, and every request's tokens.
  expect(lines.some(line => /^  2[12]s · \d+\.\dk tokens$/.test(line))).toBe(true)
  await ui.unmount()
})

import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'mission-crew',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: {
    hasSurvey: false,
    isWorking: true,
    maxRows: 20,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

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

// What a host command answers when the jingle plays.
const RAN = { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }

const SPAWN = {
  tool_use_id: 'toolu_1',
  prompt: 'Look around',
  description: 'Map the codebase',
  subagentType: 'Explore',
  provider: { plugin: 'engine', tier: 'core' },
  parentModel: 'test',
  background: false,
  fork: false,
} as const

test('a todo list fills the mission bar above the prompt', async ($, on) => {
  // Nothing sits beneath the plugin: each hook here stands for the engine.
  on('tool.call', () => ({ result: {} }))

  await $.tool.call({
    tool: 'TodoWrite',
    todos: [
      { content: 'Plan it', status: 'completed', activeForm: 'Planning it' },
      { content: 'Build it', status: 'in_progress', activeForm: 'Building it' },
      { content: 'Ship it', status: 'pending', activeForm: 'Shipping it' },
    ],
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  // 1 done and 0.4 of one under way, of 3: 47%.
  expect(await ui.find({ type: 'Text', text: '47%' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Build it' })).toBeDefined()
  // The bar shows how far along the plan is: no step count beside it.
  expect(await ui.find({ type: 'Text', text: /step \d+ of/})).toBeUndefined()
  // At 100 columns the bar is 45 segments, 21 of them filled; the rest are the
  // same glyph drawn dim, so both parts measure alike and stay on one line.
  const parts = (await ui.findAll({ type: 'Text', text: /^▰+$/ })).map(part => part.text.length)
  expect(parts).toEqual([21, 24])
  // No crew yet, so nothing to click.
  expect(await ui.find({ key: 'crew-button' })).toBeUndefined()
  await ui.unmount()

  const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await terminal.find({ type: 'Text', text: /47%/ })).toBeDefined()
  await terminal.unmount()
})

test("the desktop's task list advances", async ($, on) => {
  on('tool.call', () => ({ result: {} }))

  await $.tool.call({
    tool: 'mcp__ccd_turn__update_plan',
    items: [
      { content: 'One', status: 'in_progress' },
      { content: 'Two', status: 'pending' },
    ],
  })
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', advance: true })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: 'Two' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '70%' })).toBeDefined()
  await ui.unmount()
})

test('the band counts the crew, and a click opens the sidebar', async ($, on) => {
  const opened: string[] = []
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('agent.spawn', () => ({ model: 'test', agentId: 'a1' }))
  on('clock.now', () => ({ value: 1_000 }))
  on('tool.call', () => ({ result: {} }))

  await $.agent.spawn(SPAWN)

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ key: 'crew-button' }))?.text).toContain('1 agent working')
    // No emoji before the count: a pixel Claude at work stands there instead.
    expect((await ui.find({ key: 'crew-button' }))?.text).not.toContain('👥')
    // The band shows no crew member's picture: those are the sidebar's.
    expect((await ui.findAll({ type: 'Svg' })).some(svg => String(svg.props.alt).includes(' in a '))).toBe(false)
    await ui.press({ key: 'crew-button' })
    await ui.unmount()
  }
  expect(opened).toEqual(['mission-crew', 'mission-crew'])
})

test('the sidebar shows each agent in costume; only its words change as it works', async ($, on) => {
  on('agent.spawn', () => ({ model: 'test', agentId: 'a1' }))
  on('agent.list', () => ({ value: [] }))
  on('clock.now', () => ({ value: 1_000 }))
  on('tool.call', () => ({ result: {} }))

  await $.agent.spawn(SPAWN)
  await $.tool.call({ tool: 'Read', file_path: '/src/app/main.ts', agentId: 'a1' })

  let ui = await $.ui.mount({ ...SIDEBAR, surface: 'desktop' })
  expect(await ui.find({ key: 'crew-a1' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Map the codebase' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Reading main.ts' })).toBeDefined()
  const figure = await ui.find({ type: 'Svg' })
  await ui.unmount()

  // More work: the words and numbers move, the picture's markup does not.
  await $.tool.call({ tool: 'Grep', pattern: 'refresh', agentId: 'a1' })
  ui = await $.ui.mount({ ...SIDEBAR, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: 'Searching "refresh"' })).toBeDefined()
  expect((await ui.find({ type: 'Svg' }))?.props.source).toBe(figure?.props.source)
  await ui.unmount()

  const terminal = await $.ui.mount({ ...SIDEBAR, surface: 'terminal' })
  expect(await terminal.find({ type: 'Text', text: /Searching/ })).toBeDefined()
  await terminal.unmount()
})

test("the band's one Claude works, then cheers when the mission is done", async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  const items = (status: string) => [
    { content: 'One', status: 'completed' },
    { content: 'Two', status },
  ]

  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', items: items('in_progress') })
  let ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  let alts = (await ui.findAll({ type: 'Svg' })).map(svg => svg.props.alt)
  // One Claude in the band, and no other picture.
  expect(alts).toEqual(['Claude at work'])
  await ui.unmount()

  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', items: items('completed') })
  ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  alts = (await ui.findAll({ type: 'Svg' })).map(svg => svg.props.alt)
  expect(alts).toEqual(['Claude celebrating'])
  expect(await ui.find({ type: 'Text', text: 'MISSION COMPLETE!' })).toBeDefined()
  await ui.unmount()
})

test('with nothing to show the band stays out of the way', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  await ui.unmount()
})

test("an agent's own to-do list drives its bar and shows its step", async ($, on) => {
  on('agent.spawn', () => ({ model: 'test', agentId: 'a1' }))
  on('clock.now', () => ({ value: 1_000 }))
  on('tool.call', () => ({ result: {} }))
  mock.store(on)

  await $.agent.spawn(SPAWN)
  await $.tool.call({
    tool: 'TodoWrite',
    agentId: 'a1',
    todos: [
      { content: 'Find the files', status: 'completed', activeForm: 'Finding the files' },
      { content: 'Read them', status: 'in_progress', activeForm: 'Reading them' },
    ],
  })

  const ui = await $.ui.mount({ ...SIDEBAR, surface: 'desktop' })
  // 1 done and 0.4 of one under way, of 2: 70%, the list's and not a guess.
  expect(await ui.find({ type: 'Text', text: ' 70%' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Step 2/2: Read them' })).toBeDefined()
  await ui.unmount()

  // The agent's list is its own: the mission has no plan of its own yet.
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ type: 'Text', text: /Read them/ })).toBeUndefined()
  await band.unmount()
})

test("clicking an agent's name opens its transcript", async ($, on) => {
  const viewed: unknown[] = []
  on('agent.spawn', () => ({ model: 'test', agentId: 'a1' }))
  on('clock.now', () => ({ value: 1_000 }))
  on('ui.view', (_, e) => {
    viewed.push(e)
    return { value: {} }
  })
  mock.store(on)

  await $.agent.spawn(SPAWN)
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...SIDEBAR, surface })
    await ui.press({ key: 'watch-a1' })
    await ui.unmount()
  }
  expect(viewed).toEqual([{ agentId: 'a1' }, { agentId: 'a1' }])
})

test('a failed agent earns the rubber duck, and the collection shows it', async ($, on) => {
  const toasts: string[] = []
  on('agent.spawn', () => ({ model: 'test', agentId: 'a1' }))
  on('clock.now', () => ({ value: 1_000 }))
  on('ui.toast', (_, e) => {
    toasts.push(String(e.text))
    return { value: undefined }
  })
  on('process.run', () => ({ value: RAN }))
  on('command.register', () => ({ value: { command: 'crew' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.complete', () => ({ text: '' }))
  // What an earlier session kept: three agents hired, nothing earned yet.
  mock.store(on, { stats: { agents: 3, missions: 0, flawless: 0, failed: 0, shinies: 0, unlocked: [] } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  await $.agent.spawn(SPAWN)
  await $.turn.complete({ agentId: 'a1', turnId: 't1', answer: '', durationMs: 5, isAborted: true, reason: 'aborted' })

  expect(toasts.some(text => text.includes('rubber duck'))).toBe(true)

  const ui = await $.ui.mount({ ...SIDEBAR, requestId: 'mission-crew-hats', surface: 'desktop' })
  // The crew's one agent ended, so its mission ended too: counted, not flawless.
  expect(await ui.find({ type: 'Text', text: '4 agents hired · 1 missions · 0 flawless · 0 shiny' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '13 of 18 hats' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'rubber duck' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Hire 100 agents' })).toBeDefined()
  await ui.unmount()
})

test('a completed mission plays the jingle and says so once', async ($, on) => {
  const played: unknown[] = []
  const said: string[] = []
  on('tool.call', () => ({ result: {} }))
  on('process.run', (_, e) => {
    played.push(e)
    return { value: RAN }
  })
  on('ui.notify', (_, e) => {
    said.push(String(e.text))
    return { value: { isSent: false, reason: 'no-surface' } }
  })
  on('ui.toast', (_, e) => {
    said.push(`toast: ${String(e.text)}`)
    return { value: undefined }
  })
  mock.store(on)

  const done = [{ content: 'One', status: 'completed' }]
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', items: done })
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', items: done })

  expect(played).toHaveLength(1)
  expect(JSON.stringify(played[0])).toContain('mission-complete.wav')
  // No notification channel on the desktop: the toast says it instead.
  expect(said).toEqual(['Mission complete!', 'toast: Mission complete!'])

  // No crew, so the mission counts but is not a flawless one.
  const ui = await $.ui.mount({ ...SIDEBAR, requestId: 'mission-crew-hats', surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: '0 agents hired · 1 missions · 0 flawless · 0 shiny' })).toBeDefined()
  await ui.unmount()
})

test('with sound and notifications off the party is quiet', { options: { sound: false, notifications: false } }, async ($, on) => {
  const heard: unknown[] = []
  on('tool.call', () => ({ result: {} }))
  on('process.run', (_, e) => {
    heard.push(e)
    return { value: RAN }
  })
  on('ui.notify', (_, e) => {
    heard.push(e)
    return { value: { isSent: true, channel: 'terminal_bell' } }
  })
  mock.store(on)

  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', items: [{ content: 'One', status: 'completed' }] })
  expect(heard).toEqual([])

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: 'MISSION COMPLETE!' })).toBeDefined()
  await ui.unmount()
})

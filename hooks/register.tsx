import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { CrewAgent, CrewPlan, CrewStats, CrewStep, CrewStepStatus } from '../types'
import {
  collectionSvg,
  crewName,
  figureSvg,
  FIGURE_H,
  FIGURE_W,
  fit,
  hash,
  OUTFITS,
  STARTER_OUTFITS,
  workerSvg,
  WORKER_H,
  WORKER_W,
} from './art'

const EMPTY_PLAN: CrewPlan = { steps: [], pct: 0, prevPct: 0 }
const EMPTY_STATS: CrewStats = { agents: 0, missions: 0, flawless: 0, failed: 0, shinies: 0, unlocked: [] }

// Change a tag when that value's fields change: it declines what an earlier
// version stored, which outlives a reload.
const plan = atom({ plugin: 'mission-crew', key: 'plan' } as const, EMPTY_PLAN, {
  shape: 'plan-1',
})
const agents = atom({ plugin: 'mission-crew', key: 'agents' } as const, [] as CrewAgent[], {
  shape: 'agents-2',
})
const stats = atom({ plugin: 'mission-crew', key: 'stats' } as const, EMPTY_STATS, {
  shape: 'stats-1',
})
const isBusy = atom({ plugin: 'mission-crew', key: 'isBusy' } as const, false)
const isHidden = atom({ plugin: 'mission-crew', key: 'isHidden' } as const, false)
const isCelebrated = atom({ plugin: 'mission-crew', key: 'isCelebrated' } as const, false)

const SIDEBAR = 'mission-crew'
const HATS = 'mission-crew-hats'
// The record across sessions lives in the plugin's store under this key.
const STATS_KEY = 'stats'

const HAT_GLYPHS = ['🎩', '🧙', '🤠', '🧶', '👑', '⛑', '🥳', '🌀', '⚔', '🍳', '🎧', '🏴', '👑', '😇', '🚀', '🦆', '🎓', '🦄']

/** The hats past the starter twelve, and what earns each. */
const UNLOCKS: { outfit: number; hint: string; isEarned: (s: CrewStats) => boolean }[] = [
  { outfit: 16, hint: 'Hire 25 agents', isEarned: s => s.agents >= 25 },
  { outfit: 15, hint: 'Have an agent fail (every crew needs a rubber duck)', isEarned: s => s.failed >= 1 },
  { outfit: 13, hint: 'Finish a mission with a crew and no failures', isEarned: s => s.flawless >= 1 },
  { outfit: 17, hint: 'Meet a shiny Claude', isEarned: s => s.shinies >= 1 },
  { outfit: 14, hint: 'Complete 10 missions', isEarned: s => s.missions >= 10 },
  { outfit: 12, hint: 'Hire 100 agents', isEarned: s => s.agents >= 100 },
]

// One hire in this many is a shiny, gold Claude.
const SHINY_ODDS = 50

// The person's switches, from the plugin's settings; a change reloads the module.
let isSoundOn = true
let isNotifyOn = true

// ---------------------------------------------------------------- plans

function planPct(steps: CrewStep[]): number {
  if (steps.length === 0) {
    return 0
  }
  let sum = 0
  for (const step of steps) {
    sum += step.status === 'completed' ? 1 : step.status === 'in_progress' ? 0.4 : 0
  }
  return Math.round((sum / steps.length) * 100)
}

function asStatus(value: unknown): CrewStepStatus {
  return value === 'completed' || value === 'in_progress' ? value : 'pending'
}

/** The desktop's task list: a whole list, or a move along it. */
function applyDesktopPlan(steps: CrewStep[], input: Record<string, unknown>): CrewStep[] {
  if (Array.isArray(input.items)) {
    return input.items.map(item => {
      const one = (item ?? {}) as Record<string, unknown>
      return { text: String(one.content ?? ''), status: asStatus(one.status) }
    })
  }
  // Positions in the desktop's calls are 1-based; held here 0-based.
  const mark = (list: CrewStep[], at: number, status: CrewStepStatus) =>
    list.map((step, i) => (i === at ? { ...step, status } : step))
  let next = steps
  if (input.advance === true) {
    const at = next.findIndex(step => step.status === 'in_progress')
    next = mark(next, at, 'completed')
    const pending = next.findIndex((step, i) => i > at && step.status === 'pending')
    next = mark(next, pending, 'in_progress')
  }
  if (Array.isArray(input.done)) {
    for (const n of input.done) {
      if (typeof n === 'number') {
        next = mark(next, n - 1, 'completed')
      }
    }
  }
  if (typeof input.start === 'number' && input.start >= 1 && input.start <= next.length) {
    const at = input.start - 1
    next = next.map((step, i) =>
      i === at ? { ...step, status: 'in_progress' } : step.status === 'in_progress' ? { ...step, status: 'pending' } : step,
    )
  }
  return next
}

const TODO_TOOLS = new Set(['TodoWrite', 'TaskCreate', 'TaskUpdate', 'mcp__ccd_turn__update_plan', 'mcp__ccd_turn__wrap_up'])

/**
 * What a to-do tool's call that went through does to a list of steps: the
 * main loop's plan, or a subagent's own list.
 */
function stepsAfter(tool: string, input: Record<string, unknown>, result: unknown, steps: CrewStep[]): CrewStep[] {
  switch (tool) {
    case 'TodoWrite': {
      const todos = Array.isArray(input.todos) ? (input.todos as { content?: unknown; status?: unknown }[]) : []
      return todos.map(todo => ({ text: String(todo.content ?? ''), status: asStatus(todo.status) }))
    }
    case 'TaskCreate': {
      const id = (result as { task?: { id?: string } } | undefined)?.task?.id
      const text = String(input.subject ?? '')
      return [...steps, id ? { id, text, status: 'pending' } : { text, status: 'pending' }]
    }
    case 'TaskUpdate': {
      const id = String(input.taskId ?? '')
      if (input.status === 'deleted') {
        return steps.filter(step => step.id !== id)
      }
      return steps.map(step =>
        step.id === id
          ? {
              ...step,
              text: typeof input.subject === 'string' ? input.subject : step.text,
              status: input.status === undefined ? step.status : asStatus(input.status),
            }
          : step,
      )
    }
    case 'mcp__ccd_turn__update_plan':
      return applyDesktopPlan(steps, input)
    case 'mcp__ccd_turn__wrap_up':
      return steps.map(step => ({ ...step, status: 'completed' }))
    default:
      return steps
  }
}

async function setSteps($: EngineInterface, change: (steps: CrewStep[]) => CrewStep[]): Promise<void> {
  await update($, plan, old => {
    const steps = change(old.steps)
    return { steps, prevPct: old.pct, pct: planPct(steps) }
  })
  await celebrateIfDone($)
}

// ---------------------------------------------------------------- crew

function baseName(path: unknown): string {
  return String(path ?? '').split(/[\\/]/).filter(Boolean).pop() ?? 'a file'
}

/** A few words on what a tool call is doing, for a crew member's card. */
function describe(tool: string, input: Record<string, unknown>): string {
  switch (tool) {
    case 'Read':
      return `Reading ${baseName(input.file_path)}`
    case 'Edit':
    case 'MultiEdit':
      return `Editing ${baseName(input.file_path)}`
    case 'Write':
      return `Writing ${baseName(input.file_path)}`
    case 'NotebookEdit':
      return `Editing ${baseName(input.notebook_path)}`
    case 'Grep':
      return `Searching "${fit(String(input.pattern ?? ''), 18)}"`
    case 'Glob':
      return `Looking for ${fit(String(input.pattern ?? ''), 18)}`
    case 'Bash':
    case 'PowerShell':
      return typeof input.description === 'string' && input.description
        ? input.description
        : `Running ${String(input.command ?? '').trim().split(/\s+/)[0] || 'a command'}`
    case 'WebFetch':
      return `Fetching ${String(input.url ?? '').replace(/^https?:\/\//, '').split('/')[0]}`
    case 'WebSearch':
      return 'Searching the web'
    case 'Agent':
    case 'Task':
      return 'Briefing a sidekick'
    case 'TodoWrite':
    case 'TaskCreate':
    case 'TaskUpdate':
      return 'Updating its checklist'
    case 'ToolSearch':
      return 'Rummaging in the toolbox'
  }
  const mcp = /^mcp__[^_]+(?:_[^_]+)*__(.+)$/.exec(tool)
  return `Using ${(mcp?.[1] ?? tool).replace(/_/g, ' ')}`
}

/**
 * How far along a crew member is: by its own to-do list when it keeps one
 * (held under 100 until it ends), else a guess that creeps towards 92% as it
 * works, since nobody knows how long a subagent takes.
 */
function agentPct(tools: number, steps: CrewStep[]): number {
  if (steps.length > 0) {
    return Math.min(99, planPct(steps))
  }
  return Math.min(92, Math.round(100 * (1 - Math.exp(-tools / 7))))
}

function elapsed(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

function isDemoAgent(id: string): boolean {
  return id.startsWith('demo-')
}

/** The outfits a new hire may wear: the starters and every hat unlocked. */
function wardrobe(record: CrewStats): number[] {
  const earned = OUTFITS.map((name, i) => (i >= STARTER_OUTFITS && record.unlocked.includes(name) ? i : -1))
  return [...Array.from({ length: STARTER_OUTFITS }, (_, i) => i), ...earned.filter(i => i >= 0)]
}

async function addAgent(
  $: EngineInterface,
  id: string,
  title: string,
  kind: string,
  forceShiny = false,
): Promise<void> {
  if ((await read($, agents)).some(one => one.id === id)) {
    return
  }
  const h = hash(id)
  const startedAt = await $.clock.now()
  const pool = wardrobe(await read($, stats))
  const isShiny = forceShiny || Math.random() * SHINY_ODDS < 1
  await update($, agents, list => {
    if (list.some(one => one.id === id)) {
      return list
    }
    // Pick an outfit nobody on the current crew is wearing, when one is free.
    const worn = new Set(list.filter(one => one.status === 'working').map(one => one.outfit))
    const free = pool.filter(outfit => !worn.has(outfit))
    const choices = free.length > 0 ? free : pool
    const outfit = choices[h % choices.length] ?? 0
    const agent: CrewAgent = {
      id,
      name: crewName(outfit, h >>> 8),
      kind: kind || 'agent',
      title: title || 'On a secret mission',
      activity: 'Warming up',
      status: 'working',
      tools: 0,
      pct: 2,
      prevPct: 0,
      outfit,
      look: (h >>> 4) % 6,
      isShiny,
      steps: [],
      startedAt,
    }
    return [...list, agent].slice(-24)
  })
  if (!isDemoAgent(id)) {
    await changeStats($, s => ({ ...s, agents: s.agents + 1, shinies: s.shinies + (isShiny ? 1 : 0) }))
  }
}

async function agentWorked($: EngineInterface, id: string, activity: string): Promise<void> {
  await update($, agents, list =>
    list.map(one =>
      one.id === id && one.status === 'working'
        ? { ...one, tools: one.tools + 1, activity, prevPct: one.pct, pct: agentPct(one.tools + 1, one.steps) }
        : one,
    ),
  )
}

async function agentPlanned($: EngineInterface, id: string, tool: string, input: Record<string, unknown>, result: unknown) {
  await update($, agents, list =>
    list.map(one => {
      if (one.id !== id || one.status !== 'working') {
        return one
      }
      const steps = stepsAfter(tool, input, result, one.steps)
      return { ...one, steps, prevPct: one.pct, pct: agentPct(one.tools, steps) }
    }),
  )
}

async function agentEnded($: EngineInterface, id: string, isFailed: boolean): Promise<void> {
  const now = await $.clock.now()
  const was = (await read($, agents)).find(one => one.id === id)
  if (was === undefined || was.status !== 'working') {
    return
  }
  await update($, agents, list =>
    list.map((one): CrewAgent =>
      one.id === id && one.status === 'working'
        ? {
            ...one,
            status: isFailed ? 'failed' : 'done',
            prevPct: one.pct,
            pct: isFailed ? one.pct : 100,
            steps: isFailed ? one.steps : one.steps.map(step => ({ ...step, status: 'completed' })),
            activity: isFailed
              ? `✗ Stopped after ${elapsed(now - one.startedAt)}`
              : `✓ Done in ${elapsed(now - one.startedAt)}`,
          }
        : one,
    ),
  )
  if (isFailed && !isDemoAgent(id)) {
    await changeStats($, s => ({ ...s, failed: s.failed + 1 }))
  }
  await celebrateIfDone($)
}

/** Switches the main view to a crew member's transcript, as the tasks list does. */
async function watchAgent($: EngineInterface, id: string, name: string): Promise<void> {
  const viewed = await $.ui.view({ agentId: id })
  if (viewed.deny !== undefined) {
    $.ui.toast(
      isDemoAgent(id)
        ? `${name} is part of the demo: on a real mission this opens their live transcript.`
        : `${name}'s transcript can't be opened now (${viewed.deny}).`,
    )
  }
}

// ---------------------------------------------------------------- record

/** Reads the record kept across sessions, whatever an older version stored. */
async function loadStats($: EngineInterface): Promise<void> {
  const saved = (await $.store.get(STATS_KEY)) as Partial<CrewStats> | undefined
  const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
  const record: CrewStats = {
    agents: count(saved?.agents),
    missions: count(saved?.missions),
    flawless: count(saved?.flawless),
    failed: count(saved?.failed),
    shinies: count(saved?.shinies),
    unlocked: Array.isArray(saved?.unlocked) ? saved.unlocked.filter((name): name is string => typeof name === 'string') : [],
  }
  await update($, stats, () => record)
}

/** Changes the record, keeps it, and hands out any hat it has now earned. */
async function changeStats($: EngineInterface, change: (s: CrewStats) => CrewStats): Promise<void> {
  let record = await update($, stats, change)
  const earned = UNLOCKS.filter(one => one.isEarned(record) && !record.unlocked.includes(OUTFITS[one.outfit] ?? ''))
  if (earned.length > 0) {
    const names = earned.map(one => OUTFITS[one.outfit] ?? '')
    record = await update($, stats, s => ({ ...s, unlocked: [...s.unlocked, ...names.filter(name => !s.unlocked.includes(name))] }))
    for (const name of names) {
      $.ui.toast(`New hat unlocked: the ${name}! See them all with /crew hats.`, { timeoutMs: 6000 })
    }
    void playSound($, 'sounds/hat-unlocked.wav')
  }
  await $.store.set(STATS_KEY, record)
}

// ---------------------------------------------------------------- party

/**
 * Plays one of the plugin's sounds. The engine's own player plays only on
 * macOS, so this asks the host for one: PowerShell's sound player on Windows,
 * afplay, paplay or aplay elsewhere. No player, no sound, no fuss.
 */
async function playSound($: EngineInterface, file: string): Promise<void> {
  if (!isSoundOn) {
    return
  }
  const root = $.plugin.root
  const isWindows = /^[A-Za-z]:[\\/]/.test(root) || root.startsWith('\\\\')
  const path = isWindows ? `${root}\\${file.replace(/\//g, '\\')}` : `${root}/${file}`
  try {
    if (isWindows) {
      await $.process.run(
        ['powershell', '-NoProfile', '-NonInteractive', '-Command', `(New-Object System.Media.SoundPlayer '${path.replace(/'/g, "''")}').PlaySync()`],
        { timeoutMs: 15_000 },
      )
    } else {
      await $.process.run(
        [
          'sh',
          '-c',
          'if command -v afplay >/dev/null 2>&1; then afplay "$1"; elif command -v paplay >/dev/null 2>&1; then paplay "$1"; elif command -v aplay >/dev/null 2>&1; then aplay -q "$1"; fi',
          'sh',
          path,
        ],
        { timeoutMs: 15_000 },
      )
    }
  } catch {
    // The crew cheers silently.
  }
}

/** Tells the person a mission is done: their notification, else a toast. */
async function announce($: EngineInterface, crewSize: number): Promise<void> {
  if (!isNotifyOn) {
    return
  }
  const text = crewSize > 0 ? `Mission complete! ${crewSize} ${crewSize === 1 ? 'agent' : 'agents'} on the crew.` : 'Mission complete!'
  const sent = await $.ui.notify(text, { title: 'Claude Crew' }).catch(() => undefined)
  if (sent?.isSent !== true) {
    $.ui.toast(text)
  }
}

/**
 * Throws the party once a mission completes: the jingle, the notice and the
 * record. A mission that starts again (new steps, a new hire) may party again.
 */
async function celebrateIfDone($: EngineInterface): Promise<void> {
  const m = await missionOf($)
  const wasCelebrated = await read($, isCelebrated)
  if (!m.isComplete) {
    if (wasCelebrated) {
      await update($, isCelebrated, () => false)
    }
    return
  }
  if (wasCelebrated) {
    return
  }
  await update($, isCelebrated, () => true)
  void playSound($, 'sounds/mission-complete.wav')
  void announce($, m.crew)
  if (demo === undefined) {
    const crew = await read($, agents)
    const isFlawless = crew.length > 0 && crew.every(one => one.status !== 'failed')
    await changeStats($, s => ({ ...s, missions: s.missions + 1, flawless: s.flawless + (isFlawless ? 1 : 0) }))
  }
}

// ---------------------------------------------------------------- demo

const DEMO_STEPS = [
  'Look around the codebase',
  'Design the progress pane',
  'Dress up the crew',
  'Wire up the hooks',
  'Test everything',
  'Celebrate',
]

const DEMO_ACTIVITY = [
  'Reading register.tsx',
  'Searching "useState"',
  'Running npm test',
  'Editing art.ts',
  'Fetching docs.anthropic.com',
  'Looking for **/*.tsx',
  'Thinking very hard',
  'Drinking virtual coffee',
  'Untangling a regex',
  'Counting semicolons',
]

const DEMO_CREW = [
  { at: 2, id: 'demo-explore', kind: 'Explore', title: 'Map out the codebase', endAt: 13 },
  { at: 4, id: 'demo-tests', kind: 'general-purpose', title: 'Write the test suite', endAt: 24, plan: ['Find the gaps', 'Write the tests', 'Make them pass'] },
  { at: 6, id: 'demo-plan', kind: 'Plan', title: 'Sketch the API shape', endAt: 18, isFailed: true },
  { at: 9, id: 'demo-docs', kind: 'general-purpose', title: 'Update the README', endAt: 21, isShiny: true },
]

// The module's own variables start over on a reload, as its timers do.
let demo: Timer | undefined
let demoTicks = 0

async function openCrew($: EngineInterface): Promise<void> {
  await $.ui.open({ id: SIDEBAR, title: 'Claude Crew' })
}

async function openHats($: EngineInterface): Promise<void> {
  await $.ui.open({ id: HATS, title: 'Hat collection' })
}

function stopDemo(): void {
  demo?.cancel()
  demo = undefined
}

async function clearMission($: EngineInterface): Promise<void> {
  await update($, agents, () => [])
  await update($, plan, () => EMPTY_PLAN)
  await update($, isBusy, () => false)
  await update($, isCelebrated, () => false)
}

async function startDemo($: EngineInterface): Promise<void> {
  stopDemo()
  await clearMission($)
  demoTicks = 0
  demo = $.clock.every(700, () => {
    demoTicks += 1
    void demoTick($, demoTicks)
  })
  await setSteps($, () =>
    DEMO_STEPS.map((text, i) => ({ text, status: i === 0 ? 'in_progress' : 'pending' })),
  )
  await update($, isBusy, () => true)
}

async function demoTick($: EngineInterface, tick: number): Promise<void> {
  for (const member of DEMO_CREW) {
    if (tick === member.at) {
      await addAgent($, member.id, member.title, member.kind, member.isShiny === true)
      if (member.plan !== undefined) {
        const items = member.plan.map((content, i) => ({ content, status: i === 0 ? 'in_progress' : 'pending' }))
        await agentPlanned($, member.id, 'mcp__ccd_turn__update_plan', { items }, undefined)
      }
    } else if (tick === member.endAt) {
      await agentEnded($, member.id, member.isFailed === true)
    } else if (tick > member.at && tick < member.endAt) {
      const line = DEMO_ACTIVITY[(tick * 7 + hash(member.id)) % DEMO_ACTIVITY.length] ?? 'Thinking'
      await agentWorked($, member.id, member.isFailed && tick > member.endAt - 4 ? 'Lost in node_modules' : line)
      if (member.plan !== undefined && (tick - member.at) % 6 === 0) {
        await agentPlanned($, member.id, 'mcp__ccd_turn__update_plan', { advance: true }, undefined)
      }
    }
  }
  if (tick % 5 === 0) {
    await setSteps($, steps => applyDesktopPlan(steps, { advance: true }))
  }
  if (tick === 31) {
    await update($, isBusy, () => false)
    await setSteps($, steps => steps.map(step => ({ ...step, status: 'completed' })))
    stopDemo()
  }
}

// ---------------------------------------------------------------- hooks

export const register: Register = (on, options) => {
  isSoundOn = options.sound !== false
  isNotifyOn = options.notifications !== false

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'crew',
      description: 'Open the Claude Crew sidebar (args: demo, hats, clear, hide)',
      argumentHint: '[demo|hats|clear|hide]',
    })
    await loadStats($)
    return next(e)
  })

  on('command.run', { command: 'crew' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'hide') {
      await update($, isHidden, () => true)
      return { text: 'Claude Crew hidden. /crew brings it back.' }
    }
    await update($, isHidden, () => false)
    if (arg === 'clear') {
      stopDemo()
      await clearMission($)
      return { text: 'Claude Crew cleared.' }
    }
    if (arg === 'demo') {
      await startDemo($)
      return { text: 'Claude Crew demo started: watch above the prompt, and click the agents to see the crew.' }
    }
    if (arg === 'hats') {
      await openHats($)
      return { text: 'Hat collection opened.' }
    }
    await openCrew($)
    return { text: 'Claude Crew sidebar opened.' }
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      if (e.text !== '' && demo === undefined) {
        // A new prompt starts a new mission: last time's finished work goes.
        await update($, agents, list => list.filter(one => one.status === 'working'))
        await update($, plan, old =>
          old.steps.length > 0 && old.steps.every(step => step.status === 'completed') ? EMPTY_PLAN : old,
        )
        await celebrateIfDone($)
      }
      await update($, isBusy, () => true)
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) {
      await agentEnded($, e.agentId, e.isAborted)
    } else {
      if (demo === undefined) {
        await update($, isBusy, () => false)
      }
      // Settle any crew member whose end this plugin did not hear.
      const live = await $.agent.list()
      for (const one of await read($, agents)) {
        if (one.status !== 'working' || isDemoAgent(one.id)) {
          continue
        }
        const info = live.find(agent => agent.id === one.id)
        if (info === undefined || info.status === 'completed') {
          await agentEnded($, one.id, false)
        } else if (info.status === 'failed' || info.status === 'killed') {
          await agentEnded($, one.id, true)
        }
      }
    }
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)
    if (spawned.agentId !== undefined) {
      await addAgent($, spawned.agentId, e.description, e.subagentType)
    }
    return spawned
    // The crew only watches: a failure here never stops a spawn, and a spawn
    // already made is replayed, not made twice.
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    const input = e as unknown as Record<string, unknown>
    const agentId = e.agentId

    if (agentId !== undefined) {
      // A crew member at work: one more tool, a new line of activity.
      if (!(await read($, agents)).some(one => one.id === agentId)) {
        const info = (await $.agent.list()).find(agent => agent.id === agentId)
        await addAgent($, agentId, info?.description ?? '', info?.type ?? 'agent')
      }
      await agentWorked($, agentId, describe(tool, input))
    }

    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError === true || !TODO_TOOLS.has(tool)) {
      return ran
    }
    // A to-do list changed: the crew member's own, or the mission's plan.
    if (agentId !== undefined) {
      await agentPlanned($, agentId, tool, input, ran.result)
    } else {
      await setSteps($, steps => stepsAfter(tool, input, ran.result, steps))
    }
    return ran
  }).catch(($, e, next) => next(e))

  // The band above the prompt: the mission bar, the step and a count of the
  // crew that opens the sidebar. Only text and box sizes change as the work
  // goes on; each picture's markup stays the same until its mode does, so no
  // picture reloads mid-animation.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const m = await missionOf($)
    if (e.props.hasSurvey || m.isEmpty || (await read($, isHidden))) {
      return next(e)
    }
    const busy = m.isBusy || e.props.isWorking
    const tone = m.isComplete ? 'success' : 'claude'
    const crewLabel =
      m.working > 0
        ? `${m.working} ${m.working === 1 ? 'agent' : 'agents'} working`
        : `${m.crew} ${m.crew === 1 ? 'agent' : 'agents'} done`
    const room = Math.max(10, e.props.bodyColumns - 52)

    if (e.surface === 'terminal') {
      const { Box, Button, Text } = $.ui.resolve(e)
      const width = Math.max(10, Math.min(48, e.props.bodyColumns - 12))
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" justifyContent="space-between">
            <Text>
              <Text bold color={tone}>{m.isComplete ? 'MISSION COMPLETE!' : 'MISSION'}</Text>
              {m.isComplete ? '' : ` ${fit(m.headline, room)}`}
            </Text>
            {m.crew > 0 ? (
              <Button key="crew-button" plain onPress={() => openCrew($)}>
                {crewLabel} ›
              </Button>
            ) : null}
          </Box>
          <Text>
            <Text color={tone}>{textBar(m.pct, width)}</Text>
            <Text bold> {m.pct}%</Text>
          </Text>
        </Box>
      )
    }

    const { Box, Button, Svg, Text } = $.ui.resolve(e)
    // A segment draws about two columns wide on the desktop: keep the bar
    // and the percentage well inside one line.
    const [filled, empty] = splitBar(m.pct, Math.max(12, Math.min(48, Math.round(e.props.bodyColumns * 0.45))))
    // The band's one Claude: at his laptop while the work goes on, cheering
    // once it is all done.
    const worker = m.isComplete ? 'done' : busy || m.working > 0 ? 'work' : 'idle'
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between" alignItems="center">
          <Text>
            <Text weight="bold" color={tone}>
              {m.isComplete ? 'MISSION COMPLETE!' : 'MISSION'}
            </Text>
            <Text weight="medium">{m.isComplete ? '' : `  ${fit(m.headline, room)}`}</Text>
          </Text>
          <Box key="crew" flexDirection="row" alignItems="center" columnGap={1} flexShrink={0}>
            <Box key="worker" flexShrink={0}>
              <Svg
                source={workerSvg(worker)}
                width={WORKER_W}
                height={WORKER_H}
                alt={worker === 'done' ? 'Claude celebrating' : 'Claude at work'}
                isInteractive
              />
            </Box>
            {m.crew > 0 ? (
              <Button key="crew-button" plain onPress={() => openCrew($)}>
                <Text color={tone}>{crewLabel} ›</Text>
              </Button>
            ) : null}
          </Box>
        </Box>
        <Box key="bar" flexDirection="row" flexWrap="nowrap" alignItems="center">
          <Text color={tone}>{filled}</Text>
          <Text dimColor>{empty}</Text>
          <Text weight="bold" color={tone}>
            {` ${m.pct}%`}
          </Text>
        </Box>
      </Box>
    )
  })

  // The sidebar the crew count opens: every agent with its hat, its bar, its
  // own steps and what it is doing, then the plan. A name opens its transcript.
  on('ui.render', { component: 'Pane', requestId: SIDEBAR }, async ($, e) => {
    const { steps } = await read($, plan)
    const crew = (await read($, agents)).slice(-12)
    const working = crew.filter(one => one.status === 'working').length
    const room = Math.max(12, e.props.bodyColumns - 12)
    const tone = (one: CrewAgent) => (one.status === 'done' ? 'success' : one.status === 'failed' ? 'error' : 'claude')
    const stepMark = (step: CrewStep) => (step.status === 'completed' ? '✓ ' : step.status === 'in_progress' ? '▶ ' : '○ ')
    const stepTone = (step: CrewStep) =>
      step.status === 'completed' ? 'success' : step.status === 'in_progress' ? 'claude' : undefined
    const ownStep = (one: CrewAgent) => {
      if (one.steps.length === 0) {
        return ''
      }
      const done = one.steps.filter(step => step.status === 'completed').length
      const now = one.steps.find(step => step.status === 'in_progress') ?? one.steps.find(step => step.status === 'pending')
      return now === undefined ? `All ${one.steps.length} steps done` : `Step ${done + 1}/${one.steps.length}: ${now.text}`
    }

    if (e.surface === 'terminal') {
      const { Box, Button, Text } = $.ui.resolve(e)
      return (
        <Box flexDirection="column">
          <Text dimColor>{crew.length === 0 ? 'No agents yet.' : `${working} working · ${crew.length - working} finished`}</Text>
          {crew.map(one => (
            <Box key={`crew-${one.id}`} flexDirection="column" marginTop={1}>
              <Button key={`watch-${one.id}`} plain onPress={() => watchAgent($, one.id, one.name)}>
                {`${HAT_GLYPHS[one.outfit % HAT_GLYPHS.length]} ${one.isShiny ? '★ ' : ''}${one.name} (${one.kind}) ›`}
              </Button>
              <Text>{fit(one.title, room)}</Text>
              <Text color={tone(one)}>
                {textBar(one.pct, 12)} {one.pct}%
              </Text>
              {ownStep(one) ? <Text>{fit(ownStep(one), room)}</Text> : null}
              <Text dimColor>{fit(one.activity, room)}</Text>
            </Box>
          ))}
          {steps.map(step => (
            <Text color={stepTone(step)} dimColor={step.status === 'pending'}>
              {stepMark(step)}
              {fit(step.text, room)}
            </Text>
          ))}
          <Button key="hats-button" plain onPress={() => openHats($)}>
            Hat collection ›
          </Button>
        </Box>
      )
    }

    const { Box, Button, Svg, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column" rowGap={1}>
        <Text size="caption" weight="bold" dimColor>
          {crew.length === 0 ? 'THE CREW' : `THE CREW · ${working} WORKING · ${crew.length - working} FINISHED`}
        </Text>
        {crew.length === 0 ? (
          <Text dimColor>No agents yet. They line up here when Claude sends out subagents.</Text>
        ) : (
          <Text size="caption" dimColor>
            Click a name to watch that agent work.
          </Text>
        )}
        {crew.map(one => (
          <Box key={`crew-${one.id}`} flexDirection="row" alignItems="center" columnGap={1}>
            <Svg
              source={figureSvg(
                one.status === 'done' ? 'done' : one.status === 'failed' ? 'fail' : 'work',
                one.outfit,
                one.look,
                hash(one.id),
                one.isShiny,
              )}
              width={FIGURE_W}
              height={FIGURE_H}
              alt={`${one.isShiny ? 'Shiny ' : ''}${one.name} in a ${OUTFITS[one.outfit % OUTFITS.length]}`}
              isInteractive
            />
            <Box flexDirection="column" flexGrow={1} flexShrink={1}>
              <Button key={`watch-${one.id}`} plain onPress={() => watchAgent($, one.id, one.name)}>
                <Text weight="bold">{one.name}</Text>
                {one.isShiny ? <Text color="#F2B83A" weight="bold">{'  ★ shiny'}</Text> : ''}
                <Text dimColor size="footnote">{`  ${one.kind}  ›`}</Text>
              </Button>
              <Text size="footnote">{fit(one.title, room)}</Text>
              <Text size="footnote">
                <Text color={tone(one)}>{splitBar(one.pct, 12)[0]}</Text>
                <Text dimColor>{splitBar(one.pct, 12)[1]}</Text>
                <Text color={tone(one)}>{` ${one.pct}%`}</Text>
              </Text>
              {ownStep(one) ? (
                <Text size="footnote" color="claude">
                  {fit(ownStep(one), room)}
                </Text>
              ) : null}
              <Text size="caption" dimColor>
                {fit(one.activity, room)}
              </Text>
            </Box>
          </Box>
        ))}
        {steps.length > 0 ? (
          <Box flexDirection="column" marginTop={1}>
            <Text size="caption" weight="bold" dimColor>
              THE PLAN
            </Text>
            {steps.map(step => (
              <Text size="footnote" color={stepTone(step)} dimColor={step.status === 'pending'}>
                {stepMark(step)}
                {step.text}
              </Text>
            ))}
          </Box>
        ) : null}
        <Button key="hats-button" plain onPress={() => openHats($)}>
          <Text color="claude">Hat collection ›</Text>
        </Button>
      </Box>
    )
  })

  // The hat collection: every hat, the earned ones worn, the rest grey with
  // what earns them, and the record that earns them.
  on('ui.render', { component: 'Pane', requestId: HATS }, async ($, e) => {
    const record = await read($, stats)
    const owned = new Set(wardrobe(record))
    const summary = `${record.agents} agents hired · ${record.missions} missions · ${record.flawless} flawless · ${record.shinies} shiny`
    const hintOf = (outfit: number) => UNLOCKS.find(one => one.outfit === outfit)?.hint ?? ''

    if (e.surface === 'terminal') {
      const { Box, Text } = $.ui.resolve(e)
      return (
        <Box flexDirection="column">
          <Text bold>{`${owned.size}/${OUTFITS.length} hats`}</Text>
          <Text dimColor>{summary}</Text>
          {OUTFITS.map((name, i) =>
            owned.has(i) ? (
              <Text>{`${HAT_GLYPHS[i]} ${name}`}</Text>
            ) : (
              <Text dimColor>{`?  ${hintOf(i)}`}</Text>
            ),
          )}
        </Box>
      )
    }

    const { Box, Svg, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column" rowGap={1}>
        <Text weight="bold">{`${owned.size} of ${OUTFITS.length} hats`}</Text>
        <Text size="caption" dimColor>
          {summary}
        </Text>
        <Box key="hats" flexDirection="row" flexWrap="wrap" columnGap={2} rowGap={1}>
          {OUTFITS.map((name, i) => (
            <Box key={`hat-${i}`} flexDirection="column" alignItems="center" width={16}>
              <Svg
                source={collectionSvg(i, owned.has(i))}
                width={FIGURE_W}
                height={FIGURE_H}
                alt={owned.has(i) ? name : 'A hat still to earn'}
                isInteractive
              />
              <Text size="footnote" weight="bold" dimColor={!owned.has(i)}>
                {owned.has(i) ? name : '???'}
              </Text>
              {owned.has(i) ? null : (
                <Text size="caption" dimColor>
                  {hintOf(i)}
                </Text>
              )}
            </Box>
          ))}
        </Box>
      </Box>
    )
  })
}

/** What the band says: the mission's percentage, its step and the crew's count. */
async function missionOf($: EngineInterface) {
  const { steps, pct: planPct } = await read($, plan)
  const crew = await read($, agents)
  const working = crew.filter(one => one.status === 'working').length
  const done = steps.filter(step => step.status === 'completed').length
  const active = steps.find(step => step.status === 'in_progress') ?? steps.find(step => step.status === 'pending')
  // Without a plan the mission is the crew's average, a failure counting as an end.
  const pct =
    steps.length > 0
      ? planPct
      : crew.length === 0
        ? 0
        : Math.round(crew.reduce((sum, one) => sum + (one.status === 'failed' ? 100 : one.pct), 0) / crew.length)
  return {
    isEmpty: steps.length === 0 && crew.length === 0,
    isBusy: await read($, isBusy),
    isComplete: pct >= 100 && working === 0,
    pct,
    done,
    total: steps.length,
    headline: active?.text ?? `${working} of the crew at work`,
    crew: crew.length,
    working,
  }
}

/**
 * A bar of `width` segments, as its filled and its empty part. Both are the
 * same glyph, the empty part drawn dim: a proportional font draws ▱ wider
 * than ▰, which pushed a long bar onto a second line.
 */
function splitBar(pct: number, width: number): [string, string] {
  const full = Math.round((Math.max(0, Math.min(100, pct)) / 100) * width)
  return ['▰'.repeat(full), '▰'.repeat(width - full)]
}

/** The terminal's one-string bar, where every glyph takes one cell. */
function textBar(pct: number, width: number): string {
  const full = Math.round((Math.max(0, Math.min(100, pct)) / 100) * width)
  return '▰'.repeat(full) + '▱'.repeat(width - full)
}

// The crew's pure parts: hats, names, the mission read from a to-do list,
// and plain words for what a helper is doing. No OpenCode imports, so the
// tests can run these alone.

/** The twelve starter hats of Claude Crew, and the title each one gives. */
export const HATS = [
  { name: 'top hat', title: 'Sir' },
  { name: 'wizard hat', title: 'Wizard' },
  { name: 'cowboy hat', title: 'Sheriff' },
  { name: 'beanie', title: 'Chill' },
  { name: 'crown', title: 'King' },
  { name: 'hard hat', title: 'Foreman' },
  { name: 'party hat', title: 'Party' },
  { name: 'propeller cap', title: 'Professor' },
  { name: 'viking helmet', title: 'Jarl' },
  { name: 'chef hat', title: 'Chef' },
  { name: 'headphones', title: 'DJ' },
  { name: 'pirate bandana', title: 'Captain' },
] as const

const NAMES = [
  'Pixel', 'Byte', 'Nibble', 'Biscuit', 'Mochi', 'Pebble', 'Waffle', 'Noodle',
  'Sprout', 'Tofu', 'Ziggy', 'Crumb', 'Pickle', 'Bagel', 'Muffin', 'Gizmo',
]

/** A steady number for a text, so a helper keeps its hat and name. */
export function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  }
  return h >>> 0
}

/** A helper's looks: its hat, its face, its name and its place in the animation. */
export type Member = { outfit: number; look: number; seed: number; name: string; isShiny: boolean }

/** One helper in fifty is a gold Claude. */
const SHINY_ODDS = 50

/**
 * Hands out hats in order of arrival: each helper gets a hat nobody before
 * it in the list wears, while one is free, picked from its id.
 */
export function dress(ids: readonly string[]): Map<string, Member> {
  const crew = new Map<string, Member>()
  const worn = new Set<number>()
  for (const id of ids) {
    const h = hash(id)
    const free = HATS.map((_, i) => i).filter(i => !worn.has(i))
    const pool = free.length > 0 ? free : HATS.map((_, i) => i)
    const outfit = pool[h % pool.length] ?? 0
    worn.add(outfit)
    crew.set(id, {
      outfit,
      look: (h >>> 4) % 4,
      seed: h % 1000,
      name: `${HATS[outfit]?.title ?? 'Sir'} ${NAMES[(h >>> 8) % NAMES.length]}`,
      isShiny: (h >>> 16) % SHINY_ODDS === 0,
    })
  }
  return crew
}

export type Step = { text: string; status: 'pending' | 'in_progress' | 'completed' | 'cancelled' }

/** The steps of a to-do list as the todowrite tool was given them. */
export function stepsOf(input: unknown): Step[] {
  const todos = (input as { todos?: unknown } | undefined)?.todos
  if (!Array.isArray(todos)) {
    return []
  }
  return todos.flatMap(todo => {
    if (todo === null || typeof todo !== 'object') {
      return []
    }
    const t = todo as Record<string, unknown>
    const text = [t.content, t.text, t.title].find(v => typeof v === 'string') as string | undefined
    const status = t.status
    const known = status === 'in_progress' || status === 'completed' || status === 'cancelled'
    return text ? [{ text, status: known ? status : 'pending' }] : []
  })
}

export type Mission = { step: string; pct: number; isDone: boolean }

/** What the band shows for a list: the step under way and how far along. */
export function missionOf(steps: readonly Step[]): Mission | undefined {
  const counted = steps.filter(s => s.status !== 'cancelled')
  if (counted.length === 0) {
    return undefined
  }
  const done = counted.filter(s => s.status === 'completed').length
  const current = counted.find(s => s.status === 'in_progress') ?? counted.find(s => s.status === 'pending')
  return {
    step: current?.text ?? 'All done',
    pct: Math.round((done / counted.length) * 100),
    isDone: current === undefined,
  }
}

const base = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path

/** A tool call in plain words: "Reading main.ts", "Running npm test". */
export function activityOf(tool: string, input: unknown): string {
  const a = (input ?? {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const file = base(str(a.filePath) || str(a.path) || str(a.file))
  switch (tool) {
    case 'read':
      return file ? `Reading ${file}` : 'Reading a file'
    case 'edit':
    case 'write':
    case 'patch':
    case 'apply_patch':
      return file ? `Editing ${file}` : 'Editing files'
    case 'bash':
    case 'shell':
      return str(a.description) || (str(a.command) ? `Running ${str(a.command)}` : 'Running a command')
    case 'grep':
    case 'glob':
    case 'list':
      return str(a.pattern) ? `Searching for ${str(a.pattern)}` : 'Looking around'
    case 'webfetch':
    case 'websearch':
      return 'Reading the web'
    case 'task':
      return 'Sending out a helper'
    case 'todowrite':
      return 'Updating its plan'
    default:
      return `Using ${tool}`
  }
}

// ---------------------------------------------------------------- demo

/** How long the demo mission runs, its party included. */
export const DEMO_MS = 40_000
/** When the demo's last step is done. */
export const DEMO_DONE_MS = 32_000

export type DemoHelper = {
  id: string
  title: string
  state: 'running' | 'succeeded' | 'failed'
  doing: string
  steps: Step[]
  startedAt: number
  endedAt?: number
  tokens: number
}

export type DemoView = { steps: Step[]; helpers: DemoHelper[]; missionDoneAt?: number }

const DEMO_STEPS = ['Read the codebase', 'Fix the login bug', 'Write the tests', 'Update the docs']
const DEMO_CREW = [
  { title: 'Explore the auth module', from: 1, to: 14, fails: false, doing: ['Reading auth.ts', 'Searching for login', 'Reading session.ts'] },
  { title: 'Write login tests', from: 3, to: 26, fails: false, doing: ['Editing login.test.ts', 'Running npm test', 'Editing login.test.ts'] },
  { title: 'Check the docs links', from: 6, to: 20, fails: true, doing: ['Reading README.md', 'Reading the web', 'Searching for http'] },
  { title: 'Review the fix', from: 15, to: 30, fails: false, doing: ['Reading auth.ts', 'Running git diff', 'Reading login.test.ts'] },
]

/** The demo mission as it stands `ms` after it started. */
export function demoAt(ms: number): DemoView {
  const t = ms / 1000
  const steps: Step[] = DEMO_STEPS.map((text, i) => ({
    text,
    status: t >= (i + 1) * 8 ? 'completed' : t >= i * 8 ? 'in_progress' : 'pending',
  }))
  const helpers = DEMO_CREW.filter(one => t >= one.from).map((one, i): DemoHelper => {
    const isOver = t >= one.to
    const ran = Math.min(t, one.to) - one.from
    const own = ['Read the code', 'Write the tests', 'Run them']
    return {
      id: `demo-${i + 1}`,
      title: one.title,
      state: isOver ? (one.fails ? 'failed' : 'succeeded') : 'running',
      doing: one.doing[Math.floor(ran / 3) % one.doing.length] ?? 'Warming up',
      // The test writer keeps its own to-do list, so it has its own bar.
      steps:
        i === 1
          ? own.map((text, k) => {
              const done = (ran / (one.to - one.from)) * own.length
              return { text, status: isOver || done >= k + 1 ? 'completed' : done >= k ? 'in_progress' : 'pending' }
            })
          : [],
      startedAt: one.from * 1000,
      endedAt: isOver ? one.to * 1000 : undefined,
      tokens: Math.round(ran * 420 + (i + 1) * 900),
    }
  })
  return { steps, helpers, missionDoneAt: ms >= DEMO_DONE_MS ? DEMO_DONE_MS : undefined }
}

/** A bar of filled and empty blocks. */
export function bar(pct: number, width: number): [string, string] {
  const full = Math.round((Math.max(0, Math.min(100, pct)) / 100) * width)
  return ['▰'.repeat(full), '▰'.repeat(width - full)]
}

export function elapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) {
    return `${s}s`
  }
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

export function tokenCount(n: number): string {
  if (n < 1000) {
    return `${n}`
  }
  return n < 1_000_000 ? `${(n / 1000).toFixed(1)}k` : `${(n / 1_000_000).toFixed(2)}M`
}

/** Cuts a line to fit, with an ellipsis. */
export function fit(text: string, width: number): string {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length <= width ? line : `${line.slice(0, Math.max(1, width - 1))}…`
}

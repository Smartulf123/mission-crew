export type CrewStepStatus = 'pending' | 'in_progress' | 'completed'

/** One step of a plan; `id` is a task's id when the step came from TaskCreate. */
export type CrewStep = { id?: string; text: string; status: CrewStepStatus }

/** The plan, with the percentage it shows now and the one it showed before. */
export type CrewPlan = { steps: CrewStep[]; pct: number; prevPct: number }

/** One line of an agent's log: a tool it used, or something it said. */
export type CrewLogLine = { at: number; kind: 'tool' | 'say'; text: string }

/**
 * One subagent, dressed up: its outfit, look and shininess are picked when it
 * is hired. `steps` is its own to-do list, when it keeps one.
 */
export type CrewAgent = {
  id: string
  name: string
  kind: string
  title: string
  activity: string
  status: 'working' | 'done' | 'failed'
  tools: number
  pct: number
  prevPct: number
  outfit: number
  look: number
  isShiny: boolean
  steps: CrewStep[]
  startedAt: number
  /** When it finished or stopped; 0 while it works. */
  endedAt: number
  /** New input and output tokens its requests used (cache re-reads left out). */
  tokens: number
  /** What it has done and said, oldest first; the sidebar shows it unfolded. */
  log: CrewLogLine[]
}

/** The mission's clock and meter; 0 for a time not reached yet. */
export type CrewMission = { startedAt: number; endedAt: number; tokens: number }

/** A line the band shows for a few seconds in place of the step. */
export type CrewFlash = { text: string; tone: 'success' | 'error'; until: number }

/** The crew's record across every session, kept in the plugin's store. */
export type CrewStats = {
  agents: number
  missions: number
  flawless: number
  failed: number
  shinies: number
  unlocked: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'mission-crew': {
      plan: Shaped<CrewPlan>
      agents: Shaped<CrewAgent[]>
      stats: Shaped<CrewStats>
      mission: Shaped<CrewMission>
      flash: CrewFlash | null
      /** The crew members the sidebar shows unfolded. */
      expanded: string[]
      /** Whether the sidebar shows the hat collection. */
      isHatsOpen: boolean
      now: number
      isBusy: boolean
      isHidden: boolean
      isCelebrated: boolean
    }
  }
}

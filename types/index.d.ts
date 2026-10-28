export type CrewStepStatus = 'pending' | 'in_progress' | 'completed'

/** One step of a plan; `id` is a task's id when the step came from TaskCreate. */
export type CrewStep = { id?: string; text: string; status: CrewStepStatus }

/** The plan, with the percentage it shows now and the one it showed before. */
export type CrewPlan = { steps: CrewStep[]; pct: number; prevPct: number }

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
}

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
      isBusy: boolean
      isHidden: boolean
      isCelebrated: boolean
    }
  }
}

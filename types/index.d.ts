export type CrewStepStatus = 'pending' | 'in_progress' | 'completed'

/** One step of the plan; `id` is a task's id when the step came from TaskCreate. */
export type CrewStep = { id?: string; text: string; status: CrewStepStatus }

/** The plan, with the percentage it shows now and the one it animates from. */
export type CrewPlan = { steps: CrewStep[]; pct: number; prevPct: number }

/** One subagent, dressed up: its outfit and look are picked from its id. */
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
  startedAt: number
}

declare module 'claude-code' {
  interface PluginState {
    'mission-crew': {
      plan: Shaped<CrewPlan>
      agents: Shaped<CrewAgent[]>
      isBusy: boolean
      isHidden: boolean
    }
  }
}

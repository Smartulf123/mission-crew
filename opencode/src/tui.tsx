/** @jsxImportSource @opentui/solid */
// Crew for OpenCode: in the session sidebar, the mission (the step under way
// in the to-do list, with a bar) beside one Claude at his laptop, then the
// crew, a pixel Claude in a hat for every subagent with its task, what it is
// doing now, and its time and tokens. The figures are Claude Crew's own.
// `/crew-demo` plays a made-up mission, to see every pose without a task.
import { createEffect, createMemo, createSignal, For, Index, onCleanup, Show } from 'solid-js'
import { Plugin, usePlugin } from '@opencode/plugin/tui'
import {
  activityOf,
  bar,
  demoAt,
  DEMO_DONE_MS,
  DEMO_MS,
  dress,
  elapsed,
  fit,
  missionOf,
  stepsOf,
  tokenCount,
  type Mission,
  type Step,
} from './crew'
import { cells, FRAME_MS, guy, SLOW, type GuyMode, type Seg } from './pixels'
import { playSound } from './sound'

const CLAUDE = '#D97757'
const GOLD = '#F2B83A'
const WIDTH = 36
const BAR = 12
// Beside a figure there is room for this much text.
const BESIDE = WIDTH - 12
// The clock for times, bars and who is done ticks four times a second; the
// pictures have their own, faster frame (FRAME_MS).
const CLOCK_MS = 250
// How long a finished helper cheers, and a finished mission jumps.
const CHEER_MS = 6000
const PARTY_MS = 8000
// Past this many helpers each one shrinks to a single line.
const ROOMY = 5

type Tool = { name: string; status: string; input: unknown; at: number }

/** One helper as the sidebar draws it, from a live session or the demo. */
type Helper = {
  id: string
  title: string
  state: 'running' | 'succeeded' | 'failed' | 'stopped' | 'waiting'
  doing: string
  own?: Mission
  startedAt: number
  endedAt?: number
  tokens: number
}

/** What the sidebar shows: the mission, its time and tokens, and the crew. */
type View = {
  mission?: Mission
  missionStartedAt?: number
  missionDoneAt?: number
  isBusy: boolean
  helpers: Helper[]
  /** The clock this view runs on: real time, or time into the demo. */
  at: number
}

type DemoState = { startedAt: number }

/** One figure, as rows of coloured runs of block characters. */
function Figure(props: { rows: Seg[][] }) {
  return (
    <box flexDirection="column" flexShrink={0}>
      <Index each={props.rows}>
        {row => (
          <text>
            <Index each={row()}>{seg => <span style={{ fg: seg().fg, bg: seg().bg }}>{seg().text}</span>}</Index>
          </text>
        )}
      </Index>
    </box>
  )
}

/** A bar in the Claude colour with its percentage. */
function Bar(props: { pct: number; faint: string }) {
  return (
    <text>
      <span style={{ fg: CLAUDE }}>{bar(props.pct, BAR)[0]}</span>
      <span style={{ fg: props.faint }}>{bar(props.pct, BAR)[1]}</span>
      <span style={{ fg: CLAUDE }}>{` ${props.pct}%`}</span>
    </text>
  )
}

function Crew(props: { sessionID: string; demo: DemoState }) {
  const context = usePlugin()
  const theme = () => context.theme
  const faint = () => theme().text.faint as unknown as string
  const [now, setNow] = createSignal(Date.now())
  const [frame, setFrame] = createSignal(0)
  const clock = setInterval(() => setNow(Date.now()), CLOCK_MS)
  const frames = setInterval(() => setFrame(f => f + 1), FRAME_MS)
  onCleanup(() => {
    clearInterval(clock)
    clearInterval(frames)
  })
  // The calm frame changes a fifth as often, so a working figure redraws only then.
  const calm = createMemo(() => Math.floor(frame() / SLOW) * SLOW)
  const frameFor = (mode: GuyMode) => (mode === 'done' ? frame() : mode === 'idle' ? 0 : calm())

  // ------------------------------------------------------------ live data

  const root = createMemo(() => context.data.session.root(props.sessionID))
  const sessions = createMemo(() =>
    context.data.session
      .list()
      .filter(one => one.id !== root() && context.data.session.root(one.id) === root())
      .sort((a, b) => a.time.created - b.time.created),
  )

  // Messages are fetched once per session; after that the cache follows the
  // server's events by itself.
  const synced = new Set<string>()
  createEffect(() => {
    for (const id of [root(), ...sessions().map(one => one.id)]) {
      if (!synced.has(id)) {
        synced.add(id)
        void context.data.session.message.sync(id)
      }
    }
  })

  const toolsOf = (id: string): Tool[] =>
    context.data.session.message.list(id).flatMap(message =>
      message.type === 'assistant'
        ? message.content.flatMap(part =>
            part.type === 'tool'
              ? [{ name: part.name, status: part.state.status, input: part.state.input, at: part.time.completed ?? part.time.created }]
              : [],
          )
        : [],
    )
  const plans = (id: string) => toolsOf(id).filter(tool => tool.name === 'todowrite' && tool.status !== 'streaming')
  const stepsIn = (id: string): Step[] => stepsOf(plans(id).at(-1)?.input)
  const isRunning = (id: string) => context.data.session.status(id) === 'running'
  const tokensOf = (id: string) => {
    const t = context.data.session.get(id)?.tokens
    return t ? t.input + t.output + t.reasoning + t.cache.write : 0
  }

  const live = (): View => {
    const helpers = sessions().map((session): Helper => {
      const running = isRunning(session.id)
      const outcome = session.outcome
      const last = toolsOf(session.id)
        .filter(tool => tool.name !== 'todowrite')
        .at(-1)
      return {
        id: session.id,
        title: session.title ?? 'On a secret mission',
        state: running
          ? 'running'
          : outcome === 'succeeded'
            ? 'succeeded'
            : outcome === 'failed'
              ? 'failed'
              : outcome === 'interrupted'
                ? 'stopped'
                : 'waiting',
        doing: last ? activityOf(last.name, last.input) : 'Warming up',
        own: missionOf(stepsIn(session.id)),
        startedAt: session.time.created,
        endedAt: running ? undefined : (session.time.idle ?? session.time.updated),
        tokens: tokensOf(session.id),
      }
    })
    const mission = missionOf(stepsIn(root()))
    const list = plans(root())
    return {
      mission,
      missionStartedAt: list[0]?.at,
      missionDoneAt: mission?.isDone ? list.at(-1)?.at : undefined,
      isBusy: isRunning(root()) || helpers.some(one => one.state === 'running'),
      helpers,
      at: now(),
    }
  }

  // ------------------------------------------------------------ the demo

  const demoMs = () => now() - props.demo.startedAt
  const isDemo = () => props.demo.startedAt > 0 && demoMs() < DEMO_MS
  const demo = (): View => {
    const at = demoMs()
    const d = demoAt(at)
    const helpers = d.helpers.map((one): Helper => ({ ...one, own: missionOf(one.steps) }))
    return {
      mission: missionOf(d.steps),
      missionStartedAt: 0,
      missionDoneAt: d.missionDoneAt,
      isBusy: d.missionDoneAt === undefined,
      helpers,
      at,
    }
  }

  const view = createMemo(() => (isDemo() ? demo() : live()))
  const crew = createMemo(() => dress(view().helpers.map(one => one.id)))
  const working = () => view().helpers.filter(one => one.state === 'running').length

  // ------------------------------------------------------------ drawing

  const isParty = () => {
    const done = view().missionDoneAt
    return done !== undefined && view().at - done < PARTY_MS
  }
  const bossMode = (): GuyMode => (isParty() ? 'done' : view().isBusy ? 'work' : 'idle')
  const boss = () => cells(guy({ mode: bossMode(), outfit: -1, seed: 5, frame: frameFor(bossMode()) }))
  const missionMeter = () => {
    const v = view()
    const tokens = v.helpers.reduce((sum, one) => sum + one.tokens, isDemo() ? 0 : tokensOf(root()))
    const start = v.missionStartedAt
    return [
      start === undefined ? '' : elapsed((v.missionDoneAt ?? v.at) - start),
      tokens > 0 ? `${tokenCount(tokens)} tokens` : '',
    ]
      .filter(Boolean)
      .join(' · ')
  }

  const modeOf = (one: Helper): GuyMode => {
    if (one.state === 'running') {
      return 'work'
    }
    if (one.state === 'failed' || one.state === 'stopped') {
      return 'fail'
    }
    return one.state === 'succeeded' && view().at - (one.endedAt ?? 0) < CHEER_MS ? 'done' : 'idle'
  }
  const doingOf = (one: Helper) =>
    one.state === 'succeeded' ? '✓ Done' : one.state === 'failed' ? '✗ Failed' : one.state === 'stopped' ? '■ Stopped' : one.doing
  const doingColor = (one: Helper) =>
    one.state === 'running' || one.state === 'waiting'
      ? CLAUDE
      : one.state === 'succeeded'
        ? theme().text.muted
        : theme().text.feedback.error.base
  const meterOf = (one: Helper) =>
    [elapsed((one.endedAt ?? view().at) - one.startedAt), one.tokens > 0 ? `${tokenCount(one.tokens)} tokens` : '']
      .filter(Boolean)
      .join(' · ')

  return (
    <Show when={view().mission !== undefined || view().helpers.length > 0}>
      <box flexDirection="column" marginTop={1}>
        <box flexDirection="row" gap={1}>
          <Figure rows={boss()} />
          <box flexDirection="column" marginTop={3}>
            <text>
              <span style={{ fg: CLAUDE }}>
                <b>{view().mission?.isDone ? 'MISSION COMPLETE!' : view().mission ? 'MISSION' : 'THE CREW'}</b>
              </span>
              <Show when={isDemo()}>
                <span style={{ fg: faint() }}>{'  demo'}</span>
              </Show>
            </text>
            <Show
              when={view().mission}
              fallback={<text fg={theme().text.muted}>{`${working()} of ${view().helpers.length} working`}</text>}
            >
              {m => (
                <>
                  <text fg={theme().text.base}>{fit(m().step, BESIDE)}</text>
                  <Bar pct={m().pct} faint={faint()} />
                </>
              )}
            </Show>
            <text fg={theme().text.faint}>{fit(missionMeter(), BESIDE)}</text>
          </box>
        </box>

        <Show when={view().helpers.length > 0}>
          <text fg={theme().text.muted} marginTop={1}>
            <b>{`THE CREW · ${working()} WORKING · ${view().helpers.length - working()} FINISHED`}</b>
          </text>
          <For each={view().helpers.map(one => one.id)}>
            {id => {
              const one = () => view().helpers.find(h => h.id === id)
              const member = () => crew().get(id)
              // The demo always has one gold Claude, to show what one looks like.
              const isShiny = () => member()?.isShiny === true || (isDemo() && id === 'demo-2')
              const name = () => `${isShiny() ? '★ ' : ''}${member()?.name ?? 'Sir Pixel'}`
              const mode = (): GuyMode => {
                const h = one()
                return h ? modeOf(h) : 'idle'
              }
              const figure = () =>
                cells(
                  guy({
                    mode: mode(),
                    outfit: member()?.outfit ?? 0,
                    look: member()?.look ?? 0,
                    seed: member()?.seed ?? 0,
                    isShiny: isShiny(),
                    // A resting figure reads no frame, so a resting crew does not redraw.
                    frame: frameFor(mode()),
                  }),
                )
              return (
                <Show when={one()}>
                  {h => (
                    <Show
                      when={view().helpers.length <= ROOMY}
                      fallback={
                        <text>
                          <span style={{ fg: isShiny() ? GOLD : CLAUDE }}>
                            <b>{name()}</b>
                          </span>
                          <span style={{ fg: doingColor(h()) }}>{`  ${fit(doingOf(h()), WIDTH - name().length - 2)}`}</span>
                        </text>
                      }
                    >
                      <box flexDirection="row" gap={1}>
                        <Figure rows={figure()} />
                        <box flexDirection="column" marginTop={2}>
                          <text>
                            <span style={{ fg: isShiny() ? GOLD : theme().text.base }}>
                              <b>{fit(name(), BESIDE)}</b>
                            </span>
                          </text>
                          <text fg={theme().text.muted}>{fit(h().title, BESIDE)}</text>
                          <Show when={h().own}>{o => <Bar pct={o().pct} faint={faint()} />}</Show>
                          <text fg={doingColor(h())}>{fit(doingOf(h()), BESIDE)}</text>
                          <text fg={theme().text.faint}>{fit(meterOf(h()), BESIDE)}</text>
                        </box>
                      </box>
                    </Show>
                  )}
                </Show>
              )
            }}
          </For>
        </Show>
      </box>
    </Show>
  )
}

export default Plugin.define({
  id: 'opencode-crew',
  setup(context) {
    const [demo, setDemo] = context.storage.memory<DemoState>('demo', { initial: { startedAt: 0 } })
    // `"options": { "sound": false }` beside the plugin in cli.json silences it.
    const isSoundOn = context.options?.sound !== false
    const jingle = () => isSoundOn && playSound('mission-complete')

    // The jingle plays when a mission's to-do list turns all done. This
    // listens to the server, so it plays with the sidebar closed too.
    const wasDone = new Map<string, boolean>()
    const checkPlan = (sessionID: string, toolID: string) => {
      const tool = context.data.session.message
        .list(sessionID)
        .flatMap(message => (message.type === 'assistant' ? message.content : []))
        .find(part => part.type === 'tool' && part.id === toolID)
      if (tool?.type !== 'tool' || tool.name !== 'todowrite') {
        return tool !== undefined
      }
      const isDone = missionOf(stepsOf(tool.state.input))?.isDone === true
      if (isDone && wasDone.get(sessionID) !== true) {
        jingle()
      }
      wasDone.set(sessionID, isDone)
      return true
    }
    const stopListening = context.data.on('session.tool.success', event => {
      const { sessionID, id } = event.data
      // Only the main session's list is the mission; a helper's is its own.
      if (context.data.session.root(sessionID) !== sessionID) {
        return
      }
      if (!checkPlan(sessionID, id)) {
        void context.data.session.message.sync(sessionID).then(() => checkPlan(sessionID, id))
      }
    })
    let demoJingle: ReturnType<typeof setTimeout> | undefined
    context.keymap.layer(() => ({
      mode: 'global',
      commands: [
        {
          id: 'crew.demo',
          title: 'Play the crew demo',
          group: 'Crew',
          palette: true,
          slash: { name: 'crew-demo' },
          run: () => {
            setDemo(draft => {
              draft.startedAt = Date.now()
            })
            clearTimeout(demoJingle)
            demoJingle = setTimeout(jingle, DEMO_DONE_MS)
            context.ui.toast.show({ message: 'Crew demo started: open the sidebar (ctrl+x b) to watch.', variant: 'info' })
          },
        },
      ],
    }))
    context.ui.slot({
      prepend: 'sidebar.content',
      render: input => <Crew sessionID={input.sessionID} demo={demo} />,
    })
    return () => {
      stopListening()
      clearTimeout(demoJingle)
    }
  },
})

// Draws the real sidebar in OpenTUI's test renderer, with a stand-in for
// OpenCode that has no sessions, so the sidebar shows the demo mission.
import { createComponent } from 'solid-js'
import { createStore, produce } from 'solid-js/store'
import { testRender } from '@opentui/solid'
import { PluginContextProvider } from '@opencode/plugin/tui'
import plugin from '../src/tui'

function fakeOpenCode() {
  const found: { slot?: any; demo?: any } = {}
  const context: any = {
    theme: { text: { base: '#E8E2DA', muted: '#A39D96', faint: '#6B6560', feedback: { error: { base: '#E5534B' } } } },
    // Quiet: the jingle is not for tests.
    options: { sound: false },
    data: {
      on: () => () => {},
      session: {
        root: (id: string) => id,
        list: () => [],
        status: () => 'idle',
        get: () => undefined,
        message: { list: () => [], sync: async () => {} },
      },
    },
    storage: {
      memory: (_key: string, { initial }: any) => {
        const [store, set] = createStore(initial)
        found.demo = { store, set }
        return [store, (fn: any) => set(produce(fn))]
      },
    },
    keymap: { layer: () => {} },
    ui: { slot: (claim: any) => (found.slot = claim), toast: { show: () => {} } },
  }
  plugin.setup(context)
  return { context, found }
}

/** The sidebar `ms` into the demo, as text and as coloured spans. */
export async function demoFrame(ms: number, size = { width: 40, height: 64 }) {
  const { context, found } = fakeOpenCode()
  found.demo.set('startedAt', Date.now() - ms)
  // The provider must wrap the sidebar as it is created, so its children are a getter.
  const setup = await testRender(
    () =>
      createComponent(PluginContextProvider, {
        value: context,
        get children() {
          return found.slot.render({ sessionID: 'root' })
        },
      }),
    size,
  )
  await setup.renderOnce()
  const text = setup.captureCharFrame()
  const spans = setup.captureSpans()
  await setup.dispose()
  return { text, spans }
}

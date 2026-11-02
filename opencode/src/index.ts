// The server part does nothing; it is here so that OpenCode, which loads a
// plugin added with `opencode plugin add` through its server part, also
// loads the sidebar beside it (./tui).
import { Plugin } from '@opencode/plugin'

export default Plugin.define({
  id: 'opencode-crew.server',
  setup() {},
})

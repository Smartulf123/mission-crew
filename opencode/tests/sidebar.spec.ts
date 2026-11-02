import { expect, test } from 'bun:test'
import { demoFrame } from './harness'

test('the demo draws the mission and every kind of crew member', async () => {
  const working = (await demoFrame(10_000)).text
  expect(working).toContain('MISSION')
  expect(working).toContain('THE CREW · 3 WORKING · 0 FINISHED')
  expect(working).toContain('Reading auth.ts')

  const mixed = (await demoFrame(21_000)).text
  expect(mixed).toContain('✓ Done')
  expect(mixed).toContain('✗ Failed')
  expect(mixed).toContain('★')

  const done = (await demoFrame(33_000)).text
  expect(done).toContain('MISSION COMPLETE!')
  expect(done).toContain('THE CREW · 0 WORKING · 4 FINISHED')
}, 30_000)

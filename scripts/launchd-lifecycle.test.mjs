import test from 'node:test'
import assert from 'node:assert/strict'
import { waitForProcessesToExit } from './launchd-lifecycle.mjs'

test('bootstrap is held until every process has completed asynchronous termination', async () => {
  let elapsed = 0
  let bootstrapped = false
  const exiting = pid => elapsed < (pid === 1 ? 200 : 500)
  await waitForProcessesToExit([1, 2], { isAlive: exiting, now: () => elapsed, sleep: async ms => { assert.equal(bootstrapped, false); elapsed += ms } })
  assert.equal(exiting(1), false); assert.equal(exiting(2), false)
  bootstrapped = true
  assert.equal(elapsed, 500)
})
test('a process that does not exit causes a bounded failure without starting a replacement', async () => {
  let elapsed = 0
  await assert.rejects(waitForProcessesToExit([1], { isAlive: () => true, now: () => elapsed, sleep: async ms => { elapsed += ms }, timeoutMs: 300 }), /未启动重复实例/)
  assert.equal(elapsed, 300)
})
test('stopped services require no wait', async () => {
  await waitForProcessesToExit([], { sleep: async () => { throw new Error('Unexpected wait') } })
})

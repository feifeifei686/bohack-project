import test from 'node:test'
import assert from 'node:assert/strict'
import { createProjectStorage, decodeProjectEnvelope, ProjectDraftConflictError, projectDraftRevision, type ProjectStorageBackend } from '../versions/lucid/src/project-storage.ts'
import { decodeRoomPlanningSnapshot, decodeWallSnapshot, type RoomPlanningSnapshot } from './planning-snapshot.ts'

const decode = (value: unknown) => {
  if (!value || typeof value !== 'object' || !('text' in value) || typeof value.text !== 'string') throw new Error('invalid draft')
  return { text: value.text }
}
function memoryBackend(initial?: unknown) {
  let saved = initial
  const writes: unknown[] = []
  const backend: ProjectStorageBackend = {
    read: async () => saved,
    write: async value => { saved = structuredClone(value); writes.push(saved) },
    remove: async () => { saved = undefined },
  }
  return { backend, writes, value: () => saved }
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve))

test('a corrupt or unsupported draft cannot be overwritten by automatic saves', async () => {
  for (const bad of [{ schema: 2, savedAt: new Date().toISOString(), data: { text: 'important' } }, { schema: 1, savedAt: 'invalid', data: {} }, { schema: 1, savedAt: new Date().toISOString(), data: { text: 5 } }]) {
    const memory = memoryBackend(bad)
    const store = createProjectStorage({ decode, backend: memory.backend })
    await assert.rejects(store.save({ text: '' }), /保护原记录/)
    await assert.rejects(store.load())
    await assert.rejects(store.save({ text: '' }), /保护原记录/)
    assert.deepEqual(memory.value(), bad)
    const raw = await store.readRaw()
    assert.deepEqual(raw, bad)
    ;(raw as { schema: number }).schema = 99
    assert.deepEqual(memory.value(), bad, 'backup reads cannot mutate the retained record')
    await assert.rejects(store.save({ text: '' }), /保护原记录/, 'reading raw backup must not unlock writes')
    assert.equal(memory.writes.length, 0)
    assert.equal(store.status().phase, 'error')
  }
})

test('blocked reads are reported without removing or replacing the existing draft', async () => {
  const backend: ProjectStorageBackend = { read: async () => { throw new Error('blocked') }, write: async () => assert.fail('must not write'), remove: async () => assert.fail('must not remove') }
  const store = createProjectStorage({ decode, backend })
  await assert.rejects(store.load(), /blocked/)
  await assert.rejects(store.save({ text: 'new' }))
  assert.equal(store.status().message, 'blocked')
})

test('queued saves capture their call-time state and always write newest last', async () => {
  const memory = memoryBackend()
  let unblock!: () => void
  let first = true
  const backend: ProjectStorageBackend = { ...memory.backend, write: async value => {
    if (first) { first = false; await new Promise<void>(resolve => { unblock = resolve }) }
    await memory.backend.write(value)
  } }
  const store = createProjectStorage({ decode, backend })
  await store.load()
  const state = { text: 'first' }
  const one = store.save(state)
  state.text = 'second'
  const two = store.save(state)
  state.text = 'not scheduled'
  await tick()
  assert.equal(memory.writes.length, 0)
  unblock()
  await Promise.all([one, two])
  assert.deepEqual(memory.writes.map(value => decodeProjectEnvelope(value, decode).data.text), ['first', 'second'])
  assert.equal(store.status().phase, 'saved')
  assert.equal((await createProjectStorage({ decode, backend: memory.backend }).load())?.data.text, 'second')
})

test('a quota failure is visible, flush fails, and a later save can retry', async () => {
  const memory = memoryBackend()
  let fail = true
  const store = createProjectStorage({ decode, backend: { ...memory.backend, write: async value => {
    if (fail) throw new Error('quota')
    await memory.backend.write(value)
  } } })
  await store.load()
  await assert.rejects(store.save({ text: 'keep in memory' }), /quota/)
  await assert.rejects(store.flush(), /quota/)
  assert.equal(store.status().phase, 'error')
  fail = false
  await store.save({ text: 'retry' })
  assert.equal(store.status().phase, 'saved')
  assert.equal(decodeProjectEnvelope(memory.value(), decode).data.text, 'retry')
})

test('explicit clear waits for earlier writes and a subsequent new draft survives', async () => {
  const memory = memoryBackend()
  const store = createProjectStorage({ decode, backend: memory.backend })
  await store.load()
  const first = store.save({ text: 'old project' })
  const clear = store.clear()
  const second = store.save({ text: 'new project' })
  await Promise.all([first, clear, second])
  assert.equal(decodeProjectEnvelope(memory.value(), decode).data.text, 'new project')
  assert.equal(store.status().phase, 'saved')
})

test('a stale tab refuses to overwrite a newer draft and can reload it explicitly', async () => {
  const memory = memoryBackend()
  const backend: ProjectStorageBackend = { ...memory.backend, write: async (value, expected) => {
    if (projectDraftRevision(memory.value()) !== expected) throw new ProjectDraftConflictError()
    await memory.backend.write(value)
  } }
  const first = createProjectStorage({ decode, backend })
  const stale = createProjectStorage({ decode, backend })
  await Promise.all([first.load(), stale.load()])
  await first.save({ text: 'newer from first tab' })
  await assert.rejects(stale.save({ text: 'stale overwrite' }), ProjectDraftConflictError)
  assert.match(stale.status().message!, /另一个页面/)
  assert.equal(decodeProjectEnvelope(await stale.readRaw(), decode).data.text, 'newer from first tab')
  await assert.rejects(stale.save({ text: 'automatic retry' }), /保护原记录/)
  assert.equal((await stale.load())?.data.text, 'newer from first tab')
  await stale.save({ text: 'after explicit restore' })
  assert.equal(decodeProjectEnvelope(memory.value(), decode).data.text, 'after explicit restore')
})

const planningFixture = (): RoomPlanningSnapshot => ({
  schema: 1,
  model: {
    drawing: 'data:image/jpeg;base64,AAAA', drawingAspect: 1.4, recognized: true, analysisState: 'ready',
    rooms: [{ id: 'r1', name: '卫生间', previousNames: ['浴室'], bounds: [1, 1, 3, 3], label: [2, 2], material: 'tile', polygon: [[1, 1], [4, 1], [4, 4], [1, 4]] }],
    walls: [{ roomId: 'r1', start: [1, 1], end: [4, 1] }],
    openings: [{ roomId: 'r1', kind: 'door', start: [2, 1], end: [3, 1] }],
    furniture: [{ id: 'sink1', roomId: 'r1', kind: 'sink', bounds: [1, 2, 1, 1], rotation: 90, confidence: 0.8 }],
  },
  selectedRoomId: 'r1', stage: 'walls',
  walls: { schema: 1, mode: 'wall', amount: 0.7, roomId: 'r1', wallId: 'wall-0-0', preview: true, marked: ['wall-0-0'], annotations: [['wall-0-0', { type: 'partition', note: '结构图待核实' }]] },
})

test('planning restore preserves drawing, openings, room aliases and wall intentions independently', () => {
  const saved = planningFixture()
  const restored = decodeRoomPlanningSnapshot(saved)
  assert.deepEqual(restored, saved)
  restored.model.rooms[0].name = 'changed'
  restored.walls.annotations[0][1].note = 'changed'
  assert.equal(saved.model.rooms[0].name, '卫生间')
  assert.equal(saved.walls.annotations[0][1].note, '结构图待核实')
})

test('restoring interrupted recognition does not restart it and removed rooms return to drawing', () => {
  const saved = planningFixture()
  saved.model.analysisState = 'pending'
  saved.model.rooms = []
  const restored = decodeRoomPlanningSnapshot(saved)
  assert.equal(restored.model.analysisState, 'idle')
  assert.equal(restored.stage, 'drawing')
  assert.equal(restored.selectedRoomId, '')
  assert.equal(saved.model.analysisState, 'pending')
})

test('restoring wall annotations can never re-enable removal on a bearing wall', () => {
  const saved = planningFixture().walls
  saved.annotations[0][1].type = 'bearing'
  const restored = decodeWallSnapshot(saved)
  assert.deepEqual(restored.marked, [])
  assert.equal(restored.preview, false)
})

test('malformed geometry and injected identifiers are refused before UI rendering', () => {
  for (const mutate of [
    (saved: RoomPlanningSnapshot) => { saved.model.rooms[0].id = '\" onload=\"x' },
    (saved: RoomPlanningSnapshot) => { saved.model.rooms[0].bounds[2] = Infinity },
    (saved: RoomPlanningSnapshot) => { saved.model.drawing = 'javascript:alert(1)' },
    (saved: RoomPlanningSnapshot) => { saved.walls.annotations[0][1].type = 'other' as never },
  ]) {
    const saved = planningFixture()
    mutate(saved)
    assert.throws(() => decodeRoomPlanningSnapshot(saved))
  }
})

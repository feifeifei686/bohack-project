import test from 'node:test'
import assert from 'node:assert/strict'
import { planningRoomMatches, renamePlanningRoom } from './planning-room-links.ts'
import type { PlanningModel } from './planning-floorplan.ts'

test('room rename preserves current and historical requirement references without mutating snapshots', () => {
  const model: PlanningModel = { rooms: [
    { id: 'r1', name: '次卧A', bounds: [0,0,3,3], label: [1,1], material: 'wood' },
    { id: 'r2', name: '主卧', bounds: [3,0,3,3], label: [4,1], material: 'wood' },
  ] }
  const snapshot = Object.freeze(['次卧A']) as unknown as string[]
  const room = model.rooms[0]
  assert.equal(renamePlanningRoom(model, room, '儿童房'), true)
  assert.equal(planningRoomMatches(room, snapshot), true)
  assert.equal(planningRoomMatches(room, ['儿童房']), true)
  assert.equal(renamePlanningRoom(model, room, '书房'), true)
  assert.equal(planningRoomMatches(room, ['儿童房']), true)
  assert.equal(planningRoomMatches(room, snapshot), true)
  assert.equal(renamePlanningRoom(model, model.rooms[1], '次卧A'), false)
  assert.equal(renamePlanningRoom(model, room, '次卧A'), true)
  assert.equal(room.id, 'r1')
  assert.deepEqual(snapshot, ['次卧A'])
})

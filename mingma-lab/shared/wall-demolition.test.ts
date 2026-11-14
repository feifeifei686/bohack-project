import test from 'node:test'
import assert from 'node:assert/strict'
import { buildWallPieces, expandedWallIds, wallOffset, annotateWall, toggleWallRemoval, type WallAnnotation } from './wall-demolition-data.ts'
import type { PlanningModel } from './planning-floorplan.ts'
import type { PlanSegment } from './planning-recognized.ts'

const model:PlanningModel={rooms:[
  {id:'a',name:'客厅',bounds:[0,0,3,4],label:[1,2],material:'wood'},
  {id:'b',name:'厨房',bounds:[3,0,3,4],label:[4,2],material:'stone'},
],openings:[{roomId:'a',kind:'door',start:[3,1],end:[3,2]}]}
const source:PlanSegment[]=[
  {roomId:'a',start:[3,0],end:[3,4]},
  {roomId:'b',start:[3,4],end:[3,0]},
  {roomId:'a',start:[0,0],end:[0,4]},
]

test('shared walls are unique, retain both adjacent rooms and keep door openings clear',()=>{
  const before=JSON.stringify({model,source}),walls=buildWallPieces(model,source)
  assert.equal(walls.length,3)
  assert.deepEqual(walls[0].roomIds,['a','b'])
  assert.deepEqual(walls[1].roomIds,['a','b'])
  assert.deepEqual(walls.slice(0,2).map(w=>[w.start[1],w.end[1]]),[[0,1],[2,4]])
  assert.equal(new Set(walls.map(w=>w.id)).size,3)
  assert.equal(JSON.stringify({model,source}),before)
})

test('whole, room and single-wall expansion affect only the intended pieces',()=>{
  const walls=buildWallPieces(model,source)
  assert.equal(expandedWallIds(walls,'all','b',walls[0].id).size,3)
  assert.deepEqual([...expandedWallIds(walls,'room','b',walls[0].id)],walls.slice(0,2).map(w=>w.id))
  assert.deepEqual([...expandedWallIds(walls,'wall','b',walls[1].id)],[walls[1].id])
  assert.equal(expandedWallIds(walls,'wall','b','missing').size,0)
  assert.deepEqual(buildWallPieces(model,[]),[])
})

test('offsets remain finite even for a wall centered on the house',()=>{
  const walls=buildWallPieces(model,source)
  for(const w of walls) {
    const offset=wallOffset(w,[(w.start[0]+w.end[0])/2,(w.start[1]+w.end[1])/2])
    assert.ok(offset.every(Number.isFinite))
    assert.ok(Math.hypot(...offset)>0)
  }
})

test('bearing annotation removes a prior removal intent and blocks subsequent removal',()=>{
  const annotations=new Map<string,WallAnnotation>(),marked=new Set<string>()
  assert.equal(toggleWallRemoval(annotations,marked,'wall-a'),true)
  assert.ok(marked.has('wall-a'))
  annotateWall(annotations,marked,'wall-a','bearing')
  assert.equal(marked.has('wall-a'),false)
  assert.equal(toggleWallRemoval(annotations,marked,'wall-a'),false)
  assert.equal(marked.size,0)
  assert.equal(annotations.has('wall-b'),false)
})

test('changing a structural annotation preserves its user note and never auto-marks removal',()=>{
  const annotations=new Map<string,WallAnnotation>([['wall-a',{type:'bearing',note:'用户提供的结构资料编号'}]]),marked=new Set<string>()
  annotateWall(annotations,marked,'wall-a','partition')
  assert.equal(marked.size,0)
  assert.equal(annotations.get('wall-a')!.note,'用户提供的结构资料编号')
  annotateWall(annotations,marked,'wall-a','unknown')
  assert.equal(annotations.get('wall-a')!.type,'unknown')
  assert.equal(marked.size,0)
})

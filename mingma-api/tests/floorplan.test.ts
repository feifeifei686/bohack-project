import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { floorplanMessages, validateFloorplanInput, validateFloorplanOutput } from '../src/floorplan.ts'

const sample=JSON.parse(readFileSync(new URL('../examples/floorplan-result.json',import.meta.url),'utf8'))
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRXsAAAAASUVORK5CYII='
test('image input accepts encoded PNG but rejects URLs, forged MIME and extra fields',()=>{
  assert.equal(validateFloorplanInput({image:png}).image,png)
  for(const raw of [{image:'http://localhost/private'},{image:png.replace('image/png','image/jpeg')},{image:png,model:'untrusted'},{image:'data:image/png;base64,YWJj'}]) assert.throws(()=>validateFloorplanInput(raw))
  const parts=floorplanMessages(png)[1]!.content
  assert.ok(Array.isArray(parts));assert.equal(parts[1]!.type,'image_url')
})
test('geometry preserves concave rooms and visible furniture; missing furniture stays empty',()=>{
  const result=validateFloorplanOutput(sample)
  assert.equal(result.rooms[0]!.polygon.length,6)
  assert.equal(result.furniture[0]!.rotation,90)
  assert.deepEqual(validateFloorplanOutput({...sample,furniture:[]}).furniture,[])
})
test('invalid polygons, duplicate IDs, missing room references and no floor plan are explicit errors',()=>{
  assert.throws(()=>validateFloorplanOutput({...sample,rooms:[]}),{code:'FLOORPLAN_NOT_FOUND'})
  assert.throws(()=>validateFloorplanOutput({...sample,rooms:[sample.rooms[0],sample.rooms[0]]}),{code:'AI_INVALID_OUTPUT'})
  const self=structuredClone(sample);self.rooms[0].polygon=[[100,100],[600,800],[600,100],[100,600]]
  assert.throws(()=>validateFloorplanOutput(self),{code:'AI_INVALID_OUTPUT'})
  assert.throws(()=>validateFloorplanOutput({...sample,furniture:[{...sample.furniture[0],roomId:'missing'}]}),{code:'AI_INVALID_OUTPUT'})
  assert.throws(()=>validateFloorplanOutput({...sample,rooms:[{...sample.rooms[0],id:'" onclick="x'}]}))
})

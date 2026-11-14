import test from 'node:test'
import assert from 'node:assert/strict'
import { saveRoomRequirements, combinedRoomDocument, type RoomWork } from './room-work.ts'
import { newIntakeState, adoptionPayload } from './intake-state.ts'
const item = {id:'N001',title:'保留柜体',scope:'area' as const,areas:['卫生间'],category:'柜体',component:'柜体',description:'保留现有柜体',origin:'user' as const,necessity:'must' as const,clarity:'clear' as const,evidence:[],standards:[],pending:[],dependencies:[]}
const doc = {version:2 as const,brief:'保留柜体',areas:['卫生间'],answers:[],projectContext:[],result:{summary:'保留柜体',items:[item],questions:[],conflicts:[],readyForDraft:true,stopReason:'',warnings:[]},acceptedSuggestionIds:[],reviewedIds:['N001'],adoptedAt:new Date().toISOString()}
const req = {id:'N001',title:item.title,description:item.description,room:'卫生间',category:'柜体',priority:'must' as const,source:'用户',pending:[],intake:item}
const room=(id:string):RoomWork=>({id,name:id,prefix:id,draft:null,requirements:[]})
test('same model IDs in two rooms never collide, resaving only replaces its own room',()=>{
 const a=saveRoomRequirements([],room('bath'),[req],doc)
 const b=saveRoomRequirements(a.requirements,room('living'),[req],doc)
 const original=structuredClone(b.requirements[1])
 const edited=saveRoomRequirements(b.requirements,a.room,[{...req,title:'修改卫生间'}],doc)
 assert.deepEqual(edited.requirements.find(r=>r.id==='living_N001'),original)
 assert.equal(edited.requirements.length,2)
 assert.equal(a.requirements[0].title,'保留柜体')
 const aggregate=combinedRoomDocument([edited.room,b.room])!
 assert.deepEqual(new Set(aggregate.result.items.map(i=>i.id)),new Set(['bath_N001','living_N001']))
 assert.deepEqual(aggregate.reviewedIds,['bath_N001','living_N001'])
})

test('maximum provider IDs stay bounded, survive document validation, and retain identity after reorder', async () => {
 const {validIntakeDocument}=await import('./project-session-validation.ts')
 const id='N'.repeat(64), other='M'.repeat(64)
 const longDoc=structuredClone(doc)
 longDoc.result.items=[{...item,id,dependencies:[other]},{...item,id:other}]
 longDoc.reviewedIds=[id,other]
 const first=saveRoomRequirements([],room('room1'),[{...req,id,intake:longDoc.result.items[0]},{...req,id:other,intake:longDoc.result.items[1]}],longDoc)
 assert(first.requirements.every(r=>r.id.length<=64))
 assert(validIntakeDocument(combinedRoomDocument([first.room])))
 const swapped=structuredClone(longDoc);swapped.result.items.reverse()
 const again=saveRoomRequirements(first.requirements,first.room,[{...req,id:other,intake:swapped.result.items[0]},{...req,id,intake:swapped.result.items[1]}],swapped)
 assert.equal(again.room.idMap![id],first.room.idMap![id])
 assert.equal(again.requirements[1].intake!.dependencies[0],first.room.idMap![other])
 assert(validIntakeDocument(combinedRoomDocument([again.room])))
})

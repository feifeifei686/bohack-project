import type { PlanningModel, PlanningRoom } from './planning-floorplan.ts'
import { splitWall, type PlanSegment } from './planning-recognized.ts'
import type { PlanPoint } from './floorplan-contract.ts'

export type WallExpansionMode = 'all' | 'room' | 'wall'
export type WallPiece = PlanSegment & { id: string; number: string; roomIds: string[] }
export const wallStructureLabels = { unknown: '待核实', bearing: '承重墙', partition: '非承重墙' } as const
export type WallStructure = keyof typeof wallStructureLabels
export type WallAnnotation = { type: WallStructure; note: string }

export function annotateWall(annotations: Map<string, WallAnnotation>, marked: Set<string>, id: string, type: WallStructure): void {
  annotations.set(id, { type, note: annotations.get(id)?.note || '' })
  if (type === 'bearing') marked.delete(id)
}

export function toggleWallRemoval(annotations: Map<string, WallAnnotation>, marked: Set<string>, id: string): boolean {
  if (annotations.get(id)?.type === 'bearing') { marked.delete(id); return false }
  if (marked.has(id)) marked.delete(id)
  else marked.add(id)
  return true
}

export function roomPolygon(room: PlanningRoom): PlanPoint[] {
  const [x,z,w,d] = room.bounds
  return room.polygon || [[x,z],[x+w,z],[x+w,z+d],[x,z+d]]
}

function bordersRoom(wall: PlanSegment, room: PlanningRoom): boolean {
  const p = roomPolygon(room)
  return p.some((a,i) => {
    const b = p[(i+1)%p.length], dx=b[0]-a[0], dy=b[1]-a[1], length=Math.hypot(dx,dy)
    if(length<.01) return false
    const distance = (v:PlanPoint) => Math.abs(dx*(v[1]-a[1])-dy*(v[0]-a[0]))/length
    if(distance(wall.start)>.15 || distance(wall.end)>.15) return false
    const along = (v:PlanPoint) => ((v[0]-a[0])*dx+(v[1]-a[1])*dy)/length
    const u=along(wall.start),v=along(wall.end)
    return Math.min(length,Math.max(u,v))-Math.max(0,Math.min(u,v)) > .08
  })
}

export function buildWallPieces(model: PlanningModel, source: PlanSegment[]): WallPiece[] {
  const unique = new Map<string,WallPiece>()
  source.forEach((wall,index) => {
    splitWall(wall,model.openings || []).forEach((piece,part) => {
      const key=[piece.start,piece.end].map(p=>p.map(v=>v.toFixed(3)).join(',')).sort().join(':')
      const roomIds=[...new Set([piece.roomId,...model.rooms.filter(room=>bordersRoom(piece,room)).map(room=>room.id)])]
      const existing=unique.get(key)
      if(existing) { existing.roomIds=[...new Set([...existing.roomIds,...roomIds])];return }
      unique.set(key,{...piece,id:`wall-${index}-${part}`,number:String(unique.size+1).padStart(2,'0'),roomIds})
    })
  })
  return [...unique.values()]
}

export function expandedWallIds(walls: WallPiece[], mode: WallExpansionMode, roomId: string, wallId: string): Set<string> {
  return new Set(walls.filter(w=>mode==='all'||(mode==='room'?w.roomIds.includes(roomId):w.id===wallId)).map(w=>w.id))
}

export function wallOffset(wall: WallPiece, center: PlanPoint): PlanPoint {
  let x=(wall.start[0]+wall.end[0])/2-center[0],z=(wall.start[1]+wall.end[1])/2-center[1]
  if(Math.hypot(x,z)<.1) { x=wall.end[1]-wall.start[1];z=wall.start[0]-wall.end[0] }
  const length=Math.hypot(x,z)||1
  return [(49*x-33*z)/length*.85,(18*x+24*z)/length*.85-65]
}

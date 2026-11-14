import type { FloorplanResult, PlanPoint, FurnitureKind } from './floorplan-contract'
import type { Bounds, PlanningModel } from './planning-floorplan'

export type PlanFurniture = { id: string; roomId: string; kind: FurnitureKind; bounds: Bounds; rotation: number; confidence: number }
export type PlanSegment = { roomId: string; start: PlanPoint; end: PlanPoint }
export const furnitureNames: Record<FurnitureKind,string> = {bed:'床',sofa:'沙发',table:'桌子',chair:'椅子',cabinet:'柜体',counter:'台面',sink:'水槽',stove:'灶台',toilet:'马桶',bathtub:'浴缸',shower:'淋浴区',washer:'洗衣机',fridge:'冰箱'}
export const escapePlan = (text: string) => text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!)

export function recognizedModel(data: FloorplanResult, drawing: string, drawingAspect: number): PlanningModel {
  const vertices=data.rooms.flatMap(r=>r.polygon)
  const minX=Math.min(...vertices.map(p=>p[0])), maxX=Math.max(...vertices.map(p=>p[0]))
  const minY=Math.min(...vertices.map(p=>p[1])), maxY=Math.max(...vertices.map(p=>p[1]))
  const sy=Math.min(9.7/((maxX-minX)*drawingAspect),7.1/(maxY-minY)), sx=sy*drawingAspect
  const ox=(10-(maxX-minX)*sx)/2-minX*sx, oy=(7.4-(maxY-minY)*sy)/2-minY*sy
  const point=(p:PlanPoint):PlanPoint=>[ox+p[0]*sx,oy+p[1]*sy]
  const segment=(s:PlanSegment)=>({...s,start:point(s.start),end:point(s.end)})
  const rooms=data.rooms.map(r=>{
    const polygon=r.polygon.map(point)
    const xs=polygon.map(p=>p[0]),ys=polygon.map(p=>p[1])
    const bounds:Bounds=[Math.min(...xs),Math.min(...ys),Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)]
    const center:PlanPoint=[bounds[0]+bounds[2]/2,bounds[1]+bounds[3]/2]
    const label=inside(center,polygon)?center:polygon.map((p,i)=>[(p[0]+polygon[(i+1)%polygon.length][0]+center[0])/3,(p[1]+polygon[(i+1)%polygon.length][1]+center[1])/3] as PlanPoint).find(p=>inside(p,polygon)) || polygon[0]
    return {id:r.id,name:r.name,bounds,polygon,label,confidence:r.confidence,material:['bedroom','living','dining'].includes(r.kind)?'wood':r.kind==='bathroom'?'tile':'stone'}
  })
  return {drawing,drawingAspect,recognized:true,analysisState:'ready',imageBounds:[ox,oy,1000*sx,1000*sy],rooms,
    walls:data.walls.map(segment),openings:data.openings.map(s=>({...segment(s),kind:s.kind})),
    furniture:data.furniture.map(f=>({...f,bounds:[ox+f.bounds[0]*sx,oy+f.bounds[1]*sy,f.bounds[2]*sx,f.bounds[3]*sy]})),warnings:data.warnings}
}
export function inside([x,y]:PlanPoint,points:PlanPoint[]) {
  let yes=false
  for(let i=0,j=points.length-1;i<points.length;j=i++) {
    const a=points[i],b=points[j]
    if((a[1]>y)!==(b[1]>y) && x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]) yes=!yes
  }
  return yes
}
export function projectPlan([x,z]:PlanPoint,h=0):PlanPoint {return [300+49*x-33*z,94+18*x+24*z-53*h]}
const pts=(ps:PlanPoint[])=>ps.map(p=>p.map(n=>n.toFixed(2)).join(',')).join(' ')
const rect=([x,y,w,h]:Bounds):PlanPoint[]=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]]
type Color=[string,string,string]
const cream:Color=['#faf4e6','#daceb6','#e8dfcb'],oak:Color=['#dbc5a1','#b89d75','#c7ae87'],sage:Color=['#bbc5ad','#89987e','#a3af96'],white:Color=['#fcfaf0','#d5ded2','#e6ece1']
function prism(polygon:PlanPoint[],height:number,colors:Color,base=0,attributes='') {
  const top=polygon.map(p=>projectPlan(p,base+height)),bottom=polygon.map(p=>projectPlan(p,base))
  // Each edge and the top remain independently addressable by the build animation.
  return `<g data-model-prism='${JSON.stringify([polygon,height,base])}' ${attributes}>${polygon.map((_,i)=>{const j=(i+1)%polygon.length;return `<polygon points="${pts([top[i],top[j],bottom[j],bottom[i]])}" fill="${colors[i%2+1]}"/>`}).join('')}<polygon points="${pts(top)}" fill="${colors[0]}"/></g>`
}
function wallPolygon(start:PlanPoint,end:PlanPoint,thickness=.065):PlanPoint[] {
  const len=Math.hypot(end[0]-start[0],end[1]-start[1])||1,dx=(end[1]-start[1])/len*thickness/2,dy=-(end[0]-start[0])/len*thickness/2
  return [[start[0]+dx,start[1]+dy],[end[0]+dx,end[1]+dy],[end[0]-dx,end[1]-dy],[start[0]-dx,start[1]-dy]]
}
export function splitWall(w:PlanSegment,openings:PlanSegment[]):PlanSegment[] {
  const dx=w.end[0]-w.start[0],dy=w.end[1]-w.start[1],length=Math.hypot(dx,dy)
  if(length<.015) return []
  let intervals:[[number,number]][number][]=[[0,1]]
  for(const o of openings) {
    const distance=(p:PlanPoint)=>Math.abs(dx*(p[1]-w.start[1])-dy*(p[0]-w.start[0]))/length
    if(distance(o.start)>.12 || distance(o.end)>.12) continue
    const t=(p:PlanPoint)=>((p[0]-w.start[0])*dx+(p[1]-w.start[1])*dy)/(length*length)
    const a=Math.max(0,Math.min(t(o.start),t(o.end))),b=Math.min(1,Math.max(t(o.start),t(o.end)))
    if(b<=a) continue
    intervals=intervals.flatMap(([s,e])=>b<=s||a>=e?[[s,e]]:[[s,Math.max(s,a)],[Math.min(e,b),e]].filter(([u,v])=>v-u>.002) as [number,number][])
  }
  return intervals.map(([a,b])=>({...w,start:[w.start[0]+dx*a,w.start[1]+dy*a],end:[w.start[0]+dx*b,w.start[1]+dy*b]}))
}

function furnishing(f:PlanFurniture) {
  const [x,y,w,d]=f.bounds,turn=Math.round(f.rotation/90)%4
  const transform=([u,v]:PlanPoint):PlanPoint=>{const rotated:PlanPoint=turn===1?[1-v,u]:turn===2?[1-u,1-v]:turn===3?[v,1-u]:[u,v];return [x+rotated[0]*w,y+rotated[1]*d]}
  const part=(b:Bounds,h:number,c:Color,base=0)=>prism(rect(b).map(transform),h,c,base)
  let result=''
  switch(f.kind) {
    case 'bed':result=part([0,0,1,1],.22,oak)+part([.03,.04,.94,.92],.13,cream,.22)+part([0,0,1,.07],.60,sage)+part([.07,.13,.39,.17],.06,white,.35)+part([.54,.13,.39,.17],.06,white,.35)+part([.03,.38,.94,.56],.04,sage,.35);break
    case 'sofa':result=part([0,0,1,1],.26,cream)+part([0,0,1,.2],.34,sage,.26)+part([0,.2,.12,.8],.2,sage,.26)+part([.88,.2,.12,.8],.2,sage,.26);break
    case 'chair':result=part([.1,.15,.8,.85],.34,cream)+part([.05,0,.9,.16],.55,sage);break
    case 'table':result=part([.1,.12,.8,.76],.32,oak)+part([0,0,1,1],.07,cream,.32);break
    case 'toilet':result=part([.16,.28,.68,.65],.25,white)+part([.08,0,.84,.28],.50,cream);break
    case 'bathtub':result=part([0,0,1,1],.28,white)+part([.1,.1,.8,.8],.015,sage,.28);break
    case 'sink':result=part([0,0,1,1],.44,cream)+part([.13,.12,.74,.76],.02,sage,.44);break
    case 'stove':result=part([0,0,1,1],.46,cream)+part([.1,.15,.32,.65],.025,sage,.46)+part([.58,.15,.32,.65],.025,sage,.46);break
    case 'shower':result=part([0,0,1,1],.04,white)+part([0,0,1,.035],.7,['#dce8e1','#c4d8cd','#ccdcd3']);break
    case 'fridge':result=part([0,0,1,1],.85,white);break
    case 'washer':result=part([0,0,1,1],.5,white)+part([.18,.15,.64,.65],.02,sage,.5);break
    default:result=part([0,0,1,1],f.kind==='counter'?.45:.65,sage)+part([-.015,-.01,1.03,1.02],.045,cream,f.kind==='counter'?.45:.65)
  }
  return `<g data-plan-furniture="${f.id}" data-floor-feature="${f.kind}" aria-label="${furnitureNames[f.kind]}">${result}</g>`
}

export function renderRecognizedFloorplan(model:PlanningModel,preview:boolean) {
  const walls=model.walls||[],openings=model.openings||[],furniture=model.furniture||[]
  const xs=model.rooms.flatMap(r=>[r.bounds[0],r.bounds[0]+r.bounds[2]]),ys=model.rooms.flatMap(r=>[r.bounds[1],r.bounds[1]+r.bounds[3]])
  const base:Bounds=[Math.min(...xs)-.17,Math.min(...ys)-.17,Math.max(...xs)-Math.min(...xs)+.34,Math.max(...ys)-Math.min(...ys)+.34]
  const rooms=[...model.rooms].sort((a,b)=>a.bounds[0]*18+a.bounds[1]*24-b.bounds[0]*18-b.bounds[1]*24)
  const floor=(r:typeof rooms[number])=>r.polygon||rect(r.bounds)
  const shadow=preview?'recognized-preview-shadow':'recognized-shadow'
  return `<svg class="planning-floorplan" viewBox="0 16 840 485" ${preview?'aria-hidden="true"':'role="group" aria-label="根据上传图纸生成的立体户型"'}>
    <defs><filter id="${shadow}" x="-25%" y="-50%" width="150%" height="200%"><feGaussianBlur stdDeviation="9"/></filter></defs>
    <polygon points="${pts(rect(base).map(p=>projectPlan(p,-.4)))}" fill="#64523b" filter="url(#${shadow})" opacity=".2" data-model-detail/>
    ${prism(rect(base),.17,cream,-.34)}
    <g class="planning-lift-shadow" style="filter:url(#${shadow})" aria-hidden="true">${rooms.map(r=>`<polygon points="${pts(floor(r).map(p=>projectPlan(p,-.1)))}" fill="#5c634b" data-floor-shadow="${r.id}"/>`).join('')}</g>
    <g class="planning-room-layer">${rooms.map(r=>{
      const p=floor(r)
      const solids:(PlanSegment & {h:number})[]=walls.filter(w=>w.roomId===r.id).flatMap(w=>splitWall(w,openings).map(s=>({...s,h:.47})))
      const floors:Color=r.material==='wood'?['#ede0c7','#c5ac86','#d7c2a1']:r.material==='tile'?['#dce6dc','#9dad9c','#b9c9b8']:['#eae6d5','#bfbaa7','#d4ceba']
      const clip=`${preview?'mini':'plan'}-floor-${r.id}`
      const [sx,sy,sw,sd]=r.bounds,lines:string[]=[]
      for(let y=sy+.3;y<sy+sd;y+=.3) lines.push(`<polyline points="${pts([projectPlan([sx,y]),projectPlan([sx+sw,y])])}"/>`)
      if(r.material!=='wood') for(let x=sx+.4;x<sx+sw;x+=.4) lines.push(`<polyline points="${pts([projectPlan([x,sy]),projectPlan([x,sy+sd])])}"/>`)
      const seams=`<defs><clipPath id="${clip}"><polygon points="${pts(p.map(v=>projectPlan(v)))}"/></clipPath></defs><g class="planning-seams" clip-path="url(#${clip})">${lines.join('')}</g>`
      const drawWall=(s:typeof solids[number])=>prism(wallPolygon(s.start,s.end),s.h,cream,0,'data-model-wall')
      const back=solids.filter(s=>(s.start[1]+s.end[1])/2<r.label[1]),front=solids.filter(s=>!back.includes(s))
      return `<g data-floor-room="${r.id}" class="planning-room">${prism(p,.17,floors,-.17,'data-model-floor')}<polygon points="${pts(p.map(v=>projectPlan(v)))}" fill="transparent" class="planning-tint"/>${seams}${back.map(drawWall).join('')}
      ${openings.filter(o=>o.roomId===r.id&&o.kind==='window').map(o=>prism(wallPolygon(o.start,o.end,.05),.22,['#dfebe4','#b0c5b8','#c4d9cb'],.15,'data-model-wall')).join('')}
      ${furniture.filter(f=>f.roomId===r.id).sort((a,b)=>a.bounds[1]-b.bounds[1]).map(furnishing).join('')}
      ${front.map(s=>drawWall({...s,h:.22})).join('')}
      <polygon points="${pts(p.map(v=>projectPlan(v)))}" fill="transparent" class="planning-outline"/>
      </g>`

    }).join('')}</g>
    <g class="planning-labels">${rooms.map(r=>{const [lx,ly]=projectPlan(r.label),lw=Math.max(50,r.name.length*13+18);return `<g data-floor-label="${r.id}" class="planning-label-lift"><g class="planning-room-label" transform="translate(${lx} ${ly})" aria-hidden="true"><rect x="${-lw/2}" y="-12" width="${lw}" height="24" rx="8"/><text text-anchor="middle" dominant-baseline="central" style="font-size:13px">${escapePlan(r.name)}</text></g></g>`}).join('')}</g></svg>`
}

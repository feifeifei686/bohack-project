import { planningWallSegments, type PlanningModel } from './planning-floorplan'
import { escapePlan as esc, projectPlan } from './planning-recognized'
import { buildWallPieces, expandedWallIds, roomPolygon, wallOffset, wallStructureLabels, annotateWall, toggleWallRemoval, type WallStructure, type WallAnnotation, type WallExpansionMode, type WallPiece } from './wall-demolition-data'
import type { PlanPoint } from './floorplan-contract'
import { decodeWallSnapshot, type WallDemolitionSnapshot } from './planning-snapshot'
import './wall-demolition.css'

const pts=(p:PlanPoint[])=>p.map(v=>v.map(n=>n.toFixed(2)).join(',')).join(' ')
const icon=(kind:'back'|'expand'|'restore')=>`<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">${kind==='back'?'<path d="m10 5-7 7 7 7M3 12h18"/>':kind==='expand'?'<path d="M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5M4 4l6 6m10-6-6 6M4 20l6-6m10 6-6-6"/>':'<path d="M4 10a8 8 0 1 1 1 7M4 4v6h6"/>'}</svg>`
function outline(wall:WallPiece,thickness=.10):PlanPoint[] {
  const {start:a,end:b}=wall, length=Math.hypot(b[0]-a[0],b[1]-a[1])||1
  const dx=(b[1]-a[1])/length*thickness/2,dy=-(b[0]-a[0])/length*thickness/2
  return [[a[0]+dx,a[1]+dy],[b[0]+dx,b[1]+dy],[b[0]-dx,b[1]-dy],[a[0]-dx,a[1]-dy]]
}
function wallMarkup(wall:WallPiece) {
  const p=outline(wall),top=p.map(v=>projectPlan(v,.72)),bottom=p.map(v=>projectPlan(v))
  return `<g class="wall-piece" data-wall-piece="${wall.id}" role="button" tabindex="0" aria-label="选择墙段 ${wall.number}" aria-pressed="false">
    <title>墙段 ${wall.number}</title>
    ${p.map((_,i)=>`<polygon class="wall-face wall-face--${i%2}" points="${pts([top[i],top[(i+1)%4],bottom[(i+1)%4],bottom[i]])}"/>`).join('')}
    <polygon class="wall-face wall-face--top" points="${pts(top)}"/>
    <path class="wall-hit" d="M${pts([projectPlan(wall.start,.36)]).replace(',',' ')} L${pts([projectPlan(wall.end,.36)]).replace(',',' ')}"/>
  </g>`
}

export function createWallDemolition({ onChange, persistent = false }: { onChange?: () => void; persistent?: boolean } = {}) {
  let model:PlanningModel|undefined
  let walls:WallPiece[]=[]
  let mode:WallExpansionMode='all',amount=0,roomId='',wallId='',preview=false
  let marked=new Set<string>()
  let annotations=new Map<string,WallAnnotation>()
  const annotation=(id:string):WallAnnotation=>annotations.get(id)||{type:'unknown',note:''}
  let center:PlanPoint=[5,3.7]
  const roomName=(id:string)=>model?.rooms.find(r=>r.id===id)?.name || (id==='corridor'?'公共走道':'公共区域')
  const selected=()=>walls.find(w=>w.id===wallId)
  function setModel(next:PlanningModel) {
    if(model===next) return
    model=next;walls=buildWallPieces(next,planningWallSegments(next));mode='all';amount=0;preview=false;marked=new Set();annotations=new Map()
    roomId=next.rooms.find(r=>walls.some(w=>w.roomIds.includes(r.id)))?.id || walls[0]?.roomId || ''
    wallId=walls.find(w=>w.roomIds.includes(roomId))?.id || ''
    const points=next.rooms.flatMap(roomPolygon)
    if(points.length) center=[(Math.min(...points.map(p=>p[0]))+Math.max(...points.map(p=>p[0])))/2,(Math.min(...points.map(p=>p[1]))+Math.max(...points.map(p=>p[1])))/2]
  }
  function render(next:PlanningModel,backLabel='返回立体户型') {
    setModel(next)
    const roomIds=[...new Set(walls.flatMap(w=>w.roomIds))]
    return `<section class="wall-explorer" aria-label="墙体拆除视图">
      <header class="wall-header"><button type="button" class="wall-back" data-wall-action="back">${icon('back')}${esc(backLabel)}</button><div><h1 tabindex="-1" data-wall-heading>墙体拆除</h1><p>整体展开，再看清每一段墙。</p></div></header>
      <div class="wall-toolbar"><div class="wall-modes" role="group" aria-label="墙体展开范围">${([['all','整体展开'],['room','按房间展开'],['wall','单段墙展开']] as const).map(([id,label])=>`<button type="button" data-wall-mode="${id}" aria-pressed="${mode===id}">${id==='all'?icon('expand'):''}${label}</button>`).join('')}</div><button type="button" class="wall-restore" data-wall-action="restore">${icon('restore')}合拢复原</button></div>
      <div class="wall-workspace">
        <div class="wall-model-panel"><div class="wall-stage" data-wall-stage>
          <span class="wall-source">${next.recognized?'上传户型 · 识别墙线':next.drawing?'手工标注 · 示意墙线':'演示户型'}</span>
          ${walls.length?`<svg class="wall-scene" viewBox="-80 -65 1000 635" role="group" aria-label="可点选墙段的立体拆除预览">
            <defs><filter id="wall-base-shadow" x="-30%" y="-30%" width="160%" height="180%"><feGaussianBlur stdDeviation="7"/></filter></defs>
            <g class="wall-floors">${next.rooms.map(room=>{
              const p=roomPolygon(room),[x,y]=projectPlan(room.label)
              return `<g><polygon points="${pts(p.map(v=>projectPlan(v,-.13)))}" fill="#b8ad99" filter="url(#wall-base-shadow)" opacity=".28"/><polygon points="${pts(p.map(v=>projectPlan(v)))}" fill="${room.material==='wood'?'#ece1cb':'#e4e7dd'}" stroke="#d2cbbb" stroke-width="1"/><text x="${x}" y="${y+4}">${esc(room.name)}</text></g>`
            }).join('')}</g>
            <g class="wall-footprints" aria-hidden="true">${walls.map(w=>`<path data-wall-footprint="${w.id}" d="M${pts([projectPlan(w.start)])} L${pts([projectPlan(w.end)])}"/>`).join('')}</g>
            <g class="wall-connectors" aria-hidden="true">${walls.map(w=>`<line data-wall-connector="${w.id}"/>`).join('')}</g>
            <g class="wall-solids">${[...walls].sort((a,b)=>(a.start[0]+a.end[0]-b.start[0]-b.end[0])*18+(a.start[1]+a.end[1]-b.start[1]-b.end[1])*24).map(wallMarkup).join('')}</g>
            <g class="wall-labels" aria-hidden="true">${walls.map(w=>{const [x,y]=projectPlan([(w.start[0]+w.end[0])/2,(w.start[1]+w.end[1])/2],.8);return `<g data-wall-label="${w.id}"><g transform="translate(${x} ${y})"><rect x="-15" y="-11" width="30" height="22" rx="7"/><text text-anchor="middle" dominant-baseline="central">${w.number}</text></g></g>`}).join('')}</g>
          </svg>`:'<div class="wall-empty"><h2>还没有可展开的墙线</h2><p>返回原图重新识别，或先标注房间，再查看墙体。</p></div>'}
        </div><div class="wall-spread"><label for="wall-spread">展开程度</label><input id="wall-spread" type="range" min="0" max="100" value="${amount*100}" ${walls.length?'':'disabled'}><output for="wall-spread">${Math.round(amount*100)}%</output></div>
        <div class="wall-legend"><span><i class="is-bearing"></i>承重墙</span><span><i class="is-partition"></i>非承重墙</span><span><i class="is-unknown"></i>待核实</span><span><i class="is-marked"></i>拟拆除</span><span class="wall-structure-count" data-wall-structure-count></span><span class="wall-layout-status" role="status" data-wall-status></span></div></div>
        <aside class="wall-inspector"><label class="wall-room-field">定位房间<select data-wall-room ${walls.length?'':'disabled'}>${roomIds.map(id=>`<option value="${esc(id)}" ${id===roomId?'selected':''}>${esc(roomName(id))}</option>`).join('')}</select></label>
          <div class="wall-selection" data-wall-selection></div>
          <div class="wall-list-heading"><h2>选择墙段</h2><span data-wall-list-count></span></div><div class="wall-list" data-wall-list role="group" aria-label="当前房间墙段"></div>
          <div class="wall-preview-actions"><button type="button" data-wall-action="preview" aria-pressed="false">预览拆后</button><button type="button" data-wall-action="clear">清空拆除标记</button></div>
          <p class="wall-note">墙体性质默认待核实，人工标注不等于专业确认；非承重标注也不代表可以直接拆除。本页不会修改原始户型；${persistent ? '标记随项目草稿保存在此浏览器。' : '标记仅保留在本轮页面。'}</p>
        </aside>
      </div>
    </section>`
  }

  function mount(root:HTMLElement,onBack:()=>void) {
    const events=new AbortController(),motion=matchMedia('(prefers-reduced-motion: reduce)')
    const pieces=[...root.querySelectorAll<SVGGElement>('[data-wall-piece]')]
    const labels=[...root.querySelectorAll<SVGGElement>('[data-wall-label]')]
    const lines=[...root.querySelectorAll<SVGLineElement>('[data-wall-connector]')]
    const slider=root.querySelector<HTMLInputElement>('#wall-spread')!
    let frame=0,disposed=false,last=0
    const positions=new Map(walls.map(w=>[w.id,{x:0,y:0,opacity:1}]))
    function draw(time=0) {
      frame=0;if(disposed)return
      const dt=last?Math.min((time-last)/1000,.05):1/60;last=time
      const blend=motion.matches?1:1-Math.exp(-dt*11)
      const expanded=expandedWallIds(walls,mode,roomId,wallId)
      let moving=false
      for(const piece of pieces) {
        const wall=walls.find(w=>w.id===piece.dataset.wallPiece)!,position=positions.get(wall.id)!,offset=wallOffset(wall,center)
        const spread=expanded.has(wall.id)?amount:0
        const target={x:offset[0]*spread,y:offset[1]*spread,opacity:preview&&marked.has(wall.id)?.055:mode!=='all'&&!expanded.has(wall.id)? (annotation(wall.id).type==='bearing'?.75:.38):1}
        for(const key of ['x','y','opacity'] as const) {position[key]+=(target[key]-position[key])*blend;if(Math.abs(position[key]-target[key])<.001)position[key]=target[key];else moving=true}
        piece.setAttribute('transform',`translate(${position.x.toFixed(3)} ${position.y.toFixed(3)})`)
        piece.style.opacity=String(position.opacity)
        const label=labels.find(l=>l.dataset.wallLabel===wall.id)!
        label.setAttribute('transform',piece.getAttribute('transform')!);label.style.opacity=String(preview&&marked.has(wall.id)?0:(wall.id===wallId?1:mode==='all'?.65:expanded.has(wall.id)?1:annotation(wall.id).type==='bearing'?.85:0))
        const connector=lines.find(l=>l.dataset.wallConnector===wall.id)!,start=projectPlan([(wall.start[0]+wall.end[0])/2,(wall.start[1]+wall.end[1])/2],.72)
        for(const [key,value] of Object.entries({x1:start[0],y1:start[1],x2:start[0]+position.x,y2:start[1]+position.y}))connector.setAttribute(key,String(value))
        connector.style.opacity=String(preview&&marked.has(wall.id)?0:Math.min(1,Math.hypot(position.x,position.y)/50)*.45)
        piece.dataset.expanded=String(spread>0)
      }
      if(moving)frame=requestAnimationFrame(draw);else last=0
    }
    const animate=()=>{if(!frame)frame=requestAnimationFrame(draw)}
    function update(changed = false) {
      const focused=document.activeElement as HTMLElement | null
      const restoreFocus=focused?.dataset.wallSelect ? `[data-wall-select="${focused.dataset.wallSelect}"]` : focused?.dataset.wallAction==='mark' ? '[data-wall-action="mark"]' : focused?.matches('[data-wall-type]') ? '[data-wall-type]' : null
      root.dataset.mode=mode;root.dataset.preview=String(preview)
      root.querySelectorAll<HTMLElement>('[data-wall-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.wallMode===mode)))
      root.querySelector<HTMLSelectElement>('[data-wall-room]')!.value=roomId
      slider.value=String(Math.round(amount*100));slider.setAttribute('aria-valuetext',`${Math.round(amount*100)}% 展开`);root.querySelector('output')!.textContent=slider.value+'%'
      const wall=selected(),list=walls.filter(w=>w.roomIds.includes(roomId))
      root.querySelector('[data-wall-list-count]')!.textContent=`${list.length} 段`
      root.querySelector('[data-wall-list]')!.innerHTML=list.map(w=>`<button type="button" data-wall-select="${w.id}" data-wall-kind="${annotation(w.id).type}" class="${marked.has(w.id)?'is-marked':''}" aria-pressed="${w.id===wallId}"><span>${w.number}</span><small>${wallStructureLabels[annotation(w.id).type]}</small>${marked.has(w.id)?'<small class="wall-removal-tag">拟拆除</small>':''}</button>`).join('')
      const info=wall?annotation(wall.id):undefined
      root.querySelector('[data-wall-selection]')!.innerHTML=wall&&info?`<p>${esc(wall.roomIds.map(roomName).join(' / '))}</p><h2>墙段 ${wall.number}</h2><span class="wall-kind-badge" data-wall-kind="${info.type}">${wallStructureLabels[info.type]}</span>
        <label class="wall-type-field">墙体性质<select data-wall-type>${Object.entries(wallStructureLabels).map(([value,label])=>`<option value="${value}" ${info.type===value?'selected':''}>${label}</option>`).join('')}</select></label>
        <p class="wall-type-origin">${info.type==='unknown'?'暂无承重依据，请依据结构资料或专业核实后标注。':'本轮人工标注 · 尚未专业核实'}</p>
        <details class="wall-evidence" ${info.note?'open':''}><summary>依据备注（选填）</summary><label>资料或说明<textarea data-wall-evidence maxlength="300" rows="2" placeholder="如：结构图编号、核实记录">${esc(info.note)}</textarea></label><small>用户填写的备注，不作为自动核验结果。</small></details>
        <span class="wall-state">${info.type==='bearing'?'已锁定拆除操作':marked.has(wall.id)?'已标记拟拆除 · 待核实':'未标记拆除意向'}</span><button type="button" class="wall-mark" data-wall-action="mark" ${info.type==='bearing'?'disabled':''}>${info.type==='bearing'?'承重墙 · 不可标记拆除':marked.has(wall.id)?'取消这段拆除标记':info.type==='unknown'?'标记拟拆除（待核实）':'标记拟拆除'}</button>`:'<h2>选择一段墙</h2><p>点击模型或下方墙段，查看对应位置。</p>'
      const bearing=walls.filter(w=>annotation(w.id).type==='bearing').length,partition=walls.filter(w=>annotation(w.id).type==='partition').length
      root.querySelector('[data-wall-structure-count]')!.textContent=`承重 ${bearing} · 非承重 ${partition} · 待核实 ${walls.length-bearing-partition}`
      root.querySelector('[data-wall-status]')!.textContent=`${preview?'拆后预览':amount===0?'已合拢':mode==='all'?'整体已展开':mode==='room'?`${roomName(roomId)}已展开`:'选中墙段已展开'} · ${marked.size} 段拟拆除`
      for(const element of pieces) {const id=element.dataset.wallPiece!;element.classList.toggle('is-selected',id===wallId);element.classList.toggle('is-marked',marked.has(id));element.setAttribute('aria-pressed',String(id===wallId));element.dataset.wallKind=annotation(id).type;const text=`墙段 ${walls.find(w=>w.id===id)!.number} · ${wallStructureLabels[annotation(id).type]}${annotation(id).type==='unknown'?'':'（人工标注，待专业核实）'}`;element.setAttribute('aria-label',text);element.querySelector('title')!.textContent=text}
      for(const element of labels) {
        const id=element.dataset.wallLabel!,w=walls.find(w=>w.id===id)!,type=annotation(id).type
        element.classList.toggle('is-selected',id===wallId);element.classList.toggle('is-marked',marked.has(id));element.dataset.wallKind=type
        const text=type==='bearing'?`${w.number} 承重`:type==='partition'?`${w.number} 非承重`:id===wallId?`${w.number} 待核实`:`${w.number} ?`,width=type==='unknown'&&id!==wallId?38:type==='bearing'?68:82
        element.querySelector('text')!.textContent=text;element.querySelector('rect')!.setAttribute('width',String(width));element.querySelector('rect')!.setAttribute('x',String(-width/2))
      }
      root.querySelectorAll<HTMLElement>('[data-wall-footprint]').forEach(p=>p.classList.toggle('is-marked',marked.has(p.dataset.wallFootprint!)))
      const previewButton=root.querySelector<HTMLButtonElement>('[data-wall-action="preview"]')!
      previewButton.disabled=!marked.size;previewButton.textContent=preview?'查看拆前':'预览拆后';previewButton.setAttribute('aria-pressed',String(preview))
      root.querySelector<HTMLButtonElement>('[data-wall-action="clear"]')!.disabled=!marked.size
      root.querySelectorAll<HTMLButtonElement>('[data-wall-mode], [data-wall-action="restore"]').forEach(b=>b.disabled=!walls.length)
      if(restoreFocus)root.querySelector<HTMLElement>(restoreFocus)?.focus({preventScroll:true})
      animate()
      if(changed)onChange?.()
    }
    function select(id:string) {
      const wall=walls.find(w=>w.id===id);if(!wall)return
      wallId=id;if(!wall.roomIds.includes(roomId))roomId=wall.roomIds[0]
      if(mode!=='all')amount=1
      update(true)
    }
    root.addEventListener('click',event=>{
      const target=(event.target as Element).closest<HTMLElement>('[data-wall-action],[data-wall-mode],[data-wall-select],[data-wall-piece]')
      if(!target)return
      if(target.dataset.wallPiece||target.dataset.wallSelect) {select((target.dataset.wallPiece||target.dataset.wallSelect)!);return}
      if(target.dataset.wallMode) {mode=target.dataset.wallMode as WallExpansionMode;amount=1;preview=false;update(true);return}
      switch(target.dataset.wallAction) {
        case 'back':onBack();return
        case 'restore':mode='all';amount=0;preview=false;break
        case 'mark':if(wallId){toggleWallRemoval(annotations,marked,wallId);if(!marked.size)preview=false}break
        case 'preview':if(marked.size){preview=!preview;mode='all';amount=0}break
        case 'clear':marked.clear();preview=false;break
      }
      update(true)
    },{signal:events.signal})
    root.addEventListener('keydown',event=>{const target=(event.target as Element).closest<SVGElement>('[data-wall-piece]');if(target&&['Enter',' '].includes(event.key)){event.preventDefault();select(target.dataset.wallPiece!)}},{signal:events.signal})
    root.querySelector<HTMLSelectElement>('[data-wall-room]')!.addEventListener('change',event=>{roomId=(event.target as HTMLSelectElement).value;wallId=walls.find(w=>w.roomIds.includes(roomId))?.id||'';mode='room';amount=1;preview=false;update(true)},{signal:events.signal})
    root.addEventListener('change',event=>{
      const target=event.target as HTMLSelectElement
      if(!target.matches('[data-wall-type]')||!wallId||!Object.hasOwn(wallStructureLabels,target.value))return
      annotateWall(annotations,marked,wallId,target.value as WallStructure)
      if(!marked.size)preview=false
      update(true)
    },{signal:events.signal})
    root.addEventListener('input',event=>{
      const target=event.target as HTMLTextAreaElement
      if(target.matches('[data-wall-evidence]')&&wallId){annotations.set(wallId,{...annotation(wallId),note:target.value.slice(0,300)});onChange?.()}
    },{signal:events.signal})
    slider.addEventListener('input' ,()=>{amount=Number(slider.value)/100;update(true)},{signal:events.signal})
    motion.addEventListener('change',animate,{signal:events.signal})
    update()
    return ()=>{disposed=true;events.abort();cancelAnimationFrame(frame)}
  }
  function snapshot(next?: PlanningModel): WallDemolitionSnapshot {
    if(next)setModel(next)
    return {schema:1,mode,amount,roomId,wallId,preview,marked:[...marked],annotations:[...annotations].map(([id,value])=>[id,{...value}])}
  }
  function restore(next:PlanningModel,value:unknown) {
    const saved=decodeWallSnapshot(value)
    setModel(next)
    const known=new Set(walls.map(wall=>wall.id))
    mode=saved.mode;amount=saved.amount
    roomId=walls.some(wall=>wall.roomIds.includes(saved.roomId))?saved.roomId:roomId
    wallId=known.has(saved.wallId)?saved.wallId:wallId
    annotations=new Map(saved.annotations.filter(([id])=>known.has(id)))
    marked=new Set(saved.marked.filter(id=>known.has(id)&&annotation(id).type!=='bearing'))
    preview=saved.preview&&marked.size>0
  }
  return {render,mount,snapshot,restore,reset(){model=undefined;marked.clear();annotations.clear()}}
}

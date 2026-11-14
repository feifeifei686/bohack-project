import { renamePlanningRoom } from './planning-room-links'
import type { PlanningModel, Bounds } from './planning-floorplan'
import { drawingBounds } from './planning-floorplan'
import { escapePlan as esc, furnitureNames, recognizedModel } from './planning-recognized'
import type { FloorplanResult } from './floorplan-contract'

export async function prepareDrawing(file:File) {
  const url=URL.createObjectURL(file),image=new Image()
  try {
    image.src=url;await image.decode()
    if(!image.naturalWidth || image.naturalWidth*image.naturalHeight>60_000_000) throw new Error('图片像素过大，请使用清晰的截图。')
    const scale=Math.min(1,2000/Math.max(image.naturalWidth,image.naturalHeight))
    const canvas=document.createElement('canvas');canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale)
    const context=canvas.getContext('2d')!;context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height)
    const drawing=canvas.toDataURL('image/jpeg',.9)
    if(drawing.length>5_500_000) throw new Error('图片内容过大，请裁剪空白或换一张图。')
    return {drawing,drawingAspect:canvas.width/canvas.height,rooms:[],analysisState:'pending'} satisfies PlanningModel
  } finally { URL.revokeObjectURL(url) }
}

export function analysisStatus(model:PlanningModel) {
  if(model.analysisState==='pending') return 'AI 正在读取房间、门窗与家具，通常需要几十秒…'
  if(model.analysisState==='error') return model.analysisError || '识别未完成，请重试。'
  if(model.analysisState==='ready') return `已识别 ${model.rooms.length} 个区域、${model.furniture?.length || 0} 件家具。核对原图后，即可生成立体户型。`
  return model.drawing?'可以重新识别，或在图上手工标注房间。':''
}
const fields=(bounds:Bounds,model:PlanningModel)=>{
  const [x,y,w,h]=drawingBounds(model),values=[(bounds[0]-x)/w*100,(bounds[1]-y)/h*100,bounds[2]/w*100,bounds[3]/h*100]
  return ['左','上','宽','高'].map((label,i)=>`<label>${label} %<input data-edit-coordinate="${i}" type="number" min="0" max="100" step="0.1" value="${values[i].toFixed(1)}"></label>`).join('')
}
export function renderAnalysisTools(model:PlanningModel) {
  if(!model.drawing) return ''
  if(model.analysisState==='pending') return '<div class="plan-analysis" aria-busy="true"><p>正在分析这张图纸，原图会保留在本轮页面中。</p><button type="button" class="planning-text" data-plan-analysis="cancel">取消识别</button></div>'
  return `<div class="plan-analysis">
    <div class="plan-analysis-actions"><button type="button" class="planning-text" data-plan-analysis="retry">${model.analysisState==='error'?'重试识别':'重新识别'}</button><span>重识别会替换当前标注。比例未校准，墙高和家具外观为示意。</span></div>
    ${(model.warnings||[]).length?`<ul class="plan-analysis-notes">${model.warnings!.map(w=>`<li>${esc(w)}</li>`).join('')}</ul>`:''}
    ${model.rooms.length?`<details class="plan-corrections"><summary>核对 / 修改 ${model.rooms.length} 个区域与家具</summary><p>名称、位置和大小都可以修改。百分比以原图为参照。</p>
      ${model.rooms.map(r=>`<details class="plan-room-edit"><summary>${esc(r.name)}${(r.confidence??1)<.75?' · 建议核对':''}</summary><div data-edit-room="${r.id}" class="plan-edit-fields"><label class="plan-edit-name">房间名称<input data-edit-name maxlength="30" value="${esc(r.name)}"></label>${fields(r.bounds,model)}<button type="button" data-plan-analysis="save-room">保存修改</button><button type="button" data-plan-analysis="delete-room">删除区域</button></div></details>`).join('')}
      ${(model.furniture||[]).map(f=>`<details class="plan-room-edit"><summary>${esc(model.rooms.find(r=>r.id===f.roomId)?.name||'')} · ${furnitureNames[f.kind]}</summary><div data-edit-furniture="${f.id}" class="plan-edit-fields">${fields(f.bounds,model)}<label>朝向<select data-edit-rotation>${[0,90,180,270].map(n=>`<option value="${n}" ${Math.round(f.rotation/90)*90%360===n?'selected':''}>${n}°</option>`).join('')}</select></label><button type="button" data-plan-analysis="save-furniture">保存修改</button><button type="button" data-plan-analysis="delete-furniture">删除家具</button></div></details>`).join('')}
    </details>`:''}
  </div>`
}

export function bindAnalysis(root:HTMLElement,model:PlanningModel,change:(model:PlanningModel)=>void) {
  const controller=new AbortController()
  if(model.drawing&&model.analysisState==='pending') {
    const timeout=setTimeout(()=>controller.abort('timeout'),125000)
    void (async()=>{
      try {
        const response=await fetch('/api/ai/floorplan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:model.drawing}),signal:controller.signal})
        const body=await response.json()
        if(!response.ok) throw new Error(body.error?.message||'识别服务暂时不可用，请重试。')
        if(!Array.isArray(body.data?.rooms)||!body.data.rooms.length) throw new Error('未识别到房间，请换一张图或手工标注。')
        if(!controller.signal.aborted && root.isConnected) change(recognizedModel(body.data as FloorplanResult,model.drawing!,model.drawingAspect!))
      } catch(error) {
        if(!root.isConnected || (controller.signal.aborted && controller.signal.reason!=='timeout')) return
        change({...model,analysisState:'error',analysisError:controller.signal.aborted?'识别超时，原图已保留，请重试或手工标注。':error instanceof Error?error.message:'网络连接失败，请重试。'})
      } finally {clearTimeout(timeout)}
    })()
  }
  const status=(text:string)=>{root.querySelector('[data-plan-status]')!.textContent=text}
  root.addEventListener('click',event=>{
    const target=(event.target as Element).closest<HTMLElement>('[data-plan-analysis]')
    if(!target) return
    const action=target.dataset.planAnalysis
    if(action==='cancel') {controller.abort();change({...model,analysisState:'idle'});return}
    if(action==='retry') {change({...model,analysisState:'pending',analysisError:undefined});return}
    const editor=target.closest<HTMLElement>('[data-edit-room],[data-edit-furniture]')
    if(!editor) return
    const room=model.rooms.find(r=>r.id===editor.dataset.editRoom),item=model.furniture?.find(f=>f.id===editor.dataset.editFurniture)
    if(action==='delete-room'&&room) {
      model.rooms=model.rooms.filter(r=>r!==room);model.furniture=model.furniture?.filter(f=>f.roomId!==room.id);model.walls=model.walls?.filter(w=>w.roomId!==room.id);model.openings=model.openings?.filter(w=>w.roomId!==room.id)
    } else if(action==='delete-furniture'&&item) model.furniture=model.furniture?.filter(f=>f!==item)
    else if(room||item) {
      const values=[...editor.querySelectorAll<HTMLInputElement>('[data-edit-coordinate]')].map(e=>e.valueAsNumber/100)
      const [left,top,width,height]=values
      if(!values.every(Number.isFinite)||left<0||top<0||width<=0||height<=0||left+width>1.001||top+height>1.001) {status('位置和范围应在原图内，宽和高需大于 0。');return}
      const [x,y,w,h]=drawingBounds(model),next:Bounds=[x+left*w,y+top*h,width*w,height*h]
      if(room) {
        const name=editor.querySelector<HTMLInputElement>('[data-edit-name]')!.value.trim()
        if(!renamePlanningRoom(model,room,name)) {status('请使用一个未重复的房间名称。');return}
        const old=room.bounds,transform=([a,b]:[number,number]):[number,number]=>[next[0]+(a-old[0])/old[2]*next[2],next[1]+(b-old[1])/old[3]*next[3]]
        room.polygon=room.polygon?.map(transform);room.label=transform(room.label)
        for(const s of [...model.walls||[],...model.openings||[]].filter(s=>s.roomId===room.id)) {s.start=transform(s.start);s.end=transform(s.end)}
        for(const f of (model.furniture||[]).filter(f=>f.roomId===room.id)) {const origin=transform([f.bounds[0],f.bounds[1]]);f.bounds=[...origin,f.bounds[2]/old[2]*next[2],f.bounds[3]/old[3]*next[3]]}
        room.bounds=next
      } else if(item) {item.bounds=next;item.rotation=Number(editor.querySelector<HTMLSelectElement>('[data-edit-rotation]')!.value)}
    }
    change({...model})
  })
  return ()=>controller.abort()
}

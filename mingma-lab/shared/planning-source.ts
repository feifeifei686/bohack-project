import { demoDrawingSvg, drawingBounds, type PlanningModel, type PlanningRoom } from './planning-floorplan'

export function renderPlanningSource(model: PlanningModel, editorial = false, active = true) {
  const sheet = demoDrawingSvg(editorial)
  const [x,z,w,d] = drawingBounds(model)
  const marks = model.rooms.map(({ bounds: [u,v,rw,rd] }) =>
    `<rect x="${(u-x)/w*100}%" y="${(v-z)/d*100}%" width="${rw/w*100}%" height="${rd/d*100}%" fill="#42caca44" stroke="#117078"/>`).join('')
  if (editorial) {
    const arrow = '<svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 19 19 5M7 5h12v12"/></svg>'
    const upload = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 16V3m-6 6 6-6 6 6M3 16v5h18v-5"/></svg>'
    const download = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 3v13m-6-6 6 6 6-6M3 16v5h18v-5"/></svg>'
    return `<div class="plan-entry-layout">
      <div class="plan-entry-copy">
        <h1 ${active ? 'id="planning-title"' : ''}>从图纸，<br><span>到你的空间。</span></h1>
        <p>从平面图生成 3D 户型，再选一个房间开始规划。</p>
        <div class="plan-entry-actions">
          <button type="button" class="planning-primary" data-plan-step="build" ${model.rooms.length ? '' : 'disabled'}>生成立体户型${arrow}</button>
          <div class="planning-drawing-actions">
            <label class="planning-upload">${upload}上传图纸<input type="file" data-plan-upload accept="image/png,image/jpeg,image/webp" aria-label="上传户型图纸"></label>
            ${model.drawing ? '<button type="button" class="planning-text" data-plan-step="demo">切回演示</button>' : `<a class="planning-text" download="安居有数-演示户型平面图.svg" href="data:image/svg+xml,${encodeURIComponent(sheet)}">${download}下载演示图纸</a>`}
          </div>
        </div>
        <p class="plan-source-status" role="status" data-plan-status>${model.drawing ? '先标注房间，再生成概念模型。图纸只保留在本轮，刷新后清空。' : ''}</p>
      </div>
      <div class="planning-drawing-screen">
        <div class="planning-drawing-toolbar"><h2>${model.drawing ? '上传的原始图纸' : '五区演示图纸'}</h2><span>比例未校准</span></div>
        <div class="planning-paper">${model.drawing ? `<div class="planning-upload-paper" style="aspect-ratio:${model.drawingAspect}"><img src="${model.drawing}" alt="上传的户型图"><svg data-plan-mark-layer aria-label="拖动框选房间" role="img">${marks}<rect data-plan-selection fill="#92ad894d" stroke="#35594b"/></svg></div>` : sheet}</div>
        ${model.drawing ? `<div class="planning-mark-tools"><p>在图上框选房间，或填写范围百分比。</p><div><label>房间名称<input data-mark-name maxlength="18" placeholder="例如：客厅"></label>${['左','上','宽','高'].map((label,i) => `<label>${label} %<input type="number" min="0" max="100" data-mark-coord="${i}" value="${i < 2 ? 10 : 35}"></label>`).join('')}<button type="button" class="planning-text" data-plan-step="mark">添加房间</button>${model.rooms.length ? '<button type="button" class="planning-text" data-plan-step="undo">撤销上一个</button>' : ''}</div><p>已标注 ${model.rooms.length} 个房间</p></div>` : ''}
      </div>
    </div>`
  }
  return `<div class="planning-drawing-screen">
    <div class="planning-drawing-toolbar"><div><b>${model.drawing ? '上传的原始图纸' : '五区演示图纸'}</b><small>平面图 · 比例未校准</small></div>
    <div class="planning-drawing-actions"><label class="planning-upload">上传图纸<input type="file" data-plan-upload accept="image/png,image/jpeg,image/webp"></label>
    ${model.drawing ? '<button type="button" class="planning-text" data-plan-step="demo">切回演示</button>' : `<a class="planning-text" download="安居有数-演示户型平面图.svg" href="data:image/svg+xml,${encodeURIComponent(sheet)}">下载演示图纸</a>`}</div></div>
    <div class="planning-paper">${model.drawing ? `<div class="planning-upload-paper" style="aspect-ratio:${model.drawingAspect};width:min(100%,660px,${model.drawingAspect!*490}px)"><img src="${model.drawing}" alt="上传的户型图"><svg data-plan-mark-layer aria-label="拖动框选房间" role="img">${marks}<rect data-plan-selection fill="#36bfc34d" stroke="#117078"/></svg></div>` : sheet}</div>
    ${model.drawing ? `<div class="planning-mark-tools"><p>在图上框选一个房间，或填写范围百分比，再添加房间。</p><div><label>房间名称<input data-mark-name maxlength="18" placeholder="例如：客厅"></label>${['左','上','宽','高'].map((label,i) => `<label>${label} %<input type="number" min="0" max="100" data-mark-coord="${i}" value="${i < 2 ? 10 : 35}"></label>`).join('')}<button type="button" class="planning-text" data-plan-step="mark">添加房间</button>${model.rooms.length ? '<button type="button" class="planning-text" data-plan-step="undo">撤销上一个</button>' : ''}</div><p>已标注 ${model.rooms.length} 个房间</p></div>` : ''}
    <div class="planning-drawing-footer"><p role="status" data-plan-status>${model.drawing ? '依据标注生成概念模型，墙高和开口为示意。图纸保留至本次页面关闭或刷新。' : '预览原图，生成与这张图纸对应的立体户型。'}</p><button type="button" class="planning-primary" data-plan-step="build" ${model.rooms.length ? '' : 'disabled'}>生成立体户型</button></div>
  </div>`
}

export function bindPlanSource(root: HTMLElement, model: PlanningModel, onUpload: (model: PlanningModel) => void) {
  const status = (message: string) => { root.querySelector('[data-plan-status]')!.textContent = message }
  const fields = [...root.querySelectorAll<HTMLInputElement>('[data-mark-coord]')]
  const nameField = root.querySelector<HTMLInputElement>('[data-mark-name]')
  let sequence = 0
  root.querySelector('[data-plan-upload]')?.addEventListener('change', async event => {
    const file = (event.target as HTMLInputElement).files?.[0]
    if (!file) return
    const attempt = ++sequence
    if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 12 * 1024 * 1024) {
      status('请选择 12 MB 以下的 PNG、JPG 或 WebP。')
      return
    }
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.src = url
    try {
      await image.decode()
      if (!root.isConnected || attempt !== sequence) { URL.revokeObjectURL(url); return }
      onUpload({ drawing: url, drawingAspect: image.naturalWidth / image.naturalHeight, rooms: [] })
    } catch {
      URL.revokeObjectURL(url)
      if (root.isConnected && attempt === sequence) status('这张图纸无法打开，请换一份图片。')
    }
  })
  const svg = root.querySelector<SVGSVGElement>('[data-plan-mark-layer]')
  if (svg) {
    let pointer: { id: number; x: number; y: number } | undefined
    function point(event: PointerEvent) {
      const rect = svg!.getBoundingClientRect()
      return { x: Math.max(0, Math.min(100, (event.clientX-rect.left)/rect.width*100)), y: Math.max(0, Math.min(100, (event.clientY-rect.top)/rect.height*100)) }
    }
    svg.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0) return
      svg.setPointerCapture(event.pointerId)
      pointer = { id: event.pointerId, ...point(event) }
    })
    const update = (event: PointerEvent) => {
      if (!pointer || pointer.id !== event.pointerId) return
      const end = point(event)
      const values = [Math.min(pointer.x,end.x), Math.min(pointer.y,end.y), Math.abs(pointer.x-end.x), Math.abs(pointer.y-end.y)]
      const mark = svg.querySelector('[data-plan-selection]')
      for (const [index, attr] of ['x','y','width','height'].entries()) {
        mark?.setAttribute(attr, values[index] + '%')
        fields[index].value = values[index].toFixed(1)
      }
    }
    svg.addEventListener('pointermove', update)
    svg.addEventListener('pointerup', event => { update(event); pointer = undefined })
    svg.addEventListener('pointercancel', () => { pointer = undefined })
  }

  return function addRoom() {
    const name = nameField?.value.trim()
    if (!name || model.rooms.some(room => room.name === name)) { status('请填写一个未使用的房间名称。'); nameField?.focus(); return false }
    if (model.rooms.length >= 12) { status('最多可标注 12 个房间。'); return false }
    const [left, top, width, height] = fields.map(field => field.valueAsNumber / 100)
    if (![left,top,width,height].every(Number.isFinite) || width < .025 || height < .025 || left < 0 || top < 0 || left+width > 1.001 || top+height > 1.001) {
      status('请填写图纸内的矩形范围，宽高至少 2.5%。')
      return false
    }
    const [x,z,w,d] = drawingBounds(model)
    const bounds: PlanningRoom['bounds'] = [x+left*w,z+top*d,Math.min(width,1-left)*w,Math.min(height,1-top)*d]
    if (model.rooms.some(({ bounds: [u,v,rw,rd] }) =>
      Math.min(u+rw,bounds[0]+bounds[2])-Math.max(u,bounds[0]) > .02 &&
      Math.min(v+rd,bounds[1]+bounds[3])-Math.max(v,bounds[1]) > .02)) {
      status('这个范围与已有房间重叠，请调整。')
      return false
    }
    model.rooms.push({ id: `room-${model.rooms.length+1}`, name, bounds, label: [bounds[0]+bounds[2]/2,bounds[1]+bounds[3]/2], material: 'stone' })
    return true
  }
}

import { planningRoomMatches } from './planning-room-links'
import { bindPlanSource, renderPlanningSource } from './planning-source'
import { animatePlanningBuild, capturePlanningDrawing } from './planning-build-animation'
import { demoPlanningModel, renderPlanningFloorplan } from './planning-floorplan'
import './room-planning.css'

type RoomNeed = { id: string; title: string; description: string }
type ProjectNeed = RoomNeed & { room: string; intake?: { areas: string[] } }

const examples: Record<string, RoomNeed[]> = {
  bathroom: [
    { id: 'bath-vanity', title: '保留现有浴室柜', description: '拆除与施工时保护柜体、台面和现有接口。' },
    { id: 'bath-tile', title: '仅拆除旧地砖', description: '地面是本次拆除范围，墙砖与其他构件保留。' },
    { id: 'bath-disposal', title: '拆除垃圾需外运', description: '由商家说明清运与公共区域保护安排。' },
  ],
  living: [
    { id: 'living-floor', title: '确认地板铺装范围', description: '明确客厅与玄关交界处的铺装和收口。' },
    { id: 'living-wall', title: '保留现有墙体', description: '把希望保留的墙体位置写进需求。' },
    { id: 'living-power', title: '确认插座点位调整', description: '结合日常使用，列出需要现场复核的点位。' },
  ],
  bedroom: [
    { id: 'bedroom-floor', title: '确认卧室地面做法', description: '明确地面保留或更换的范围。' },
    { id: 'bedroom-wall', title: '确认墙面翻新范围', description: '标明需要修补的部位与希望保留的表面。' },
  ],
  kitchen: [
    { id: 'kitchen-cabinet', title: '明确橱柜保留范围', description: '区分柜体、台面和五金的改动意向。' },
    { id: 'kitchen-connection', title: '复核设备安装条件', description: '按拟使用的设备核对安装位及接口。' },
  ],
  entry: [
    { id: 'entry-trim', title: '确认入户门洞收口', description: '标注入户门周边与地面衔接的处理范围。' },
    { id: 'entry-storage', title: '确认玄关固定收纳', description: '结合进出动线说明鞋柜位置和使用需求。' },
  ],
}

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
const arrow = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>'

export function createRoomPlanning({ editorial = false } = {}) {
  let selectedRoomId = 'bathroom'
  let activeHotspot: string | null = null
  let seen = false
  let model = demoPlanningModel
  let stage: 'drawing' | 'building' | 'model' = 'drawing'
  let cancelAnalysis: (() => void) | undefined
  let cancelBuild: (() => void) | undefined
  const selectedRoom = () => model.rooms.find(room => room.id === selectedRoomId) || model.rooms[0]


  function render() {
    return `<section class="room-planning" id="room-planning" data-stage="${stage}" aria-labelledby="planning-title">
      <header class="planning-header">
        <a class="planning-back" href="#overview">${arrow} 返回项目概览</a>
        ${editorial && stage === 'drawing' ? '' : '<h1 id="planning-title">从图纸，到你的空间。</h1><p>从平面图生成户型，选择房间开始规划。</p>'}
      </header>
      <div data-drawing-slot ${stage !== 'drawing' ? 'hidden' : ''}>${renderPlanningSource(model, editorial, stage === 'drawing')}</div>
      <div class="planning-layout" ${stage === 'drawing' ? 'hidden' : ''}>
        <div class="planning-model">
          <div class="planning-stage${seen ? '' : ' planning-stage--enter'}">
            <span class="planning-source">${model.recognized ? 'AI 识别 · 待核对' : model.drawing ? '标注户型' : '演示户型'}</span>
            ${renderPlanningFloorplan(false, model)}
          </div>
          <div class="planning-model-footer">
            <div class="planning-room-picker" aria-label="选择房间">
              ${model.rooms.map(room => `<button type="button" data-planning-room="${room.id}" aria-pressed="${room.id === selectedRoomId}">${escape(room.name)}</button>`).join('')}
            </div>
            <p>布局与比例仅供定位。 <button type="button" class="planning-text" data-plan-step="drawing">查看原图 / 重播</button></p>
          </div>
        </div>
        <aside class="planning-sidebar" aria-labelledby="planning-room-title">
          <div id="planning-room-details" aria-live="polite"></div>
          <div class="planning-actions">
            <button type="button" class="planning-primary" data-action="plan-current-room">下一步 · 进入区域规划 ${arrow}</button>
            <button type="button" class="planning-text" data-action="plan-whole-home">先说全屋需求</button>
          </div>
        </aside>
      </div>
    </section>`
  }

  function mount(root: HTMLElement, requirements: ProjectNeed[]) {
    const slot = root.querySelector<HTMLElement>('[data-drawing-slot]')!
    const layout = root.querySelector<HTMLElement>('.planning-layout')!
    const canvas = root.querySelector<HTMLElement>('.planning-stage')!
    function refresh(focus?: string) {
      cancelAnalysis?.()
      const template = document.createElement('template')
      template.innerHTML = render()
      const next = template.content.firstElementChild as HTMLElement
      root.replaceWith(next)
      mount(next, requirements)
      if (focus) next.querySelector<HTMLElement>(focus)?.focus({ preventScroll: true })
    }
    const addRoom = bindPlanSource(slot, model, next => {
      if (model.drawing && model.drawing !== next.drawing) URL.revokeObjectURL(model.drawing)
      model = next
      activeHotspot = null
      refresh('[data-mark-name]')
    })
    cancelAnalysis = addRoom.cancel
    const details = root.querySelector('#planning-room-details')!
    const groups = [...root.querySelectorAll<SVGGElement>('[data-floor-room]')]
    const layer = root.querySelector('.planning-room-layer')!
    let orderFrame = 0
    let orderedRoom = layer.lastElementChild
    function synchronizeOrder(current: SVGGElement) {
      cancelAnimationFrame(orderFrame)
      if (orderedRoom === current) return
      const initialRoom = orderedRoom
      function tick() {
        if (!root.isConnected) return
        const height = (group: Element | null) => {
          const transform = group ? getComputedStyle(group).transform : 'none'
          return transform === 'none' ? 0 : -new DOMMatrixReadOnly(transform).m42
        }
        if (height(current) >= height(initialRoom)) {
          layer.append(current)
          orderedRoom = current
        } else orderFrame = requestAnimationFrame(tick)
      }
      orderFrame = requestAnimationFrame(tick)
    }
    const shadows = [...root.querySelectorAll<SVGPolygonElement>('[data-floor-shadow]')]
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-planning-room]')]
    const hotspots = [...root.querySelectorAll<SVGGElement>('[data-floor-hotspot]')]

    function update() {
      const room = selectedRoom()
      if (!room || stage === 'drawing') return
      selectedRoomId = room.id
      const actual = requirements.filter(req => planningRoomMatches(room, req.intake ? req.intake.areas : [req.room]))
      const sample = model.drawing ? [] : examples[room.id]
      const entries = actual.length ? actual : sample
      details.innerHTML = `<div class="planning-room-heading">
          <h2 id="planning-room-title">${escape(room.name)}</h2>
          ${!model.drawing && !actual.length ? '<span>演示清单</span>' : ''}
        </div>
        <p class="planning-list-label">硬装需求</p>
        <ul class="planning-needs">${!entries.length ? '<li>还没有记录这个区域的硬装需求。</li>' : ''}${entries.map(entry => `<li data-planning-need="${escape(entry.id)}"><b>${escape(entry.title)}</b><p>${escape(entry.description)}</p></li>`).join('')}</ul>
        ${actual.length && activeHotspot ? `<div class="planning-example-focus" data-planning-need="${activeHotspot}"><small>构件示例</small><b>${sample.find(entry => entry.id === activeHotspot)?.title || ''}</b></div>` : ''}`
      for (const group of groups) group.classList.toggle('is-selected', group.dataset.floorRoom === room.id)
      for (const label of root.querySelectorAll<SVGGElement>('[data-floor-label]')) label.classList.toggle('is-selected', label.dataset.floorLabel === room.id)
      const currentGroup = groups.find(group => group.dataset.floorRoom === room.id)!
      if (stage === 'building') {
        layer.append(currentGroup)
        orderedRoom = currentGroup
      } else synchronizeOrder(currentGroup)
      for (const shadow of shadows) shadow.classList.toggle('is-selected', shadow.dataset.floorShadow === room.id)
      for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.planningRoom === room.id))
      for (const hotspot of hotspots) {
        hotspot.setAttribute('tabindex', room.id === 'bathroom' ? '0' : '-1')
        hotspot.setAttribute('aria-pressed', String(hotspot.dataset.floorHotspot === activeHotspot))
      }
      for (const item of details.querySelectorAll<HTMLElement>('[data-planning-need]')) {
        item.classList.toggle('is-highlighted', item.dataset.planningNeed === activeHotspot)
      }
    }

    root.addEventListener('click', event => {
      const target = event.target as Element
      const step = target.closest<HTMLElement>('[data-plan-step]')?.dataset.planStep
      if (step === 'drawing') { stage = 'drawing'; refresh('[data-plan-step="build"]'); return }
      if (step === 'demo') { reset(); refresh('[data-plan-step="build"]'); return }
      if (step === 'undo') { model.rooms.pop(); refresh('[data-mark-name]'); return }
      if (step === 'mark') { if (addRoom()) refresh('[data-mark-name]'); return }
      if (step === 'build' && stage === 'drawing' && model.rooms.length && model.analysisState !== 'pending') {
        const drawing = capturePlanningDrawing(slot.querySelector<HTMLElement>('.planning-paper')!, model)
        stage = 'building'
        root.dataset.stage = stage
        if (editorial) {
          const title = root.querySelector('#planning-title')
          if (title) {
            title.removeAttribute('id')
            const heading = document.createElement('h1')
            heading.id = 'planning-title'
            heading.textContent = '从图纸，到你的空间。'
            root.querySelector('.planning-header')!.append(heading)
          }
        }
        slot.hidden = true
        layout.hidden = false
        layout.inert = true
        root.classList.add('is-building')
        update()
        cancelBuild = animatePlanningBuild(
          canvas.querySelector('svg')!,
          drawing,
          (backdrop, lift, controls) => {
            root.style.setProperty('--build-backdrop', String(backdrop))
            root.style.setProperty('--build-lift', `${-25 * lift}px`)
            root.style.setProperty('--build-controls', String(controls))
          },
          () => {
            stage = 'model'
            root.dataset.stage = stage
            layout.inert = false
            root.classList.remove('is-building')
            for (const property of ['--build-backdrop', '--build-lift', '--build-controls']) root.style.removeProperty(property)
            if ((event as MouseEvent).detail === 0) {
              buttons.find(button => button.dataset.planningRoom === selectedRoom()?.id)?.focus({ preventScroll: true })
            }
          },
        )
        return
      }
      const hotspot = target.closest<SVGGElement>('[data-floor-hotspot]')
      const feature = target.closest<SVGGElement>('[data-floor-feature]')
      const room = target.closest<SVGGElement>('[data-floor-room]')?.dataset.floorRoom
        || target.closest<HTMLButtonElement>('[data-planning-room]')?.dataset.planningRoom
      if (!room || stage !== 'model') return
      if (room !== selectedRoomId) activeHotspot = null
      selectedRoomId = room
      if (hotspot) activeHotspot = hotspot.dataset.floorHotspot || null
      if (feature) activeHotspot = feature.dataset.floorFeature || null
      update()
    })
    root.addEventListener('keydown', event => {
      const target = event.target as Element
      if (!target.matches('[data-floor-hotspot]') || !['Enter', ' '].includes(event.key)) return
      event.preventDefault()
      target.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    update()
    seen = true
  }

  function reset() {
    cancelBuild?.()
    cancelAnalysis?.()
    if (model.analysisState === 'pending') model.analysisState = 'idle'
    if (model.drawing) URL.revokeObjectURL(model.drawing)
    model = demoPlanningModel
    stage = 'drawing'
    selectedRoomId = 'bathroom'
    activeHotspot = null
    seen = false
  }
  return { render, mount, selectedRoom, reset, model: () => model, leave() {
    cancelBuild?.()
    cancelAnalysis?.()
    if (model.analysisState === 'pending') model.analysisState = 'idle'
    if (stage === 'building') stage = 'model'
  } }
}

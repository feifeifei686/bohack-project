import { renderPlanningFloorplan, type PlanningModel } from '../../../shared/planning-floorplan'
import { planningRoomMatches } from '../../../shared/planning-room-links'
import type { Requirement } from './domain'

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)

export function modelSource(model: PlanningModel): string {
  return model.recognized ? '你的上传户型 · AI 识别后待核对' : model.drawing ? '你的上传户型 · 手工标注' : '五区演示户型'
}

export function renderProjectSpace(model: PlanningModel, requirements: Requirement[], selected: string, version?: number, dirty = false) {
  const room = model.rooms.find(item => item.id === selected)
  const needs = requirements.filter(req => !room || planningRoomMatches(room, req.intake?.areas ?? [req.room]) || (req.intake?.areas ?? [req.room]).some(area => ['全屋', '全局', '公共项'].includes(area)))
  return `<section class="project-space" aria-label="当前项目户型与需求">
    <div class="project-space-source"><div><strong>${esc(modelSource(model))}</strong><p>沿用空间选择中的同一份户型。${dirty || !version ? '下方展示当前需求草稿。' : `下方关联已发布需求 R${version}。`}</p></div><a href="#planning">查看原图与房间标注</a></div>
    <div class="project-space-layout">
      <div class="project-model-preview"><div class="project-model-canvas">${renderPlanningFloorplan(true, model)}</div>
        <div class="project-room-tabs" role="group" aria-label="查看房间关联需求"><button data-project-room="all" aria-pressed="${!room}">全屋</button>${model.rooms.map(item => `<button data-project-room="${esc(item.id)}" aria-pressed="${item.id === selected}">${esc(item.name)}</button>`).join('')}</div>
        <p class="project-model-note">${model.drawing ? '按上传图纸生成的概念模型' : '演示布局'} · 比例未校准，具体尺寸与墙体性质需现场核实。</p>
      </div>
      <aside class="project-space-needs" aria-live="polite"><h2>${room ? esc(room.name) : '全屋'}的需求 <small>${needs.length} 条</small></h2>
        ${needs.length ? `<ul>${needs.map(req => `<li><span>${esc(req.id)} · ${req.priority === 'must' ? '必须满足' : '优先偏好'}</span><h3>${esc(req.title)}</h3><p>${esc(req.description)}</p>${req.pending.length ? `<small>待确认：${esc(req.pending.join('；'))}</small>` : ''}<button class="text-button" data-action="project-space-need" data-id="${esc(req.id)}">查看这条需求</button></li>`).join('')}</ul>` : '<p class="muted">还没有记录这个区域的需求。可以回到空间选择，选中房间后继续共创。</p><a href="#planning">为这个空间补充需求</a>'}
      </aside>
    </div>
  </section>`
}

export function highlightProjectRoom(root: HTMLElement, selected: string) {
  const model = root.querySelector('.project-model-canvas')
  if (!model) return
  if (![...model.querySelectorAll<SVGElement>('[data-floor-room]')].some(element => element.dataset.floorRoom === selected)) selected = 'all'
  for (const element of model.querySelectorAll<SVGElement>('[data-floor-room], [data-floor-label], [data-floor-shadow]')) {
    const id = element.dataset.floorRoom || element.dataset.floorLabel || element.dataset.floorShadow
    element.classList.toggle('is-selected', id === selected)
    element.classList.toggle('project-room-muted', selected !== 'all' && id !== selected)
  }
}

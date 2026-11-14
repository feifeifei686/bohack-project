import { renderPlanningFloorplan, type PlanningModel } from './planning-floorplan'
import type { SpatialFocus } from './intake-spatial-focus'
import './intake-space-preview.css'

export function intakeWithSpaceMarkup(model: PlanningModel) {
  return `<div class="intake-spatial-layout">
    <div id="intake-root"></div>
    <aside class="intake-space" aria-label="共创户型预览">
      <div class="intake-space-header">
        <small>${model.drawing ? '标注户型' : '演示户型'}</small>
        <a href="#planning">查看完整户型 <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M4 12l8-8M5 4h7v7"/></svg></a>
      </div>
      <div class="intake-space-motion">
        <div class="intake-space-orbit">${renderPlanningFloorplan(true, model)}</div>
      </div>
      <p class="intake-space-caption" aria-live="polite"></p>
    </aside>
  </div>`
}

export type FloorplanHandoff = { bounds: DOMRect; image: SVGSVGElement }

export function captureFloorplanHandoff(): FloorplanHandoff | undefined {
  const svg = document.querySelector<SVGSVGElement>('.planning-stage .planning-floorplan')
  if (!svg || !svg.getBoundingClientRect().width) return
  const view = svg.viewBox.baseVal
  const screen = svg.getScreenCTM()
  if (!screen) return
  const topLeft = new DOMPoint(view.x, view.y).matrixTransform(screen)
  const bottomRight = new DOMPoint(view.x + view.width, view.y + view.height).matrixTransform(screen)
  const bounds = new DOMRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y)
  for (const room of svg.querySelectorAll<SVGGElement>('[data-floor-room]')) {
    room.style.transform = getComputedStyle(room).transform
    room.style.transition = 'none'
  }
  return { bounds, image: svg }
}

export function mountIntakeSpacePreview(panel: HTMLElement, handoff?: FloorplanHandoff) {
  const motion = panel.querySelector<HTMLElement>('.intake-space-motion')!
  const caption = panel.querySelector<HTMLElement>('.intake-space-caption')!
  const orbit = panel.querySelector<HTMLElement>('.intake-space-orbit')!
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')
  const fly = handoff && !reduced.matches
  const fallback = orbit.querySelector('svg')!
  const floorplan = fly ? handoff.image : fallback
  const flightRooms = [...floorplan.querySelectorAll<SVGGElement>('[data-floor-room]')]
  if (fly) {
    // Carry the actual sand table into the next page, including its surface details.
    for (const marker of floorplan.querySelectorAll('[data-floor-hotspot]')) {
      marker.removeAttribute('role')
      marker.removeAttribute('tabindex')
      marker.removeAttribute('aria-pressed')
    }
    floorplan.removeAttribute('role')
    floorplan.removeAttribute('aria-label')
    floorplan.setAttribute('aria-hidden', 'true')
    fallback.replaceWith(floorplan)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  let intersecting = false
  const syncVisibility = () => panel.classList.toggle('is-visible', intersecting && !document.hidden)
  const observer = new IntersectionObserver(([entry]) => {
    intersecting = entry.isIntersecting
    syncVisibility()
  })
  observer.observe(panel)
  document.addEventListener('visibilitychange', syncVisibility)

  function settle() {
    panel.classList.add('is-glass')
    for (const room of flightRooms) {
      room.style.removeProperty('transition')
      room.style.removeProperty('transform')
      room.classList.remove('is-selected')
    }
    for (const shadow of floorplan.querySelectorAll('[data-floor-shadow].is-selected')) shadow.classList.remove('is-selected')
  }

  let arrival: Animation | undefined
  let settleTimer: ReturnType<typeof setTimeout> | undefined
  const next = orbit.getBoundingClientRect()
  if (fly && next.width && next.height) {
    const { bounds } = handoff
    // The orbit and the SVG viewBox have the same aspect ratio.
    const scale = bounds.width / next.width
    panel.classList.add('is-arriving')
    arrival = orbit.animate([
      { transform: `translate(${bounds.left - next.left}px, ${bounds.top - next.top}px) scale(${scale})` },
      { transform: 'none' },
    ], { duration: 1320, easing: 'cubic-bezier(.24,.7,.27,1)', fill: 'backwards' })
    // Material and room height begin to settle as the flight eases into place.
    settleTimer = setTimeout(settle, 970)
    arrival.onfinish = () => panel.classList.remove('is-arriving')
  } else settle()

  let lastPresentation = ''
  function update(focus: SpatialFocus, phase: 'express' | 'refine' | 'draft' | 'analyzing') {
    const key = JSON.stringify([focus, phase])
    if (key === lastPresentation) return
    lastPresentation = key
    panel.dataset.spatialPhase = phase
    const roomIds = new Set(focus.roomIds)
    for (const room of flightRooms) {
      const active = roomIds.has(room.dataset.floorRoom || '')
      room.classList.toggle('is-focused', active)
      for (const part of room.querySelectorAll('[data-floor-feature], [data-model-floor], [data-model-wall]')) {
        const kind = part.getAttribute('data-floor-feature') || (part.hasAttribute('data-model-wall') ? 'wall' : 'floor')
        part.classList.toggle('is-feature-focus', active && focus.feature === kind)
      }
    }
    caption.textContent = phase === 'analyzing' ? `AI 正在整理 · ${focus.label}` : phase === 'refine' ? `当前问题 · ${focus.label}` : `当前范围 · ${focus.label}`
  }

  let cue: Animation | undefined
  function acknowledgeBrief() {
    if (reduced.matches || cue?.playState === 'running') return
    cue = motion.animate([
      { filter: 'brightness(1)' },
      { filter: 'brightness(1.12)', offset: .34 },
      { filter: 'brightness(1)' },
    ], { duration: 680, easing: 'ease-out' })
  }

  return { update, acknowledgeBrief, dispose() {
    observer.disconnect()
    document.removeEventListener('visibilitychange', syncVisibility)
    arrival?.cancel()
    clearTimeout(settleTimer)
    cue?.cancel()
  } }
}

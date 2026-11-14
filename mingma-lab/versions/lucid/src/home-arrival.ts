import type { HomePlanningFrame } from './home-builder'

/** Retain the rendered house while its footprint becomes the destination drawing. */
export function createHomeArrival(frame: HomePlanningFrame) {
  const overlay = document.createElement('div')
  overlay.className = 'home-route-bridge'
  overlay.setAttribute('aria-hidden', 'true')
  const backdrop = document.createElement('div')
  backdrop.className = 'home-route-backdrop'
  const { canvas, bounds } = frame
  Object.assign(canvas.style, {
    position: 'absolute', left: `${bounds.left}px`, top: `${bounds.top}px`,
    width: `${bounds.width}px`, height: `${bounds.height}px`, transformOrigin: '0 0',
  })
  overlay.append(backdrop, canvas)
  document.body.append(overlay)
  const animations: Animation[] = []
  let page: HTMLElement | undefined
  let paper: SVGSVGElement | null = null
  let timer = 0
  let disposed = false
  let restoreFocus = false
  const motion = matchMedia('(prefers-reduced-motion: reduce)')
  const onMotion = () => { if (motion.matches) dispose() }
  const onResize = () => dispose()
  function dispose() {
    if (disposed) return
    disposed = true
    clearTimeout(timer)
    animations.forEach(animation => animation.cancel())
    paper?.style.removeProperty('opacity')
    if (page) page.inert = false
    overlay.remove()
    window.removeEventListener('resize', onResize)
    motion.removeEventListener('change', onMotion)
    if (restoreFocus && location.hash === '#planning' && page?.isConnected) {
      const heading = page.querySelector<HTMLElement>('#planning-title')
      heading?.setAttribute('tabindex', '-1')
      heading?.focus({ preventScroll: true })
    }
  }
  return {
    dispose,
    mount(next: HTMLElement, keyboard: boolean) {
      if (disposed) return
      if (page) { dispose(); return }
      page = next
      restoreFocus = keyboard
      paper = next.querySelector<SVGSVGElement>('.planning-paper > svg')
      // Returning to an already-generated model must preserve that visible stage.
      if (!paper || !paper.getClientRects().length || motion.matches) { dispose(); return }
      const rect = paper.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) { dispose(); return }
      page.inert = true
      paper.style.opacity = '0'
      if (rect.bottom > innerHeight - 24 || rect.top < 24) paper.scrollIntoView({ block: 'center', behavior: 'instant' })
      const matrix = paper.getScreenCTM()
      if (!matrix) { dispose(); return }
      const first = new DOMPoint(-0.12, -0.12).matrixTransform(matrix)
      const last = new DOMPoint(10.12, 7.52).matrixTransform(matrix)
      const transform = `translate(${first.x - bounds.left}px, ${first.y - bounds.top}px) scale(${(last.x - first.x) / bounds.width}, ${(last.y - first.y) / bounds.height})`
      overlay.dataset.phase = 'landing'
      animations.push(canvas.animate([
        { transform: 'translate(0, 0) scale(1)', opacity: 1, offset: 0, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
        { transform, opacity: 1, offset: 0.65 },
        { transform, opacity: 0, offset: 1 },
      ], { duration: 1300, easing: 'linear', fill: 'forwards' }))
      animations.push(backdrop.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 850, easing: 'ease-out', fill: 'forwards' }))
      animations.push(paper.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 455, delay: 845, fill: 'forwards' }))
      window.addEventListener('resize', onResize)
      motion.addEventListener('change', onMotion)
      timer = window.setTimeout(() => {
        dispose()
      }, 1320)
    },
  }
}

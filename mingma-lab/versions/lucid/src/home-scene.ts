import type { HomeBuilder, HomeBuildStatus, HomePlanningFrame } from './home-builder'

export function mountHomeScene(root: HTMLElement, onPlanning: (keyboard: boolean, frame?: HomePlanningFrame) => void): () => void {
  const scene = root.querySelector<HTMLElement>('[data-home-scene]')!
  const host = root.querySelector<HTMLElement>('[data-home-canvas]')!
  const choices = [...root.querySelectorAll<HTMLButtonElement>('[data-home-view]')]
  const caption = root.querySelector<HTMLElement>('[data-home-caption]')!
  const menu = root.querySelector<HTMLDetailsElement>('.home-menu')!
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
  const events = new AbortController()
  const { signal } = events
  let builder: HomeBuilder | undefined
  let visible = true
  let disposed = false
  let loading = false
  let entering = false
  let previousOverflow: string | undefined

  async function enterPlanning(keyboard: boolean) {
    if (entering || disposed) return
    entering = true
    previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    menu.open = false
    root.inert = true
    // Zoom the surrounding type away from the viewport center, so it travels
    // beyond the screen edges instead of merely blurring in its original place.
    for (const element of root.querySelectorAll<HTMLElement>('.home-header, .home-scene-toolbar, .home-hero-copy, .home-entry, .home-hero-foot')) {
      const rect = element.getBoundingClientRect()
      element.style.setProperty('--home-exit-x', `${innerWidth / 2 - rect.left}px`)
      element.style.setProperty('--home-exit-y', `${innerHeight / 2 - rect.top}px`)
    }
    root.classList.add('is-entering-planning')
    const backdrop = document.createElement('div')
    backdrop.className = 'home-flight-backdrop'
    backdrop.style.height = `${innerHeight}px`
    backdrop.setAttribute('aria-hidden', 'true')
    scene.append(backdrop)
    const complete = builder && visible ? await builder.enterPlanning(progress => {
      backdrop.style.opacity = String(Math.min(1, progress / 0.35))
    }) : true
    if (!disposed && complete) onPlanning(keyboard, typeof complete === 'object' ? complete : undefined)
  }

  function update(status: HomeBuildStatus) {
    if (disposed) return
    choices.forEach((button) => {
      button.disabled = !status.available
    })
    const message = status.available
      ? status.complete
        ? '空间走线示意'
        : '一座家，逐渐成形'
      : '画面恢复中…'
    if (caption.textContent !== message) caption.textContent = message
  }

  async function loadBuilder() {
    if (loading || disposed) return
    loading = true
    try {
      const { createHomeBuilder } = await import('./home-builder')
      if (disposed) return
      host.replaceChildren()
      builder = createHomeBuilder(host, update, reducedMotion.matches)
      builder.setVisible(visible)
      builder.setStructure(scene.dataset.scene === 'structure')
    } catch {
      if (disposed) return
      host.dataset.renderer = 'fallback'
      host.innerHTML =
        '<img class="home-build-fallback" src="/assets/home/residence.webp" alt="住宅空间参考图" />'
      caption.textContent = '3D 暂时无法显示，可刷新重试或开始规划'
    } finally {
      loading = false
    }
  }

  root.addEventListener(
    'click',
    (event) => {
      const target = (event.target as Element).closest<HTMLElement>('button, a')
      if (!target) return
      if (target.dataset.action === 'go-planning' || target.getAttribute('href') === '#planning') {
        event.preventDefault()
        event.stopPropagation()
        void enterPlanning((event as MouseEvent).detail === 0)
        return
      }
      if (target.dataset.homeView) {
        scene.dataset.scene = target.dataset.homeView
        choices.forEach((button) => button.setAttribute('aria-pressed', String(button === target)))
        builder?.setStructure(target.dataset.homeView === 'structure')
      }
      if (target.hasAttribute('data-home-scroll')) {
        const process = root.querySelector<HTMLElement>('#home-process')!
        process.focus({ preventScroll: true })
        process.scrollIntoView({
          behavior: reducedMotion.matches ? 'instant' : 'smooth',
          block: 'start',
        })
      }
      if (target.classList.contains('home-skip')) {
        event.preventDefault()
        scene.focus({ preventScroll: true })
        scene.scrollIntoView({ behavior: 'instant' })
      }
      if (target.closest('.home-menu-panel')) menu.open = false
    },
    { signal },
  )
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!menu.contains(event.target as Node)) menu.open = false
    },
    { signal },
  )
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape' && menu.open) {
        menu.open = false
        menu.querySelector('summary')?.focus()
      }
    },
    { signal },
  )
  reducedMotion.addEventListener('change', () => builder?.setReducedMotion(reducedMotion.matches), {
    signal,
  })

  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting
    scene.dataset.visible = String(visible)
    builder?.setVisible(visible)
  })
  observer.observe(scene)
  void loadBuilder()
  return () => {
    disposed = true
    if (previousOverflow !== undefined) document.body.style.overflow = previousOverflow
    events.abort()
    observer.disconnect()
    builder?.dispose()
  }
}

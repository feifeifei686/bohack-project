import { engineeringLayers, type EngineeringLayerId } from './engineering-data'
import type { EngineeringView } from './engineering-view'
import './engineering.css'

const arrow = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m8 4 8 8-8 8"/></svg>'
const rotate = (right = false) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><g ${right ? 'transform="translate(24 0) scale(-1 1)"' : ''}><path d="M4 9a8 8 0 1 1 1 8M4 3v6h6"/></g></svg>`
const zoom = (plus = false) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 12h14${plus ? 'M12 5v14' : ''}"/></svg>`

export function renderEngineeringSpace() {
  return `<section class="engineering" aria-label="家装工程分层预览">
    <div class="engineering-toolbar">
      <p>同一套房子，六个工程视角。</p>
      <div><button type="button" class="secondary-button small" data-engineering-action="reset">重置视角</button><button type="button" class="primary small" data-engineering-action="expand" aria-pressed="true">合拢模型</button></div>
    </div>
    <div class="engineering-layout">
      <nav class="engineering-steps" aria-label="选择工程层">
        ${[...engineeringLayers].reverse().map(layer => `<button type="button" data-engineering-layer="${layer.id}" aria-pressed="false" style="--layer-color:${layer.color}"><span>${layer.number}</span><div><b>${layer.name}</b><small>${layer.parts[0]}</small></div>${arrow}</button>`).join('')}
      </nav>
      <div class="engineering-stage">
        <div class="engineering-canvas" data-engineering-canvas tabindex="0" role="group" aria-label="可旋转的六层家装工程模型；方向键旋转，加减键缩放"><p class="engineering-loading">正在展开工程模型…</p></div>
        <div class="engineering-tags" hidden aria-label="模型中的工程层">${engineeringLayers.map(layer => `<button type="button" data-engineering-tag="${layer.id}" data-engineering-layer="${layer.id}" aria-pressed="false"><span>${layer.number}</span>${layer.short}</button>`).join('')}</div>
        <div class="engineering-camera" aria-label="模型视角控制"><button type="button" data-engineering-action="left" aria-label="向左旋转">${rotate()}</button><button type="button" data-engineering-action="right" aria-label="向右旋转">${rotate(true)}</button><span></span><button type="button" data-engineering-action="out" aria-label="缩小模型">${zoom()}</button><button type="button" data-engineering-action="in" aria-label="放大模型">${zoom(true)}</button></div>
        <div class="engineering-spread"><label for="engineering-spacing">展开程度</label><input id="engineering-spacing" type="range" min="0" max="100" value="100" aria-valuetext="全部展开"><output for="engineering-spacing">100%</output></div>
      </div>
      <aside class="engineering-detail" aria-live="polite" aria-atomic="false">
        <div data-engineering-detail></div>
        <div class="engineering-detail-actions"><button type="button" class="primary" data-engineering-action="isolate" disabled>先选择一个工程层</button><button type="button" class="text-button" data-engineering-action="all">查看全部工程层</button></div>
      </aside>
    </div>
    <div class="engineering-foot"><div class="engineering-legend"><span><i style="--legend:#ca6659"></i>强电</span><span><i style="--legend:#d2ac55"></i>弱电</span><span><i style="--legend:#529bc0"></i>冷水</span><span><i style="--legend:#d68d66"></i>热水</span><span><i style="--legend:#b0b6ba"></i>排水</span><span><i style="--legend:#91bdc8"></i>防水</span></div><p>工程构成示意 · 非施工图，未关联商家方案</p></div>
  </section>`
}

export function mountEngineeringSpace(root: HTMLElement): () => void {
  let view: EngineeringView | undefined
  let disposed = false
  let available = true
  let selected: EngineeringLayerId | null = null
  let isolated = false
  let expansion = 1
  const events = new AbortController()
  const host = root.querySelector<HTMLElement>('[data-engineering-canvas]')!
  const detail = root.querySelector<HTMLElement>('[data-engineering-detail]')!
  const isolateButton = root.querySelector<HTMLButtonElement>('[data-engineering-action="isolate"]')!
  const expandButton = root.querySelector<HTMLButtonElement>('[data-engineering-action="expand"]')!
  const slider = root.querySelector<HTMLInputElement>('#engineering-spacing')!
  const tags = new Map(engineeringLayers.map(layer => [layer.id, root.querySelector<HTMLElement>(`[data-engineering-tag="${layer.id}"]`)!]))

  function renderDetail() {
    const layer = engineeringLayers.find(layer => layer.id === selected)
    detail.innerHTML = layer
      ? `<span class="engineering-number" style="--layer-color:${layer.color}">${layer.number}</span><h2>${layer.name}</h2><p class="engineering-lead">${layer.intro}</p><p>${layer.description}</p><h3>这一层有什么</h3><ul>${layer.parts.map(text => `<li>${text}</li>`).join('')}</ul><h3>规划时要确认</h3><ul>${layer.checks.map(text => `<li>${text}</li>`).join('')}</ul>`
      : '<h2>从结构，到生活。</h2><p class="engineering-lead">把藏在房子里的工程，一层层打开。</p><p>左侧按工程层级排列，画面中的编号与之对应。点选任意一层，查看它的构件和需要确认的事项。</p><div class="engineering-how"><p>拖动模型旋转观察</p><p>拖动滑杆调整层间距离</p><p>选择一层，再单独放大查看</p></div>'
    root.querySelectorAll<HTMLElement>('[data-engineering-layer]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.engineeringLayer === selected)))
    isolateButton.disabled = !selected || !available
    isolateButton.textContent = !selected ? '先选择一个工程层' : isolated ? '返回分层全景' : '单独查看这一层'
  }
  function select(id: EngineeringLayerId) {
    if (expansion <= 0.05 && !isolated) spread(1)
    selected = id
    view?.select(id, isolated)
    renderDetail()
  }
  function spread(value: number) {
    expansion = value
    isolated = false
    if (value <= 0.05) selected = null
    slider.value = String(Math.round(value * 100))
    slider.setAttribute('aria-valuetext', value === 0 ? '已合拢' : `${Math.round(value * 100)}% 展开`)
    root.querySelector('output')!.textContent = `${Math.round(value * 100)}%`
    expandButton.textContent = value > 0.05 ? '合拢模型' : '展开工程层'
    expandButton.setAttribute('aria-pressed', String(value > 0.05))
    view?.select(selected, false)
    view?.setExpansion(value)
    renderDetail()
  }
  root.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLElement>('button')
    if (!button) return
    const id = button.dataset.engineeringLayer as EngineeringLayerId | undefined
    if (id) { select(id); return }
    switch (button.dataset.engineeringAction) {
      case 'expand': spread(expansion > 0.05 ? 0 : 1); break
      case 'all': selected = null; isolated = false; spread(1); view?.reset(); break
      case 'isolate': isolated = !isolated; view?.select(selected, isolated); renderDetail(); break
      case 'reset': view?.reset(); break
      case 'left': view?.rotate(-0.25); break
      case 'right': view?.rotate(0.25); break
      case 'in': view?.zoom(1.2); break
      case 'out': view?.zoom(1 / 1.2); break
    }
  }, { signal: events.signal })
  slider.addEventListener('input', () => spread(Number(slider.value) / 100), { signal: events.signal })
  host.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', '+', '=', '-'].includes(event.key)) return
    event.preventDefault()
    if (event.key.startsWith('Arrow')) view?.rotate(event.key === 'ArrowLeft' ? -0.2 : 0.2)
    else view?.zoom(event.key === '-' ? 1 / 1.2 : 1.2)
  }, { signal: events.signal })
  renderDetail()
  void import('./engineering-view').then(({ createEngineeringView }) => {
    if (disposed) return
    view = createEngineeringView(host, {
      onSelect: select,
      onLabels: labels => {
        root.querySelector<HTMLElement>('.engineering-tags')!.hidden = false
        for (const label of labels) {
          const element = tags.get(label.id)!
          element.hidden = !label.visible
          element.style.left = `${label.x}px`
          element.style.top = `${label.y}px`
        }
      },
    })
    host.querySelector('.engineering-loading')?.remove()
    view.setExpansion(expansion)
    view.select(selected, isolated)
  }).catch(() => {
    if (disposed) return
    available = false
    host.dataset.renderer = 'fallback'
    host.innerHTML = '<p class="engineering-error">当前浏览器暂时无法显示三维分层。仍可点选左侧工程层阅读说明，或切换到房间与线路。</p>'
    root.querySelector<HTMLElement>('.engineering-tags')!.hidden = true
    root.querySelectorAll<HTMLButtonElement>('.engineering-camera button, .engineering-toolbar button').forEach(button => { button.disabled = true })
    slider.disabled = true
    renderDetail()
  })
  return () => { disposed = true; events.abort(); view?.dispose() }
}

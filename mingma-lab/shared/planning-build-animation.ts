import { drawingBounds, type Bounds, type PlanningModel } from './planning-floorplan'

const svgNamespace = 'http://www.w3.org/2000/svg'
const ease = (t: number) => t * t * (3 - 2 * t)
const phase = (t: number, start: number, end: number) => ease(Math.min(1, Math.max(0, (t - start) / (end - start))))

export function capturePlanningDrawing(paper: HTMLElement, model: PlanningModel) {
  const svg = paper.querySelector('svg')!
  const plane = svg.cloneNode(true) as SVGSVGElement
  if (!model.drawing) {
    const grid = plane.querySelector('#drawing-grid')
    if (grid) grid.id = 'build-drawing-grid'
    plane.querySelector('[fill="url(#drawing-grid)"]')?.setAttribute('fill', 'url(#build-drawing-grid)')
    plane.setAttribute('x', '-.65')
    plane.setAttribute('y', '-.85')
    plane.setAttribute('width', '11.3')
    plane.setAttribute('height', '9.05')
    const { a, b, c, d, e, f } = svg.getScreenCTM()!
    return { plane, screen: new DOMMatrix([a, b, c, d, e, f]) }
  }
  const rect = svg.getBoundingClientRect()
  const [x, y, w, h] = drawingBounds(model)
  plane.setAttribute('x', String(x))
  plane.setAttribute('y', String(y))
  plane.setAttribute('width', String(w))
  plane.setAttribute('height', String(h))
  plane.setAttribute('viewBox', '0 0 100 100')
  plane.setAttribute('preserveAspectRatio', 'none')
  plane.querySelector('[data-plan-selection]')?.remove()
  const image = document.createElementNS(svgNamespace, 'image')
  image.setAttribute('href', model.drawing)
  image.setAttribute('width', '100')
  image.setAttribute('height', '100')
  image.setAttribute('preserveAspectRatio', 'none')
  plane.prepend(image)
  return { plane, screen: new DOMMatrix([rect.width/w, 0, 0, rect.height/h, rect.left-x*rect.width/w, rect.top-y*rect.height/h]) }
}

export function animatePlanningBuild(
  svg: SVGSVGElement,
  drawing: ReturnType<typeof capturePlanningDrawing>,
  settle: (backdrop: number, lift: number, controls: number) => void,
  done: () => void,
) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const screen = svg.getScreenCTM()
  if (reduced || !screen) { done(); return () => {} }
  // Normalize the legacy SVGMatrix and the uploaded image's DOMMatrix.
  const origin = new DOMMatrix([screen.a, screen.b, screen.c, screen.d, screen.e, screen.f]).inverse().multiply(drawing.screen)
  const sheet = document.createElementNS(svgNamespace, 'g')
  sheet.classList.add('planning-build-paper')
  sheet.setAttribute('aria-hidden', 'true')
  sheet.setAttribute('pointer-events', 'none')
  sheet.append(drawing.plane)
  svg.append(sheet)

  const boxes = [...svg.querySelectorAll<SVGGElement>('[data-model-box]')].map(node => ({
    bounds: node.dataset.modelBox!.split(' ').map(Number) as [...Bounds, number, number],
    parts: [...node.children],
    wall: node.hasAttribute('data-model-wall'),
    floor: node.hasAttribute('data-model-floor') || (!node.hasAttribute('data-model-wall') && !node.closest('[data-floor-room]')),
  }))
  const extras = [...svg.querySelectorAll<SVGElement>('.planning-seams, .planning-room-label, .planning-outline, .planning-tint, .planning-hotspot, .planning-lift-shadow, [data-model-detail]')]
  let frame = 0
  function draw(t: number) {
    const tilt = phase(t, 0, .81)
    const walls = phase(t, .17, .83)
    const furnishings = phase(t, .43, .96)
    const mix = (from: number, to: number) => from + (to - from) * tilt
    const a = mix(origin.a, 49), b = mix(origin.b, 18)
    const c = mix(origin.c, -33), d = mix(origin.d, 24)
    const e = mix(origin.e, 300), f = mix(origin.f, 94)
    sheet.setAttribute('transform', `matrix(${a} ${b} ${c} ${d} ${e} ${f})`)
    sheet.setAttribute('opacity', String(1 - phase(t, .07, .46)))
    const project = (x: number, z: number, height: number) =>
      `${(a*x + c*z + e).toFixed(2)},${(b*x + d*z + f - height*53).toFixed(2)}`
    for (const { bounds: [x, z, w, depth, h, base], parts, floor, wall } of boxes) {
      const rise = floor ? phase(t, .05, .57) : wall ? walls : furnishings
      const top = [project(x, z, (base+h)*rise), project(x+w, z, (base+h)*rise), project(x+w, z+depth, (base+h)*rise), project(x, z+depth, (base+h)*rise)]
      const low = [project(x, z, base*rise), project(x+w, z, base*rise), project(x+w, z+depth, base*rise), project(x, z+depth, base*rise)]
      const faces = [[top[3], top[2], low[2], low[3]], [top[1], top[2], low[2], low[1]], top]
      for (let i = 0; i < parts.length; i++) {
        parts[i].setAttribute('points', faces[i].join(' '))
        parts[i].setAttribute('opacity', String(floor ? phase(t, .04, .32) : wall ? phase(t, .13, .38) : rise))
      }
    }
    for (const node of extras) node.style.opacity = String(phase(t, .78, 1))
    const backdrop = phase(t, 0, .22) * (1 - phase(t, .56, .98))
    settle(backdrop, phase(t, .79, 1), phase(t, .80, 1))
  }
  const start = performance.now()
  function tick(time: number) {
    if (!svg.isConnected) return
    const t = Math.min(1, Math.max(0, (time - start) / 2450))
    draw(t)
    if (t < 1) frame = requestAnimationFrame(tick)
    else {
      sheet.remove()
      for (const node of extras) node.style.removeProperty('opacity')
      done()
    }
  }
  tick(start)
  return () => { cancelAnimationFrame(frame); sheet.remove() }
}

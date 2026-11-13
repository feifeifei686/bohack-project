import { rooms, routes, type LayerId, type Point3 } from './house-data'
import type { HouseView } from './house-view'

type HoloOptions = {
  onRoomSelect: (id: string | null) => void
  onRouteSelect: (id: string | null) => void
}
type Point = [number, number, number]
type Face = {
  points: Point[]
  fill: string
  stroke: string
  opacity?: number
  width?: number
  room?: string
  dash?: string
  closed?: boolean
  depthOffset?: number
}
type Box = {
  position: Point
  size: Point
  top: string
  side: string
  stroke: string
  room?: string
  opacity?: number
}

const NS = 'http://www.w3.org/2000/svg'
const mint = '#74f0d5'
const ice = '#c3dedf'
const routeColors: Record<LayerId, string> = {
  cold: '#72d9ff',
  hot: '#ffba8b',
  electric: '#dcecb3',
}
let instanceCount = 0

/**
 * Orthographic 3D renderer. Every wall, object and route is projected from real
 * x/y/z vertices, then painter-sorted by camera depth. SVG keeps this interactive
 * on browsers without a WebGL context; it is not a flattened image of a model.
 */
export function createHoloView(container: HTMLElement, options: HoloOptions): HouseView {
  const uid = `holo-space-${++instanceCount}`
  let disposed = false
  let width = Math.max(container.clientWidth, 320)
  let height = Math.max(container.clientHeight, 300)
  let yaw = -0.55
  let elevation = 0.72
  let zoom = 1
  let selectedRoom: string | null = null
  let selectedRoute: string | null = null
  let wallMode: 'cutaway' | 'full' | 'hidden' = 'cutaway'
  let frame = 0
  let pointer: {
    id: number
    x: number
    y: number
    yaw: number
    elevation: number
    moved: boolean
    target: Element | null
    touch: boolean
  } | null = null
  const allowed = new Set(routes.map((route) => route.id))
  const visible: Record<LayerId, boolean> = { cold: true, hot: true, electric: true }

  const svg = document.createElementNS(NS, 'svg')
  svg.classList.add('holographic-model')
  svg.setAttribute('width', '100%')
  svg.setAttribute('height', '100%')
  svg.setAttribute('role', 'group')
  svg.setAttribute('tabindex', '0')
  svg.setAttribute(
    'aria-label',
    '可旋转的三维户型示意。拖动旋转，滚轮缩放。键盘左右键旋转，加减键缩放。房间与线路也可单独选择。',
  )
  svg.style.cssText =
    'display:block;width:100%;height:100%;overflow:hidden;touch-action:pan-y;user-select:none;cursor:grab;isolation:isolate;'
  container.appendChild(svg)

  function element<K extends keyof SVGElementTagNameMap>(
    name: K,
    attrs: Record<string, string | number> = {},
  ) {
    const node = document.createElementNS(NS, name)
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value))
    return node
  }

  function camera(point: Point): Point {
    const [x, y, z] = point
    const horizontal = x * Math.cos(yaw) + z * Math.sin(yaw)
    const depth = -x * Math.sin(yaw) + z * Math.cos(yaw)
    return [
      horizontal,
      depth * Math.sin(elevation) - y * Math.cos(elevation),
      depth * Math.cos(elevation) + y * Math.sin(elevation),
    ]
  }

  function bounds() {
    const corners: Point[] = []
    for (const x of [-5.8, 5.8])
      for (const z of [-4.15, 4.15]) for (const y of [-0.85, 2.4]) corners.push(camera([x, y, z]))
    const xs = corners.map((p) => p[0])
    const ys = corners.map((p) => p[1])
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }
  }

  let scale = 1
  let centerX = 0
  let centerY = 0
  function project(point: Point): [number, number] {
    const p = camera(point)
    return [width / 2 + (p[0] - centerX) * scale, height / 2 + (p[1] - centerY) * scale]
  }
  function coordinates(points: Point[]) {
    return points
      .map((p) =>
        project(p)
          .map((v) => v.toFixed(2))
          .join(','),
      )
      .join(' ')
  }
  function plane(x: number, y: number, z: number, w: number, d: number): Point[] {
    return [
      [x, y, z],
      [x + w, y, z],
      [x + w, y, z + d],
      [x, y, z + d],
    ]
  }

  function boxFaces(box: Box): Face[] {
    const [x, y, z] = box.position
    const [w, h, d] = box.size
    const points: Point[] = [
      [x, y, z],
      [x + w, y, z],
      [x + w, y, z + d],
      [x, y, z + d],
      [x, y + h, z],
      [x + w, y + h, z],
      [x + w, y + h, z + d],
      [x, y + h, z + d],
    ]
    const eye: Point = [
      -Math.sin(yaw) * Math.cos(elevation),
      Math.sin(elevation),
      Math.cos(yaw) * Math.cos(elevation),
    ]
    const faces: { ids: number[]; normal: Point; fill: string }[] = [
      { ids: [4, 5, 6, 7], normal: [0, 1, 0], fill: box.top },
      { ids: [0, 1, 5, 4], normal: [0, 0, -1], fill: box.side },
      { ids: [1, 2, 6, 5], normal: [1, 0, 0], fill: box.side },
      { ids: [2, 3, 7, 6], normal: [0, 0, 1], fill: box.side },
      { ids: [3, 0, 4, 7], normal: [-1, 0, 0], fill: box.side },
    ]
    return faces
      .filter((face) => face.normal.reduce((sum, n, i) => sum + n * eye[i], 0) > 0.0001)
      .map((face) => ({
        points: face.ids.map((i) => points[i]),
        fill: face.fill,
        stroke: box.stroke,
        opacity: box.opacity ?? 1,
        width: 0.9,
        room: box.room,
      }))
  }

  function sceneGeometry(): Face[] {
    const faces: Face[] = []
    const addBox = (
      position: Point,
      size: Point,
      room?: string,
      tone: 'bright' | 'dim' | 'glass' = 'dim',
    ) => {
      const active = room === selectedRoom
      faces.push(
        ...boxFaces({
          position,
          size,
          room,
          top: active ? '#234a48' : tone === 'bright' ? '#243e45' : '#192d35',
          side: active ? '#153b3b' : '#0d1c26',
          stroke: active ? '#8eead4' : tone === 'glass' ? '#789ca4' : '#527d83',
          opacity: tone === 'glass' ? 0.7 : 0.94,
        }),
      )
    }
    // A recessed lower plate makes the house visibly three-dimensional.
    faces.push(
      ...boxFaces({
        position: [-5.14, -0.31, -3.49],
        size: [10.28, 0.25, 6.98],
        top: '#0c202a',
        side: '#0a151f',
        stroke: '#4c8e91',
        opacity: 0.94,
      }).map((face) => ({ ...face, depthOffset: -200 })),
    )
    for (const room of rooms) {
      const { x, z, width: w, depth: d } = room.bounds
      faces.push({
        points: plane(x + 0.025, -0.04, z + 0.025, w - 0.05, d - 0.05),
        fill: room.id === selectedRoom ? '#164f4b' : '#102b35',
        stroke: room.id === selectedRoom ? mint : '#44757c',
        opacity: 0.95,
        width: room.id === selectedRoom ? 1.7 : 0.8,
        room: room.id,
        depthOffset: -100,
      })
      // Fine surface divisions show scale without painting a decorative grid.
      const step = room.id === 'bathroom' || room.id === 'kitchen' ? 0.6 : 0.9
      for (let dx = step; dx < w; dx += step)
        faces.push({
          points: [
            [x + dx, -0.025, z + 0.06],
            [x + dx, -0.025, z + d - 0.06],
          ],
          fill: 'none',
          stroke: '#4e8789',
          width: 0.4,
          opacity: 0.2,
          closed: false,
          room: room.id,
          depthOffset: -80,
        })
    }

    if (wallMode !== 'hidden') {
      const full = wallMode === 'full'
      const backH = full ? 2.15 : 1.05
      const frontH = full ? 2.15 : 0.22
      const wall = (position: Point, size: Point) =>
        faces.push(
          ...boxFaces({
            position,
            size,
            top: '#325259',
            side: '#162f39',
            stroke: '#79aaac',
            opacity: full ? 0.55 : 0.84,
          }),
        )
      wall([-5.08, 0, -3.43], [10.16, backH, 0.1])
      wall([-5.08, 0, -3.35], [0.1, backH, 6.78])
      wall([4.98, 0, -3.35], [0.1, frontH, 6.78])
      wall([-5, 0, 3.33], [8.28, frontH, 0.1])
      wall([4.3, 0, 3.33], [0.78, frontH, 0.1])
      for (const [x, w] of [
        [-5, 1.7],
        [-2.35, 3.3],
        [1.85, 1.72],
        [4.35, 0.65],
      ])
        wall([x, 0, -0.2], [w, full ? 2.15 : 0.68, 0.1])
      wall([0.27, 0, -3.35], [0.1, full ? 2.15 : 0.72, 3.2])
      wall([3.08, 0, -3.35], [0.1, full ? 2.15 : 0.72, 3.2])
      wall([2.95, 0, -0.15], [0.1, frontH, 0.8])
      wall([2.95, 0, 1.5], [0.1, frontH, 1.85])
      // Survey-height wireframe, deliberately faint and explicitly schematic.
      for (const [x, z] of [
        [-5, -3.35],
        [5, -3.35],
        [-5, 3.35],
        [5, 3.35],
      ])
        faces.push({
          points: [
            [x, 0.1, z],
            [x, 2.15, z],
          ],
          fill: 'none',
          stroke: '#7ba6ae',
          opacity: 0.24,
          width: 0.8,
          dash: '3 5',
          closed: false,
        })
      faces.push({
        points: plane(-5, 2.15, -3.35, 10, 6.7),
        fill: 'none',
        stroke: '#7ba6ae',
        opacity: 0.22,
        width: 0.75,
        dash: '4 7',
      })
    }

    // All furniture is geometric, proportioned within the actual room bounds.
    addBox([-4.45, 0, -2.83], [2.1, 0.2, 2.2], 'bedroom')
    addBox([-4.4, 0.2, -2.78], [2, 0.21, 2.05], 'bedroom', 'bright')
    addBox([-4.43, 0.18, -2.96], [2.06, 0.52, 0.12], 'bedroom')
    addBox([-4.25, 0.41, -2.58], [0.78, 0.09, 0.43], 'bedroom', 'bright')
    addBox([-3.29, 0.41, -2.58], [0.68, 0.09, 0.43], 'bedroom', 'bright')
    addBox([-2.15, 0, -2.74], [0.52, 0.43, 0.58], 'bedroom')
    addBox([-0.58, 0, -3.03], [0.64, 1.15, 1.4], 'bedroom', 'glass')
    // Sofa, back cushion and low central table.
    addBox([-4.35, 0, 0.38], [3.1, 0.32, 0.96], 'living')
    addBox([-4.35, 0.3, 0.38], [3.1, 0.42, 0.18], 'living', 'bright')
    addBox([-4.35, 0.25, 0.55], [0.18, 0.32, 0.79], 'living', 'bright')
    addBox([-1.43, 0.25, 0.55], [0.18, 0.32, 0.79], 'living', 'bright')
    addBox([-3.55, 0, 1.85], [1.6, 0.32, 0.8], 'living', 'glass')
    addBox([2.12, 0, 0.45], [0.4, 0.42, 1.75], 'living')
    addBox([2.25, 0.42, 0.6], [0.08, 0.83, 1.4], 'living', 'glass')
    // Counter volumes and inset work surfaces.
    addBox([0.56, 0, -3.09], [2.24, 0.68, 0.56], 'kitchen')
    addBox([0.56, 0, -2.53], [0.56, 0.68, 1.72], 'kitchen')
    addBox([2.21, 0, -2.43], [0.61, 1.23, 0.65], 'kitchen', 'glass')
    faces.push({
      points: plane(0.66, 0.69, -2.15, 0.35, 0.58),
      fill: '#071c24',
      stroke: '#a2cece',
      width: 0.75,
      room: 'kitchen',
    })
    faces.push({
      points: plane(1.28, 0.69, -3.01, 0.78, 0.38),
      fill: '#071c24',
      stroke: '#81b2b5',
      width: 0.75,
      room: 'kitchen',
    })
    addBox([3.38, 0, -3.05], [1.32, 0.65, 0.52], 'bathroom')
    faces.push({
      points: plane(3.62, 0.66, -2.96, 0.74, 0.35),
      fill: '#071c24',
      stroke: '#9cc6c7',
      width: 0.75,
      room: 'bathroom',
    })
    addBox([4.15, 0, -1.98], [0.47, 0.4, 0.72], 'bathroom', 'bright')
    addBox([4.15, 0.38, -2.04], [0.47, 0.38, 0.17], 'bathroom', 'bright')
    faces.push({
      points: plane(3.35, 0.01, -1.13, 1.3, 0.8),
      fill: '#16404a',
      stroke: '#668c96',
      opacity: 0.6,
      room: 'bathroom',
    })
    addBox([3.33, 0, 2.62], [1.25, 0.65, 0.4], 'entry')
    addBox([3.38, 0, 0.28], [0.4, 0.35, 0.4], 'entry', 'glass')
    return faces
  }

  function visibleRoute(id: string) {
    const route = routes.find((route) => route.id === id)
    return !!route && allowed.has(id) && visible[route.layer]
  }

  function appendGuide(group: SVGGElement, points: Point[], opacity = 0.25, dash?: string) {
    const line = element('polyline', {
      points: coordinates(points),
      fill: 'none',
      stroke: '#5dada9',
      'stroke-width': 0.7,
      opacity,
      'pointer-events': 'none',
    })
    if (dash) line.setAttribute('stroke-dasharray', dash)
    group.appendChild(line)
  }

  function render() {
    frame = 0
    if (disposed) return
    const focus = (document.activeElement as HTMLElement | null)?.getAttribute('data-focus-key')
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
    const b = bounds()
    const inset = width < 500 ? 16 : 28
    scale =
      Math.min((width - inset * 2) / (b.x1 - b.x0), (height - inset * 2) / (b.y1 - b.y0)) * zoom
    centerX = (b.x0 + b.x1) / 2
    centerY = (b.y0 + b.y1) / 2
    const defs = element('defs')
    const filter = element('filter', {
      id: `${uid}-glow`,
      x: '-80%',
      y: '-80%',
      width: '260%',
      height: '260%',
    })
    filter.appendChild(element('feGaussianBlur', { stdDeviation: 2.3, result: 'blur' }))
    const merge = element('feMerge')
    merge.append(
      element('feMergeNode', { in: 'blur' }),
      element('feMergeNode', { in: 'SourceGraphic' }),
    )
    filter.appendChild(merge)
    defs.appendChild(filter)
    const drawing = element('g', { class: 'holo-drawing' })
    const guides = element('g')
    drawing.appendChild(guides)
    // Datum plate, short orthogonal measure ticks and the offset survey outline.
    appendGuide(guides, [...plane(-5.48, -0.75, -3.83, 10.96, 7.66), [-5.48, -0.75, -3.83]], 0.48)
    appendGuide(
      guides,
      [...plane(-5.3, -0.57, -3.65, 10.6, 7.3), [-5.3, -0.57, -3.65]],
      0.21,
      '4 5',
    )
    for (let x = -5; x <= 5; x += 0.5)
      appendGuide(
        guides,
        [
          [x, -0.75, 3.83],
          [x, -0.75, x % 1 === 0 ? 4.05 : 3.93],
        ],
        x % 1 === 0 ? 0.48 : 0.2,
      )
    for (let z = -3.5; z <= 3.5; z += 0.5)
      appendGuide(
        guides,
        [
          [5.48, -0.75, z],
          [z % 1 === 0 ? 5.7 : 5.58, -0.75, z],
        ],
        z % 1 === 0 ? 0.48 : 0.2,
      )
    for (const [x, z] of [
      [-5.48, -3.83],
      [5.48, -3.83],
      [-5.48, 3.83],
      [5.48, 3.83],
    ])
      appendGuide(
        guides,
        [
          [x, -0.75, z],
          [x, -0.34, z],
        ],
        0.5,
      )

    const faces = sceneGeometry()
    const depth = (face: Face) =>
      face.points.reduce((sum, p) => sum + camera(p)[2], 0) / face.points.length +
      (face.depthOffset ?? 0)
    faces.sort((a, b) => depth(a) - depth(b))
    for (const face of faces) {
      const shape = element(face.closed === false ? 'polyline' : 'polygon', {
        points: coordinates(face.points),
        fill: face.fill,
        stroke: face.stroke,
        'stroke-width': face.width ?? 0.8,
        'stroke-linejoin': 'round',
        opacity: face.opacity ?? 1,
        'vector-effect': 'non-scaling-stroke',
      })
      if (face.dash) shape.setAttribute('stroke-dasharray', face.dash)
      if (face.room) {
        shape.setAttribute('data-room', face.room)
        shape.style.cursor = 'pointer'
      } else shape.setAttribute('pointer-events', 'none')
      drawing.appendChild(shape)
    }
    // Route overlays are inspectable x/y/z engineering sketches, not inferred paths.
    const routeGroup = element('g', { class: 'holo-routes' })
    for (const route of routes.filter((r) => visibleRoute(r.id))) {
      const active = selectedRoute === route.id
      const group = element('g', {
        'data-route': route.id,
        'data-focus-key': route.id,
        tabindex: 0,
        role: 'button',
        'aria-label': `${route.name}，示意线路`,
        'aria-pressed': active ? 'true' : 'false',
      })
      group.style.cursor = 'pointer'
      const points = coordinates(route.points as Point[])
      group.appendChild(
        element('polyline', {
          points,
          fill: 'none',
          stroke: 'transparent',
          'stroke-width': 13,
          'pointer-events': 'stroke',
        }),
      )
      const line = element('polyline', {
        points,
        fill: 'none',
        stroke: routeColors[route.layer],
        'stroke-width': active ? 2.8 : 1.35,
        opacity: active ? 1 : 0.58,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'pointer-events': 'none',
      })
      if (route.layer === 'electric') line.setAttribute('stroke-dasharray', '5 4')
      if (active) line.setAttribute('filter', `url(#${uid}-glow)`)
      group.appendChild(line)
      const end = project(route.points.at(-1)! as Point)
      group.append(
        element('circle', {
          cx: end[0],
          cy: end[1],
          r: active ? 5 : 3,
          fill: routeColors[route.layer],
          stroke: '#06141a',
          'stroke-width': 1.4,
          'pointer-events': 'none',
        }),
      )
      routeGroup.appendChild(group)
    }
    drawing.appendChild(routeGroup)

    // Room labels stay screen-aligned while their anchors orbit with the model.
    const labels = element('g', { class: 'holo-room-labels' })
    const compact = width < 500
    for (const room of rooms) {
      const { x, z, width: w, depth: d } = room.bounds
      const anchor: Point = [x + w * 0.54, 0.02, z + d * (room.id === 'living' ? 0.75 : 0.68)]
      const projected = project(anchor)
      const selected = selectedRoom === room.id
      const group = element('g', {
        'data-room': room.id,
        'data-focus-key': room.id,
        tabindex: 0,
        role: 'button',
        'aria-label': `${room.name}，演示面积 ${room.area} 平方米`,
        'aria-pressed': selected ? 'true' : 'false',
      })
      group.style.cssText = 'cursor:pointer;outline:none;'
      const labelY = projected[1] - (compact ? 10 : 15)
      group.append(
        element('rect', {
          x: projected[0] - 35,
          y: labelY - 16,
          width: 70,
          height: 43,
          fill: '#08151c',
          opacity: 0.8,
          rx: 4,
          'pointer-events': 'all',
        }),
      )
      const label = element('text', {
        x: projected[0],
        y: labelY,
        'text-anchor': 'middle',
        fill: selected ? mint : '#daefed',
        'font-size': compact ? 10 : 12,
        'font-weight': 600,
        'font-family': 'var(--font-sans, sans-serif)',
        'pointer-events': 'none',
      })
      label.textContent = room.name
      const area = element('text', {
        x: projected[0],
        y: labelY + 15,
        'text-anchor': 'middle',
        fill: '#92b2b6',
        'font-size': compact ? 8 : 9,
        'font-family': 'var(--font-sans, sans-serif)',
        'pointer-events': 'none',
      })
      area.textContent = `${room.area} m²`
      group.append(label, area)
      if (selected) {
        const outline = element('polygon', {
          points: coordinates(plane(x + 0.03, 0.05, z + 0.03, w - 0.06, d - 0.06)),
          fill: 'none',
          stroke: mint,
          'stroke-width': 1.8,
          'pointer-events': 'none',
        })
        outline.setAttribute('filter', `url(#${uid}-glow)`)
        drawing.appendChild(outline)
      }
      labels.appendChild(group)
    }
    drawing.appendChild(labels)
    svg.replaceChildren(defs, drawing)
    if (focus) svg.querySelector<SVGElement>(`[data-focus-key="${focus}"]`)?.focus()
  }

  function invalidate() {
    if (!disposed && !frame) frame = requestAnimationFrame(render)
  }
  function selectRoom(id: string | null) {
    selectedRoom = rooms.some((room) => room.id === id) ? id : null
    invalidate()
  }
  function selectRoute(id: string | null) {
    selectedRoute = id && visibleRoute(id) ? id : null
    if (selectedRoute) selectedRoom = routes.find((route) => route.id === selectedRoute)!.roomId
    invalidate()
  }
  function clearHiddenSelection() {
    if (selectedRoute && !visibleRoute(selectedRoute)) {
      selectedRoute = null
      options.onRouteSelect(null)
    }
  }
  function choose(target: Element | null) {
    const route = target?.closest('[data-route]')?.getAttribute('data-route')
    const room = target?.closest('[data-room]')?.getAttribute('data-room')
    if (route && visibleRoute(route)) {
      selectRoute(route)
      options.onRouteSelect(route)
    } else if (room) {
      selectedRoute = null
      selectRoom(room)
      options.onRoomSelect(room)
    }
  }
  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0 || pointer) return
    pointer = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      yaw,
      elevation,
      moved: false,
      target: event.target as Element,
      touch: event.pointerType === 'touch',
    }
    svg.setPointerCapture(event.pointerId)
    svg.style.cursor = 'grabbing'
  }
  function onPointerMove(event: PointerEvent) {
    if (!pointer || pointer.id !== event.pointerId) return
    const dx = event.clientX - pointer.x
    const dy = event.clientY - pointer.y
    if (Math.abs(dx) + Math.abs(dy) > 5) pointer.moved = true
    if (!pointer.moved) return
    yaw = pointer.yaw + dx * 0.006
    if (!pointer.touch) elevation = Math.max(0.36, Math.min(1.52, pointer.elevation + dy * 0.004))
    invalidate()
  }
  function onPointerUp(event: PointerEvent) {
    if (!pointer || pointer.id !== event.pointerId) return
    if (!pointer.moved && event.type !== 'pointercancel') choose(pointer.target)
    if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId)
    pointer = null
    svg.style.cursor = 'grab'
  }
  function onWheel(event: WheelEvent) {
    event.preventDefault()
    zoom = Math.max(0.65, Math.min(1.7, zoom * Math.exp(-event.deltaY * 0.001)))
    invalidate()
  }
  function onKey(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      choose(event.target as Element)
      return
    }
    if (!['ArrowLeft', 'ArrowRight', '+', '=', '-'].includes(event.key)) return
    event.preventDefault()
    if (event.key === 'ArrowLeft') yaw -= 0.12
    else if (event.key === 'ArrowRight') yaw += 0.12
    else zoom = Math.max(0.65, Math.min(1.7, zoom + (event.key === '-' ? -0.1 : 0.1)))
    invalidate()
  }

  svg.addEventListener('pointerdown', onPointerDown)
  svg.addEventListener('pointermove', onPointerMove)
  svg.addEventListener('pointerup', onPointerUp)
  svg.addEventListener('pointercancel', onPointerUp)
  svg.addEventListener('wheel', onWheel, { passive: false })
  svg.addEventListener('keydown', onKey)
  const observer = new ResizeObserver((entries) => {
    const rect = entries[0]?.contentRect
    if (rect && rect.width > 0) {
      width = rect.width
      height = Math.max(rect.height, 260)
      invalidate()
    }
  })
  observer.observe(container)
  render()

  return {
    selectRoom,
    selectRoute,
    setVisibleRoutes(ids) {
      allowed.clear()
      ids.forEach((id) => {
        if (routes.some((route) => route.id === id)) allowed.add(id)
      })
      clearHiddenSelection()
      invalidate()
    },
    setLayer(layer, value) {
      visible[layer] = value
      clearHiddenSelection()
      invalidate()
    },
    setWallMode(mode) {
      wallMode = mode
      invalidate()
    },
    setView(view) {
      yaw = view === 'top' ? 0 : -0.55
      elevation = view === 'top' ? Math.PI / 2 : 0.72
      zoom = 1
      invalidate()
    },
    dispose() {
      disposed = true
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
      svg.removeEventListener('pointerdown', onPointerDown)
      svg.removeEventListener('pointermove', onPointerMove)
      svg.removeEventListener('pointerup', onPointerUp)
      svg.removeEventListener('pointercancel', onPointerUp)
      svg.removeEventListener('wheel', onWheel)
      svg.removeEventListener('keydown', onKey)
      svg.remove()
    },
  }
}

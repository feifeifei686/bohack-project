import { layerColors, rooms, routes, type LayerId } from './house-data'
import type { HouseView } from './house-view'

type PlanOptions = {
  onRoomSelect: (id: string | null) => void
  onRouteSelect: (id: string | null) => void
}

const SVG_NS = 'http://www.w3.org/2000/svg'

/** Functional fallback using the same x/z coordinates as the 3D model. */
export function createPlanView(container: HTMLElement, options: PlanOptions): HouseView {
  let disposed = false
  let selectedRoom: string | null = null
  let selectedRoute: string | null = null
  let wallMode: 'cutaway' | 'full' | 'hidden' = 'cutaway'
  let allowedRoutes = new Set(routes.map(route => route.id))
  const layerVisible: Record<LayerId, boolean> = { cold: true, hot: true, electric: true }
  const floorNodes = new Map<string, SVGRectElement>()
  const routeNodes = new Map<string, { group: SVGGElement; line: SVGPolylineElement; markers: SVGCircleElement[] }>()

  const root = document.createElement('div')
  root.className='plan-fallback'
  root.style.cssText = 'position:relative;width:100%;height:100%;min-height:260px;overflow:hidden;background:#f4f3ec;'
  const badge = document.createElement('div')
  badge.textContent = '二维户型示意 · 兼容模式'
  badge.style.cssText = 'position:absolute;z-index:1;top:12px;left:12px;padding:6px 9px;background:#fffef7;color:#47594e;border:1px solid #d7dfd6;border-radius:6px;font:12px/1.4 system-ui,sans-serif;pointer-events:none;'
  root.appendChild(badge)

  function svgNode<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
    const node = document.createElementNS(SVG_NS, name)
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value))
    return node
  }
  const svg = svgNode('svg', {
    viewBox: '-5.55 -4.05 11.1 8.1',
    width: '100%', height: '100%',
    preserveAspectRatio: 'xMidYMid meet',
    role: 'group', 'aria-label': '可点击房间和线路的二维户型平面示意',
  })
  svg.style.cssText = 'display:block;width:100%;height:100%;font-family:"PingFang SC","Microsoft YaHei",sans-serif;'
  root.appendChild(svg)
  container.appendChild(root)

  const base = svgNode('rect', {
    x: -5.15, y: -3.5, width: 10.3, height: 7,
    fill: '#dcd8c8', rx: 0.08,
  })
  svg.appendChild(base)
  const floorGroup = svgNode('g')
  const pipeGroup = svgNode('g')
  const labelGroup = svgNode('g', { 'pointer-events': 'none', 'aria-hidden': 'true' })
  svg.append(floorGroup, pipeGroup, labelGroup)

  function activate(node: SVGElement, action: () => void) {
    node.setAttribute('tabindex', '0')
    node.setAttribute('role', 'button')
    node.style.cursor = 'pointer'
    node.addEventListener('click', event => {
      event.stopPropagation()
      if (!disposed) action()
    })
    node.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      event.stopPropagation()
      if (!disposed) action()
    })
    node.addEventListener('focus', () => { node.style.outline = '2px solid #265e49'; node.style.outlineOffset = '3px' })
    node.addEventListener('blur', () => { node.style.outline = '' })
  }

  for (const room of rooms) {
    const { x, z, width, depth } = room.bounds
    const floor = svgNode('rect', {
      x: x + 0.035, y: z + 0.035,
      width: width - 0.07, height: depth - 0.07,
      rx: 0.025, fill: room.id === 'bathroom' ? '#e1e9e3' : '#ebe6d7',
      stroke: '#b7b5a5', 'stroke-width': 0.025,
      'aria-label': `${room.name}，演示面积 ${room.area} 平方米`,
    })
    const title = svgNode('title')
    title.textContent = `${room.name} · ${room.area} m² · 演示户型`
    floor.appendChild(title)
    activate(floor, () => {
      selectRoom(room.id)
      options.onRoomSelect(room.id)
    })
    floorGroup.appendChild(floor)
    floorNodes.set(room.id, floor)

    const centerX = x + width / 2
    const centerY = z + depth / 2
    const name = svgNode('text', {
      x: centerX, y: centerY - 0.025,
      'font-size': 0.25, 'font-weight': 600,
      'text-anchor': 'middle', fill: '#2c4a3b',
      stroke: '#f8f7ee', 'stroke-width': 0.05, 'paint-order': 'stroke',
    })
    name.textContent = room.name
    const area = svgNode('text', {
      x: centerX, y: centerY + 0.27,
      'font-size': 0.2, 'text-anchor': 'middle', fill: '#58675c',
      stroke: '#f8f7ee', 'stroke-width': 0.045, 'paint-order': 'stroke',
    })
    area.textContent = `${room.area} m²`
    labelGroup.append(name, area)
  }

  for (const route of routes) {
    const group = svgNode('g', { 'aria-label': `${route.name}，示意线路` })
    const coordinates = route.points.map(([x, , z]) => `${x},${z}`).join(' ')
    const hit = svgNode('polyline', {
      points: coordinates, fill: 'none', stroke: 'transparent', 'stroke-width': 0.2,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'pointer-events': 'stroke',
    })
    const line = svgNode('polyline', {
      points: coordinates, fill: 'none', stroke: layerColors[route.layer], 'stroke-width': 0.04,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'pointer-events': 'none',
    })
    if (route.layer === 'electric') line.setAttribute('stroke-dasharray', '0.12 0.06')
    const title = svgNode('title')
    title.textContent = `${route.name} · ${route.from} → ${route.to} · 示意`
    group.append(title, hit, line)
    const markers: SVGCircleElement[] = []
    for (const [x, , z] of [route.points[0], route.points[route.points.length - 1]]) {
      const marker = svgNode('circle', {
        cx: x, cy: z, r: 0.065, fill: layerColors[route.layer],
        stroke: '#fffef8', 'stroke-width': 0.025, 'pointer-events': 'none',
      })
      group.appendChild(marker)
      markers.push(marker)
    }
    activate(group, () => {
      selectRoute(route.id)
      options.onRouteSelect(route.id)
    })
    pipeGroup.appendChild(group)
    routeNodes.set(route.id, { group, line, markers })
  }

  function routeIsVisible(id: string) {
    const route = routes.find(item => item.id === id)
    return Boolean(route && allowedRoutes.has(id) && layerVisible[route.layer])
  }
  function update() {
    if (disposed) return
    for (const room of rooms) {
      const floor = floorNodes.get(room.id)!
      const chosen = room.id === selectedRoom
      floor.setAttribute('fill', chosen ? '#cce0d0' : room.id === 'bathroom' ? '#e1e9e3' : '#ebe6d7')
      floor.setAttribute('stroke', wallMode === 'hidden' ? 'none' : chosen ? '#3d7358' : '#b7b5a5')
      floor.setAttribute('stroke-width', chosen ? '0.06' : wallMode === 'full' ? '0.065' : '0.025')
      floor.setAttribute('aria-pressed', String(chosen))
    }
    for (const route of routes) {
      const nodes = routeNodes.get(route.id)!
      const visible = routeIsVisible(route.id)
      const chosen = selectedRoute === route.id
      nodes.group.style.display = visible ? '' : 'none'
      nodes.group.setAttribute('aria-hidden', String(!visible))
      nodes.group.setAttribute('aria-pressed', String(chosen))
      nodes.group.setAttribute('tabindex', visible ? '0' : '-1')
      nodes.group.setAttribute('opacity', selectedRoute ? chosen ? '1' : '0.3' : !selectedRoom || route.roomId === selectedRoom ? '1' : '0.45')
      nodes.line.setAttribute('stroke', chosen ? '#245d45' : layerColors[route.layer])
      nodes.line.setAttribute('stroke-width', chosen ? '0.075' : '0.04')
      nodes.markers.forEach(marker => marker.setAttribute('fill', chosen ? '#245d45' : layerColors[route.layer]))
    }
  }
  function selectRoom(id: string | null) {
    selectedRoom = rooms.some(room => room.id === id) ? id : null
    selectedRoute = null
    update()
  }
  function selectRoute(id: string | null) {
    selectedRoute = id && routeIsVisible(id) ? id : null
    if (selectedRoute) selectedRoom = routes.find(route => route.id === selectedRoute)!.roomId
    update()
  }
  function clearHiddenSelection() {
    if (!selectedRoute || routeIsVisible(selectedRoute)) return false
    selectedRoute = null
    return true
  }
  function setVisibleRoutes(ids: string[]) {
    allowedRoutes = new Set(ids.filter(id => routeNodes.has(id)))
    const cleared = clearHiddenSelection()
    update()
    if (cleared && !disposed) options.onRouteSelect(null)
  }
  update()

  return {
    selectRoom,
    selectRoute,
    setVisibleRoutes,
    setLayer(layer, visible) {
      layerVisible[layer] = visible
      const cleared = clearHiddenSelection()
      update()
      if (cleared && !disposed) options.onRouteSelect(null)
    },
    setWallMode(mode) {
      wallMode = mode
      update()
    },
    setView() {
      // A plan is already an orthographic top view; retain the shared API.
    },
    dispose() {
      disposed = true
      root.remove()
    },
  }
}

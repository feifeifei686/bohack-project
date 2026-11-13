import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { layerColors, rooms, routes, type LayerId, type Room, type Route } from './house-data'

interface HouseViewOptions {
  onRoomSelect: (id: string | null) => void
  onRouteSelect: (id: string | null) => void
}

export interface HouseView {
  selectRoom: (id: string | null) => void
  selectRoute: (id: string | null) => void
  setVisibleRoutes: (ids: string[]) => void
  setLayer: (layer: LayerId, visible: boolean) => void
  setWallMode: (mode: 'cutaway' | 'full' | 'hidden') => void
  setView: (view: 'iso' | 'top') => void
  dispose: () => void
}

export function createHouseView(container: HTMLElement, options: HouseViewOptions): HouseView {
  const scene = new THREE.Scene()
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.35
  renderer.domElement.setAttribute('aria-label', '可拖动旋转的五房间户型及演示水电线路，房间和线路也可通过旁边的按钮选择')
  renderer.domElement.style.touchAction = 'none'
  renderer.domElement.style.display = 'block'
  container.appendChild(renderer.domElement)

  const camera = new THREE.OrthographicCamera(-8, 8, 6, -6, 0.1, 100)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = false
  controls.minZoom = 0.6
  controls.maxZoom = 3.2
  controls.maxPolarAngle = Math.PI / 2.08
  controls.minPolarAngle = 0
  controls.screenSpacePanning = true
  controls.target.set(0, 0.35, 0)
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }

  let disposed = false
  let renderFrame = 0
  const render = () => {
    renderFrame = 0
    if (!disposed) renderer.render(scene, camera)
  }
  const invalidate = () => {
    if (!disposed && !renderFrame) renderFrame = requestAnimationFrame(render)
  }
  controls.addEventListener('change', invalidate)
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8b19c, 2.6))
  const sun = new THREE.DirectionalLight(0xfff5de, 3.2)
  sun.position.set(-5, 12, 8)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 0.5, far: 35 })
  sun.shadow.normalBias = 0.04
  sun.shadow.bias = -0.00015
  scene.add(sun)

  const material = (color: THREE.ColorRepresentation, roughness = 0.85) => new THREE.MeshStandardMaterial({ color, roughness })
  const wallMaterial = material('#eee9d9')
  const woodMaterial = material('#b9a07a')
  const paleWoodMaterial = material('#d3c29e')
  const linenMaterial = material('#c9c4ac')
  const cushionMaterial = material('#e6e1d2')
  const sageMaterial = material('#87957d')
  const ceramicMaterial = material('#eeeee6', 0.45)
  const darkMaterial = material('#52645a')
  const metalMaterial = material('#8a9894', 0.4)
  const furniture = new THREE.Group()
  const walls = new THREE.Group()
  scene.add(furniture, walls)
  const roomTargets: THREE.Object3D[] = []
  const highlights = new Map<string, THREE.Mesh>()
  const labelSprites = new Map<string, THREE.Sprite>()
  const routeMeshes = new Map<string, { group: THREE.Group; tube: THREE.Mesh; hit: THREE.Mesh; route: Route }>()
  const layerGroups: Record<LayerId, THREE.Group> = { cold: new THREE.Group(), hot: new THREE.Group(), electric: new THREE.Group() }
  Object.values(layerGroups).forEach((group) => scene.add(group))
  let selectedRoom: string | null = null
  let selectedRoute: string | null = null
  let allowedRoutes = new Set(routes.map((route) => route.id))
  let wallMode: 'cutaway' | 'full' | 'hidden' = 'cutaway'

  function box(parent: THREE.Object3D, size: [number, number, number], position: [number, number, number], mat: THREE.Material, roomId?: string, rounded = false) {
    const geometry = rounded
      ? new RoundedBoxGeometry(...size, 2, Math.min(0.05, ...size.map((value) => value / 5)))
      : new THREE.BoxGeometry(...size)
    const mesh = new THREE.Mesh(geometry, mat)
    mesh.position.set(...position)
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    if (roomId) {
      mesh.userData.roomId = roomId
      roomTargets.push(mesh)
    }
    return mesh
  }

  const slab = box(scene, [10.35, 0.24, 7.05], [0, -0.2, 0], material('#d8d0b8'))
  slab.castShadow = false
  const shadowFloor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: 0.12 }))
  shadowFloor.rotation.x = -Math.PI / 2
  shadowFloor.position.y = -0.33
  shadowFloor.receiveShadow = true
  scene.add(shadowFloor)

  function floorTexture(tile: boolean): THREE.CanvasTexture {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = tile ? '#e6e2d5' : '#e5d9bd'
    ctx.fillRect(0, 0, 256, 256)
    ctx.strokeStyle = tile ? '#d3cdbd' : '#d5c7a7'
    ctx.lineWidth = tile ? 2 : 1.3
    for (let row = 0; row <= 4; row++) {
      const y = row * 64
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke()
      for (let col = 0; col < 4; col++) {
        const x = tile ? col * 64 : col * 128 + (row % 2) * 64
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 64); ctx.stroke()
      }
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(tile ? 2 : 1.8, tile ? 2 : 2.8)
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy())
    return texture
  }
  const woodTexture = floorTexture(false)
  const tileTexture = floorTexture(true)

  function createRoomLabel(room: Room): THREE.Sprite {
    const canvas = document.createElement('canvas')
    canvas.width = 400
    canvas.height = 128
    const ctx = canvas.getContext('2d')!
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = '#fffdf5'
    ctx.shadowBlur = 8
    ctx.fillStyle = '#344c40'
    ctx.font = '600 36px "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.fillText(room.name, 200, 42)
    ctx.font = '26px "PingFang SC", sans-serif'
    ctx.fillText(`${room.area} m²`, 200, 84)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }))
    sprite.scale.set(2.05, 0.66, 1)
    sprite.position.set(room.bounds.x + room.bounds.width / 2, 0.3, room.bounds.z + room.bounds.depth * 0.78)
    sprite.renderOrder = 20
    sprite.userData.roomId = room.id
    roomTargets.push(sprite)
    labelSprites.set(room.id, sprite)
    return sprite
  }

  for (const room of rooms) {
    const { x, z, width, depth } = room.bounds
    const tile = room.id === 'kitchen' || room.id === 'bathroom'
    const floorMat = new THREE.MeshStandardMaterial({ map: tile ? tileTexture : woodTexture, color: room.id === 'bathroom' ? '#d8e4df' : '#ffffff', roughness: 0.9 })
    box(scene, [width - 0.04, 0.08, depth - 0.04], [x + width / 2, -0.035, z + depth / 2], floorMat, room.id)
    const overlay = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.08, depth - 0.08), new THREE.MeshBasicMaterial({ color: '#80bba2', transparent: true, opacity: 0.32, depthWrite: false }))
    overlay.rotation.x = -Math.PI / 2
    overlay.position.set(x + width / 2, 0.009, z + depth / 2)
    overlay.visible = false
    scene.add(overlay)
    highlights.set(room.id, overlay)
    scene.add(createRoomLabel(room))
  }

  // Door openings make the model readable from its interior view.
  function wall(width: number, depth: number, x: number, z: number) {
    const mesh = box(walls, [width, 2.5, depth], [x, 1.25, z], wallMaterial)
    mesh.userData.wall = true
  }
  wall(10.15, 0.15, 0, -3.35)
  wall(0.15, 6.7, -5, 0)
  wall(0.15, 6.7, 5, 0)
  wall(8.7, 0.15, -0.65, 3.35)
  wall(0.55, 0.15, 4.725, 3.35)
  wall(4.15, 0.14, -2.925, -0.15)
  wall(0.4, 0.14, 0.1125, -0.15)
  wall(0.45, 0.14, 0.5375, -0.15)
  wall(1.4, 0.14, 2.425, -0.15)
  wall(0.35, 0.14, 3.3, -0.15)
  wall(0.7, 0.14, 4.65, -0.15)
  wall(0.14, 3.2, 0.3125, -1.75)
  wall(0.14, 3.2, 3.125, -1.75)
  wall(0.14, 1.65, 3, 2.525)

  // Living room: low furnishings keep the routing diagram visible.
  box(furniture, [3.25, 0.035, 2.2], [-2.55, 0.025, 1.7], material('#d4c4a4'), 'living', true)
  box(furniture, [2.65, 0.3, 0.82], [-2.8, 0.26, 2.55], linenMaterial, 'living', true)
  box(furniture, [2.65, 0.35, 0.17], [-2.8, 0.58, 2.88], linenMaterial, 'living', true)
  for (const x of [-3.57, -2.8, -2.03]) box(furniture, [0.73, 0.13, 0.67], [x, 0.47, 2.5], cushionMaterial, 'living', true)
  for (const x of [-4.06, -1.54]) box(furniture, [0.18, 0.35, 0.82], [x, 0.48, 2.55], linenMaterial, 'living', true)
  box(furniture, [1.15, 0.08, 0.65], [-2.8, 0.38, 1.25], woodMaterial, 'living', true)
  box(furniture, [0.8, 0.26, 0.4], [-2.8, 0.21, 1.25], paleWoodMaterial, 'living')
  box(furniture, [2.7, 0.37, 0.4], [-2.2, 0.2, 0.18], paleWoodMaterial, 'living', true)
  box(furniture, [1.15, 0.7, 0.07], [-2.2, 0.76, 0.13], darkMaterial, 'living')
  box(furniture, [1.25, 0.08, 0.85], [1.4, 0.76, 1.5], paleWoodMaterial, 'living', true)
  for (const x of [0.9, 1.9]) {
    for (const z of [1.2, 1.8]) box(furniture, [0.06, 0.68, 0.06], [x, 0.38, z], woodMaterial, 'living')
    for (const z of [0.75, 2.25]) {
      box(furniture, [0.4, 0.1, 0.42], [x, 0.43, z], sageMaterial, 'living', true)
      box(furniture, [0.4, 0.45, 0.08], [x, 0.62, z + (z > 1.5 ? 0.18 : -0.18)], sageMaterial, 'living', true)
    }
  }

  // Bedroom.
  box(furniture, [1.85, 0.28, 2.2], [-2.8, 0.2, -2.08], woodMaterial, 'bedroom', true)
  box(furniture, [1.8, 0.2, 2.05], [-2.8, 0.43, -2.05], ceramicMaterial, 'bedroom', true)
  box(furniture, [1.8, 0.06, 1.4], [-2.8, 0.56, -1.7], sageMaterial, 'bedroom', true)
  box(furniture, [1.9, 0.7, 0.12], [-2.8, 0.55, -3.12], linenMaterial, 'bedroom', true)
  for (const x of [-3.25, -2.35]) box(furniture, [0.68, 0.11, 0.43], [x, 0.59, -2.82], cushionMaterial, 'bedroom', true)
  for (const x of [-4.05, -1.55]) box(furniture, [0.5, 0.45, 0.48], [x, 0.24, -2.85], paleWoodMaterial, 'bedroom', true)
  box(furniture, [0.6, 1.65, 1.6], [-0.12, 0.85, -1.65], paleWoodMaterial, 'bedroom')

  // Kitchen counters, sink and hob.
  box(furniture, [0.57, 0.79, 2.25], [0.66, 0.42, -2.04], paleWoodMaterial, 'kitchen')
  box(furniture, [0.65, 0.065, 2.3], [0.68, 0.85, -2.04], ceramicMaterial, 'kitchen')
  box(furniture, [1.85, 0.79, 0.55], [1.87, 0.42, -3.02], paleWoodMaterial, 'kitchen')
  box(furniture, [1.9, 0.065, 0.6], [1.87, 0.85, -3.02], ceramicMaterial, 'kitchen')
  box(furniture, [0.42, 0.025, 0.6], [0.68, 0.89, -2.25], metalMaterial, 'kitchen', true)
  box(furniture, [0.5, 0.03, 0.38], [1.88, 0.9, -3.02], darkMaterial, 'kitchen', true)
  for (const x of [1.75, 2.01]) {
    const hob = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.015, 20), metalMaterial)
    hob.position.set(x, 0.925, -3.02)
    furniture.add(hob)
  }
  box(furniture, [0.65, 1.65, 0.65], [2.7, 0.85, -1.1], material('#b8c4bd'), 'kitchen', true)

  // Bathroom fixtures are symbolic, without construction specifications.
  box(furniture, [1.28, 0.12, 0.85], [4.03, 0.09, -2.72], ceramicMaterial, 'bathroom', true)
  box(furniture, [0.95, 0.52, 0.53], [4.1, 0.65, -0.61], paleWoodMaterial, 'bathroom', true)
  box(furniture, [1.03, 0.12, 0.6], [4.1, 0.98, -0.61], ceramicMaterial, 'bathroom', true)
  box(furniture, [0.58, 0.035, 0.35], [4.1, 1.05, -0.61], material('#bac9c1'), 'bathroom', true)
  box(furniture, [0.44, 0.46, 0.65], [3.56, 0.25, -1.58], ceramicMaterial, 'bathroom', true)
  box(furniture, [0.44, 0.3, 0.17], [3.56, 0.58, -1.83], ceramicMaterial, 'bathroom', true)

  // Entry storage and the symbolic distribution panel.
  box(furniture, [0.45, 0.8, 1.5], [4.68, 0.43, 0.9], paleWoodMaterial, 'entry', true)
  box(furniture, [0.95, 0.04, 0.7], [4.1, 0.04, 2.85], material('#aeb69f'), 'entry', true)
  box(furniture, [0.12, 0.45, 0.36], [4.88, 1.72, 2.7], material('#e2e6e0'), 'entry', true)

  // Each segment is a visible tube, with a larger transparent hit target for touch.
  for (const route of routes) {
    const points = route.points.map((point) => new THREE.Vector3(...point))
    const path = new THREE.CurvePath<THREE.Vector3>()
    for (let index = 1; index < points.length; index++) path.add(new THREE.LineCurve3(points[index - 1], points[index]))
    const group = new THREE.Group()
    const tubeMaterial = new THREE.MeshStandardMaterial({ color: layerColors[route.layer], emissive: layerColors[route.layer], emissiveIntensity: 0.12, roughness: 0.5, transparent: true })
    const tube = new THREE.Mesh(new THREE.TubeGeometry(path, Math.max(40, points.length * 12), 0.035, 8, false), tubeMaterial)
    tube.userData.routeId = route.id
    group.add(tube)
    for (const point of points) {
      const joint = new THREE.Mesh(new THREE.SphereGeometry(0.039, 10, 8), tubeMaterial)
      joint.position.copy(point)
      group.add(joint)
    }
    const hit = new THREE.Mesh(new THREE.TubeGeometry(path, Math.max(40, points.length * 12), 0.095, 6, false), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }))
    hit.userData.routeId = route.id
    group.add(hit)
    for (const point of [points[0], points[points.length - 1]]) {
      const endpoint = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), tubeMaterial)
      endpoint.position.copy(point)
      group.add(endpoint)
    }
    layerGroups[route.layer].add(group)
    routeMeshes.set(route.id, { group, tube, hit, route })
  }

  function updateSelection() {
    for (const [id, highlight] of highlights) highlight.visible = id === selectedRoom
    for (const [id, label] of labelSprites) label.material.opacity = selectedRoom && id !== selectedRoom ? 0.55 : 1
    for (const [id, { group, tube, route }] of routeMeshes) {
      group.visible = allowedRoutes.has(id)
      const mat = tube.material as THREE.MeshStandardMaterial
      const isSelected = id === selectedRoute
      const isRelated = !selectedRoom || route.roomId === selectedRoom
      mat.opacity = selectedRoute ? (isSelected ? 1 : 0.15) : (isRelated ? 1 : 0.23)
      mat.emissiveIntensity = isSelected ? 0.65 : 0.12
      mat.depthTest = !isSelected
      for (const child of group.children) child.renderOrder = isSelected ? 10 : 0
      mat.color.set(isSelected ? '#285d49' : layerColors[route.layer])
    }
    invalidate()
  }

  function selectRoom(id: string | null) {
    selectedRoom = rooms.some((room) => room.id === id) ? id : null
    selectedRoute = null
    updateSelection()
  }
  function selectRoute(id: string | null) {
    const candidate = id ? routeMeshes.get(id) : undefined
    selectedRoute = candidate && allowedRoutes.has(id!) && layerGroups[candidate.route.layer].visible ? id : null
    if (selectedRoute) selectedRoom = routeMeshes.get(selectedRoute)!.route.roomId
    updateSelection()
  }
  function clearHiddenSelection() {
    if (!selectedRoute) return
    const route = routeMeshes.get(selectedRoute)!.route
    if (allowedRoutes.has(selectedRoute) && layerGroups[route.layer].visible) return
    selectedRoute = null
    // Keep the room context, but let the host clear its stale route details.
    updateSelection()
    options.onRouteSelect(null)
  }
  function setVisibleRoutes(ids: string[]) {
    allowedRoutes = new Set(ids.filter((id) => routeMeshes.has(id)))
    clearHiddenSelection()
    updateSelection()
  }
  function setWallMode(mode: 'cutaway' | 'full' | 'hidden') {
    wallMode = mode
    walls.visible = mode !== 'hidden'
    for (const wall of walls.children) {
      const height = mode === 'full' ? 2.5 : 0.5
      wall.scale.y = height / 2.5
      wall.position.y = height / 2
    }
    fitCamera()
  }

  function fitCamera() {
    const width = Math.max(container.clientWidth, 1)
    const height = Math.max(container.clientHeight, 1)
    const aspect = width / height
    camera.updateMatrixWorld()
    let halfWidth = 0
    let halfHeight = 0
    const maxHeight = wallMode === 'full' ? 2.5 : 2.2
    for (const x of [-5.4, 5.4]) for (const y of [-0.3, maxHeight]) for (const z of [-3.7, 3.7]) {
      const point = new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse)
      halfWidth = Math.max(halfWidth, Math.abs(point.x))
      halfHeight = Math.max(halfHeight, Math.abs(point.y))
    }
    const vertical = Math.max(halfHeight, halfWidth / aspect) * 1.08
    camera.left = -vertical * aspect
    camera.right = vertical * aspect
    camera.top = vertical
    camera.bottom = -vertical
    camera.updateProjectionMatrix()
    renderer.setSize(width, height)
    invalidate()
  }
  function setView(view: 'iso' | 'top') {
    controls.target.set(0, 0.35, 0)
    camera.zoom = 1
    camera.position.set(...(view === 'top' ? [0, 20, 0.001] : [11, 12, 14]) as [number, number, number])
    camera.lookAt(controls.target)
    controls.update()
    fitCamera()
  }

  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  let press: { x: number; y: number; id: number; moved: boolean } | null = null
  const activePointers = new Set<number>()
  function onPointerDown(event: PointerEvent) {
    activePointers.add(event.pointerId)
    if (activePointers.size > 1 && press) press.moved = true
    if (activePointers.size === 1) press = { x: event.clientX, y: event.clientY, id: event.pointerId, moved: false }
  }
  function onPointerMove(event: PointerEvent) {
    if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 5) press.moved = true
  }
  function onPointerUp(event: PointerEvent) {
    activePointers.delete(event.pointerId)
    if (!press || press.id !== event.pointerId) return
    const click = !press.moved && event.button === 0
    press = null
    if (!click) return
    const bounds = renderer.domElement.getBoundingClientRect()
    pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1)
    raycaster.setFromCamera(pointer, camera)
    const visibleRoutes = [...routeMeshes.values()].filter(({ group, route }) => group.visible && layerGroups[route.layer].visible)
    const routeHit = raycaster.intersectObjects(visibleRoutes.map(({ hit }) => hit), false)[0]
    if (routeHit) {
      const id = routeHit.object.userData.routeId as string
      selectRoute(id)
      options.onRouteSelect(id)
      return
    }
    const roomHit = raycaster.intersectObjects(roomTargets, false)[0]
    const roomId = roomHit?.object.userData.roomId as string | undefined
    selectRoom(roomId ?? null)
    options.onRoomSelect(roomId ?? null)
  }
  function onPointerCancel(event: PointerEvent) {
    activePointers.delete(event.pointerId)
    press = null
  }
  renderer.domElement.addEventListener('pointerdown', onPointerDown)
  renderer.domElement.addEventListener('pointermove', onPointerMove)
  renderer.domElement.addEventListener('pointerup', onPointerUp)
  renderer.domElement.addEventListener('pointercancel', onPointerCancel)
  const observer = new ResizeObserver(fitCamera)
  observer.observe(container)
  setWallMode('cutaway')
  setView('iso')

  return {
    selectRoom,
    selectRoute,
    setVisibleRoutes,
    setLayer(layer, visible) {
      layerGroups[layer].visible = visible
      clearHiddenSelection()
      updateSelection()
    },
    setWallMode,
    setView,
    dispose() {
      disposed = true
      cancelAnimationFrame(renderFrame)
      observer.disconnect()
      controls.removeEventListener('change', invalidate)
      controls.dispose()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      renderer.domElement.removeEventListener('pointercancel', onPointerCancel)
      const geometries = new Set<THREE.BufferGeometry>()
      const materials = new Set<THREE.Material>()
      const textures = new Set<THREE.Texture>()
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) geometries.add(object.geometry)
        if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
          const values = Array.isArray(object.material) ? object.material : [object.material]
          for (const mat of values) {
            materials.add(mat)
            for (const value of Object.values(mat)) if (value instanceof THREE.Texture) textures.add(value)
          }
        }
      })
      geometries.forEach((geometry) => geometry.dispose())
      textures.forEach((texture) => texture.dispose())
      materials.forEach((mat) => mat.dispose())
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { createHomeArchitecture } from './home-architecture'
import { engineeringLayers, type EngineeringLayerId } from './engineering-data'

type Vec = [number, number, number]
type Options = {
  onSelect: (id: EngineeringLayerId) => void
  onLabels: (labels: { id: EngineeringLayerId; x: number; y: number; visible: boolean }[]) => void
}
export type EngineeringView = {
  setExpansion(value: number): void
  select(id: EngineeringLayerId | null, isolated: boolean): void
  rotate(angle: number): void
  zoom(factor: number): void
  reset(): void
  dispose(): void
}

export function createEngineeringView(host: HTMLElement, options: Options): EngineeringView {
  // Retain the frame for compositing while scrolling a stationary layer.
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'default' })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.shadowMap.autoUpdate = false
  renderer.domElement.setAttribute('aria-label', '同一户型的六层工程爆炸模型')
  renderer.domElement.style.touchAction = 'none'
  host.append(renderer.domElement)
  host.dataset.renderer = 'webgl'
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-15, 15, 15, -15, 0.1, 150)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = false
  controls.enablePan = false
  controls.minZoom = 0.65
  controls.maxZoom = 2.8
  controls.minPolarAngle = 0.3
  controls.maxPolarAngle = 1.4
  controls.rotateSpeed = 0.65
  controls.zoomSpeed = 0.65
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const architecture = createHomeArchitecture()
  const root = new THREE.Group()
  scene.add(root)
  const groups = engineeringLayers.map((layer, index) => {
    const group = new THREE.Group()
    group.name = layer.id
    group.userData.layerId = layer.id
    root.add(group)
    return { group, index, id: layer.id }
  })
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1)
  geometries.add(boxGeometry)
  function material(color: string, roughness = 0.8, metalness = 0) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness })
    materials.add(mat)
    return mat
  }
  const concrete = material('#bcb7aa')
  const board = material('#f1eadd')
  const edge = material('#d4c5af')
  const steel = material('#9da9ac', 0.35, 0.55)
  const wood = material('#bea782')
  const waterproof = material('#8cbdcc', 0.5)
  const glow = new THREE.MeshStandardMaterial({ color: '#ffdf9e', emissive: '#ffcb75', emissiveIntensity: 0.7 })
  materials.add(glow)
  function box(parent: THREE.Object3D, size: Vec, position: Vec, mat: THREE.Material) {
    const mesh = new THREE.Mesh(boxGeometry, mat)
    mesh.scale.set(...size)
    mesh.position.set(...position)
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }
  function slab(parent: THREE.Object3D, mat = board) {
    box(parent, [12.4, 0.18, 9.4], [0, -0.14, 0], mat)
    box(parent, [12.42, 0.045, 0.04], [0, -0.045, 4.71], edge)
  }
  function pipe(parent: THREE.Object3D, points: Vec[], color: string, radius = 0.055) {
    const path = new THREE.CurvePath<THREE.Vector3>()
    for (let i = 1; i < points.length; i++) path.add(new THREE.LineCurve3(new THREE.Vector3(...points[i - 1]), new THREE.Vector3(...points[i])))
    const geometry = new THREE.TubeGeometry(path, Math.max(24, points.length * 12), radius, 8, false)
    geometries.add(geometry)
    const mesh = new THREE.Mesh(geometry, material(color, 0.45, 0.12))
    mesh.castShadow = true
    parent.add(mesh)
    return mesh
  }
  function clonePart(name: string, parent: THREE.Object3D, surface?: THREE.Material, height = 1) {
    const source = architecture.parts.find(part => part.group.name === name)
    if (!source) return
    const clone = source.group.clone(true)
    clone.scale.y = height
    if (surface) clone.traverse(object => { if (object instanceof THREE.Mesh) object.material = surface })
    parent.add(clone)
  }
  function lowOutline(parent: THREE.Object3D) {
    box(parent, [12, 0.35, 0.12], [0, 0.175, -4.5], board)
    box(parent, [0.12, 0.35, 9], [-6, 0.175, 0], board)
    box(parent, [0.12, 0.35, 9], [6, 0.175, 0], board)
  }

  // 01 — identical wall/opening positions, shown as a lower concrete shell.
  slab(groups[0].group, concrete)
  architecture.parts.filter(part => part.phase === 'walls').forEach(part => clonePart(part.group.name, groups[0].group, concrete, 0.45))
  // 02 — schematic utilities in the kitchen, bathroom and living zone.
  const services = groups[1].group
  slab(services)
  lowOutline(services)
  pipe(services, [[5.4,0.95,3.9],[5.4,0.12,3.9],[-5.6,0.12,3.9],[-5.6,0.12,0.3],[-5.6,0.85,0.3]], '#ca6659')
  pipe(services, [[5.4,0.12,3.9],[3.7,0.12,3.9],[3.7,0.12,-3.9],[4.8,0.12,-3.9],[4.8,0.75,-3.9]], '#ca6659')
  pipe(services, [[5.15,0.12,3.65],[-4,0.12,3.65],[-4,0.12,1.4],[-4,0.75,1.4]], '#d2ac55', 0.045)
  pipe(services, [[5.65,0.1,4.2],[5.65,0.1,-4.1],[1.8,0.1,-4.1],[1.8,0.85,-4.1]], '#529bc0', 0.065)
  pipe(services, [[5.45,0.1,4.2],[5.45,0.1,-3.9],[2.05,0.1,-3.9],[2.05,0.85,-3.9]], '#d68d66', 0.06)
  pipe(services, [[1.8,0.1,-4.1],[-3.9,0.1,-4.1],[-3.9,0.9,-4.1]], '#529bc0', 0.065)
  pipe(services, [[2.05,0.1,-3.9],[-3.65,0.1,-3.9],[-3.65,0.9,-3.9]], '#d68d66', 0.06)
  pipe(services, [[1.35,0.35,-2],[1.35,0.18,-0.8],[5.7,0.18,-0.8],[5.7,0.18,4.3]], '#d0d5d4', 0.11)
  box(services, [0.38,0.55,0.12], [5.4,1.02,3.9], material('#d7ab86'))
  for (const [x,z] of [[-5.6,0.3],[4.8,-3.9],[-4,1.4]]) box(services,[0.22,0.22,0.1],[x,0.85,z],board)
  // 03 — finished floor surfaces plus legible wet-area upturns.
  slab(groups[2].group)
  clonePart('timber-floor', groups[2].group)
  clonePart('bathroom-tile', groups[2].group)
  box(groups[2].group,[2.45,0.045,3.25],[1.95,0.04,-2.8],waterproof)
  box(groups[2].group,[2.45,0.62,0.055],[1.95,0.35,-4.38],waterproof)
  box(groups[2].group,[0.055,0.62,3.25],[0.75,0.35,-2.8],waterproof)
  box(groups[2].group,[5.8,0.045,1.35],[-2.9,0.04,-3.7],waterproof)
  for (let x = 0.75; x < 3.2; x += 0.61) box(groups[2].group,[0.015,0.01,3.22],[x,0.07,-2.8],board)
  for (let z = -4.38; z < -1.1; z += 0.65) box(groups[2].group,[2.4,0.01,0.015],[1.95,0.07,z],board)
  // 04 — partially uncovered ceiling lets the frame remain visible.
  const ceiling = groups[3].group
  slab(ceiling)
  for (let x = -5.7; x <= 5.8; x += 0.85) box(ceiling,[0.065,0.14,8.6],[x,0.18,0],steel)
  for (let z = -4.25; z <= 4.3; z += 1.1) box(ceiling,[11.6,0.12,0.065],[0,0.17,z],steel)
  box(ceiling,[6.05,0.12,2.9],[-2.85,0.32,-2.8],board)
  box(ceiling,[3.8,0.12,4.9],[3.75,0.32,1.8],board)
  box(ceiling,[6.05,0.05,0.06],[-2.85,0.27,-1.31],glow)
  box(ceiling,[0.06,0.05,4.9],[1.82,0.27,1.8],glow)
  for (const x of [-5.4,-3.3,-1.2]) box(ceiling,[0.2,0.045,0.2],[x,0.405,-2.8],glow)
  for (let x = -5.7; x < -2; x += 0.3) box(ceiling,[0.1,0.2,1.45],[x,0.3,3.3],wood)
  // 05 — actual fitted components from the same source house.
  slab(groups[4].group)
  lowOutline(groups[4].group)
  for (const name of ['kitchen-cabinets','kitchen-tall-cabinet','kitchen-island','bedroom-wardrobe','bathroom-vanity','entry-console']) clonePart(name, groups[4].group)
  architecture.parts.filter(part => part.phase === 'windows').forEach(part => clonePart(part.group.name, groups[4].group))
  // 06 — the complete original home is the finished living layer.
  groups[5].group.add(architecture.root)

  const materialStates = groups.map(({ group }) => {
    const clones = new Map<THREE.Material, THREE.Material>()
    group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return
      function unique(source: THREE.Material) {
        if (!clones.has(source)) { const clone = source.clone(); clones.set(source, clone); materials.add(clone) }
        return clones.get(source)!
      }
      object.material = Array.isArray(object.material) ? object.material.map(unique) : unique(object.material)
    })
    return [...clones].map(([original, clone]) => ({ material: clone, opacity: original.opacity, transparent: original.transparent, depthWrite: original.depthWrite }))
  })
  let environmentTarget: THREE.WebGLRenderTarget | undefined
  function prepareEnvironment() {
    const environment = new RoomEnvironment()
    const pmrem = new THREE.PMREMGenerator(renderer)
    const next = pmrem.fromScene(environment, 0.035, 0.1, 100, { size: 128 })
    environmentTarget?.dispose()
    environmentTarget = next
    scene.environment = next.texture
    scene.environmentIntensity = 0.45
    environment.traverse(object => { if (object instanceof THREE.InstancedMesh) object.dispose() })
    environment.dispose()
    pmrem.dispose()
  }
  prepareEnvironment()
  scene.add(new THREE.HemisphereLight('#f7f4ff', '#d5c5a9', 1.3))
  const sun = new THREE.DirectionalLight('#fff1d9', 2.4)
  sun.position.set(-14, 34, 16)
  sun.target.position.set(0, 8, 0)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  Object.assign(sun.shadow.camera,{left:-18,right:18,top:24,bottom:-20,near:1,far:100})
  sun.shadow.normalBias = 0.04
  scene.add(sun, sun.target)
  const fill = new THREE.DirectionalLight('#d9e7ff', 0.8)
  fill.position.set(12, 15, -10)
  scene.add(fill)

  const motion = matchMedia('(prefers-reduced-motion: reduce)')
  let expansion = motion.matches ? 1 : 0
  let targetExpansion = 1
  let selected: EngineeringLayerId | null = null
  let isolated = false
  let disposed = false
  let visible = true
  let lost = false
  let frame = 0
  let timestamp = 0
  let lastDraw = 0
  let shadowsDirty = true
  const bounds = new THREE.Box3()
  const projected = new THREE.Box3()
  const center = new THREE.Vector3()
  const events = new AbortController()
  const labelAnchor = new THREE.Vector3()
  camera.position.set(22, 15, 30)
  controls.target.set(0, 0, 0)
  camera.lookAt(controls.target)

  function fit() {
    bounds.makeEmpty()
    groups.forEach(({group,id}) => { if (group.visible && (!isolated || id === selected)) bounds.union(new THREE.Box3().setFromObject(group)) })
    if (bounds.isEmpty()) return
    bounds.getCenter(center)
    camera.position.add(center.clone().sub(controls.target))
    controls.target.copy(center)
    camera.lookAt(center)
    camera.updateMatrixWorld(true)
    projected.makeEmpty()
    for (const x of [bounds.min.x,bounds.max.x]) for (const y of [bounds.min.y,bounds.max.y]) for (const z of [bounds.min.z,bounds.max.z]) projected.expandByPoint(new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse))
    const aspect = Math.max(1,host.clientWidth) / Math.max(1,host.clientHeight)
    const height = Math.max((projected.max.y-projected.min.y)*1.12,(projected.max.x-projected.min.x)*1.16/aspect)
    camera.left = -height*aspect/2
    camera.right = height*aspect/2
    camera.top = height/2
    camera.bottom = -height/2
    camera.updateProjectionMatrix()
  }
  function render(time = 0) {
    frame = 0
    if (disposed || lost || !visible || document.hidden) { timestamp = 0; return }
    if (time && time-lastDraw<1000/30-0.5) { frame=requestAnimationFrame(render); return }
    lastDraw=time
    const delta = timestamp ? Math.min((time-timestamp)/1000,0.06) : 1/30
    timestamp = time
    expansion = motion.matches ? targetExpansion : expansion + (targetExpansion-expansion)*(1-Math.exp(-delta*4.8))
    if (Math.abs(targetExpansion-expansion)<0.001) expansion=targetExpansion
    groups.forEach(({group,index,id}) => {
      group.position.y = (index-5)*3.5*expansion
      group.visible = isolated ? id===selected : index===5 || expansion>0.015
      const fade = index===5 ? 1 : Math.min(1,expansion*4)
      const opacity = fade*(selected && id!==selected && !isolated ? 0.2 : 1)
      materialStates[index].forEach(state => {
        state.material.opacity = state.opacity*opacity
        const transparent = state.transparent || opacity<0.995
        if (state.material.transparent !== transparent) { state.material.transparent=transparent; state.material.needsUpdate=true }
        state.material.depthWrite = opacity<0.995 ? false : state.depthWrite
      })
    })
    fit()
    renderer.shadowMap.needsUpdate = shadowsDirty || expansion!==targetExpansion
    renderer.render(scene,camera)
    shadowsDirty=false
    host.dataset.expansion = expansion.toFixed(3)
    host.dataset.isolated = String(isolated)
    options.onLabels(groups.map(({group,id,index}) => {
      labelAnchor.set(6.4,group.position.y+0.2,4.7).project(camera)
      return { id, x:(labelAnchor.x+1)*host.clientWidth/2, y:(1-labelAnchor.y)*host.clientHeight/2, visible:group.visible && (expansion>0.25 || index===5) }
    }))
    frame=requestAnimationFrame(render)
  }
  function invalidate() { if (!disposed && !frame) frame=requestAnimationFrame(render) }
  function resize() { if (!disposed && !lost) { renderer.setSize(Math.max(1,host.clientWidth),Math.max(1,host.clientHeight)); invalidate() } }
  controls.addEventListener('change',invalidate)
  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(host)
  const intersection = new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;if(visible)invalidate()})
  intersection.observe(host)
  document.addEventListener('visibilitychange',invalidate,{signal:events.signal})
  motion.addEventListener('change',invalidate,{signal:events.signal})
  const raycaster = new THREE.Raycaster()
  let pointerStart: {x:number;y:number} | undefined
  renderer.domElement.addEventListener('pointerdown',event=>{pointerStart={x:event.clientX,y:event.clientY}},{signal:events.signal})
  renderer.domElement.addEventListener('pointerup',event=>{
    if (!pointerStart || Math.hypot(pointerStart.x-event.clientX,pointerStart.y-event.clientY)>5) return
    pointerStart=undefined
    const rect=renderer.domElement.getBoundingClientRect()
    raycaster.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera)
    const hit=raycaster.intersectObjects(groups.filter(({group})=>group.visible).map(({group})=>group),true)[0]
    let object: THREE.Object3D | null = hit?.object || null
    while(object && !object.userData.layerId) object=object.parent
    if(object?.userData.layerId) options.onSelect(object.userData.layerId)
  },{signal:events.signal})
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;host.dataset.renderer='recovering'},{signal:events.signal})
  renderer.domElement.addEventListener('webglcontextrestored',()=>{lost=false;host.dataset.renderer='webgl';prepareEnvironment();resize()},{signal:events.signal})
  resize()
  return {
    setExpansion(value) { targetExpansion=Math.max(0,Math.min(1,value)); invalidate() },
    select(id,alone) { selected=id; isolated=!!id&&alone; camera.zoom=1;shadowsDirty=true;invalidate() },
    rotate(angle) {
      const offset=camera.position.clone().sub(controls.target)
      offset.applyAxisAngle(new THREE.Vector3(0,1,0),angle)
      camera.position.copy(controls.target).add(offset)
      controls.update();invalidate()
    },
    zoom(factor) { camera.zoom=THREE.MathUtils.clamp(camera.zoom*factor,0.65,2.8);invalidate() },
    reset() { camera.position.copy(controls.target).add(new THREE.Vector3(22,15,30));camera.zoom=1;controls.update();invalidate() },
    dispose() {
      disposed=true;cancelAnimationFrame(frame);events.abort();resizeObserver.disconnect();intersection.disconnect();controls.dispose()
      groups.slice(0,5).forEach(({group})=>group.traverse(object=>{if(object instanceof THREE.InstancedMesh)object.dispose()}))
      architecture.dispose();geometries.forEach(geometry=>geometry.dispose());materials.forEach(mat=>mat.dispose());environmentTarget?.dispose();sun.shadow.map?.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove()
    },
  }
}

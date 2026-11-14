import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { createHomeArchitecture } from './home-architecture'
import { createHomeLightRoutes } from './home-light-routes'

export const HOME_BUILD_SECONDS = 7

export type HomeBuildStatus = {
  complete: boolean
  available: boolean
}

export type HomeBuilder = {
  enterPlanning(onProgress: (progress: number) => void): Promise<HomePlanningFrame | boolean>
  setStructure(value: boolean): void
  setVisible(value: boolean): void
  setReducedMotion(value: boolean): void
  dispose(): void
}

export type HomePlanningFrame = {
  canvas: HTMLCanvasElement
  bounds: { left: number; top: number; width: number; height: number }
}

const clamp = (value: number) => Math.max(0, Math.min(1, value))
// Zero velocity and acceleration at both ends keep adjacent construction stages connected.
const ease = (value: number) => {
  const t = clamp(value)
  return t * t * t * (t * (t * 6 - 15) + 10)
}
const phases = {
  floor: { start: 0, spread: 0.12, duration: 0.65 },
  walls: { start: 0.35, spread: 0.18, duration: 1.05 },
  windows: { start: 1.1, spread: 0.2, duration: 1.4 },
  furniture: { start: 2, spread: 1, duration: 3.2 },
  details: { start: 3.8, spread: 0.5, duration: 2.5 },
}
const cameraSweep = { yaw: 0.9, pitch: 0.32, idleYaw: 0.2, idlePitch: 0.06 }

export function createHomeBuilder(
  host: HTMLElement,
  onUpdate: (state: HomeBuildStatus) => void,
  reducedMotion = false,
): HomeBuilder {
  // Renderer creation can fail independently of the rest of the planning application.
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: 'default',
  })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.shadowMap.autoUpdate = false
  renderer.localClippingEnabled = true
  const canvas = renderer.domElement
  canvas.setAttribute('role', 'img')
  canvas.setAttribute(
    'aria-label',
    '住宅三维搭建演示，地面、墙体、门窗和家具逐步升起，最后发光走线沿空间展开',
  )
  host.append(canvas)
  host.dataset.renderer = 'webgl'

  const scene = new THREE.Scene()
  let environmentMap: THREE.WebGLRenderTarget | undefined
  function prepareEnvironment() {
    const room = new RoomEnvironment()
    const generator = new THREE.PMREMGenerator(renderer)
    try {
      const next = generator.fromScene(room, 0.035, 0.1, 100, { size: 128 })
      environmentMap?.dispose()
      environmentMap = next
      scene.environment = next.texture
      scene.environmentIntensity = 0.55
      scene.environmentRotation.set(0, 0.4, 0)
    } finally {
      room.traverse(object => {
        if (object instanceof THREE.InstancedMesh) object.dispose()
      })
      room.dispose()
      generator.dispose()
    }
  }
  prepareEnvironment()
  const architecture = createHomeArchitecture()
  scene.add(architecture.root)
  const lightRoutes = createHomeLightRoutes()
  scene.add(lightRoutes.root)
  scene.add(new THREE.HemisphereLight('#edf4ff', '#d9c5a5', 0.85))
  const sun = new THREE.DirectionalLight('#fff0d7', 2.35)
  sun.position.set(-8, 16, 10)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 45 })
  sun.shadow.normalBias = 0.035
  sun.shadow.bias = -0.0002
  sun.shadow.radius = 4
  scene.add(sun)
  const fill = new THREE.DirectionalLight('#cceaff', 0.75)
  fill.position.set(8, 8, -10)
  scene.add(fill)
  const rim = new THREE.DirectionalLight('#dfc5f4', 0.68)
  rim.position.set(-7, 7, -10)
  scene.add(rim)

  const groundGeometry = new THREE.PlaneGeometry(200, 200)
  const groundMaterial = new THREE.ShadowMaterial({ color: '#998aa7', opacity: 0.14 })
  const ground = new THREE.Mesh(groundGeometry, groundMaterial)
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.4
  ground.receiveShadow = true
  scene.add(ground)

  architecture.root.updateMatrixWorld(true)
  const modelBounds = new THREE.Box3().setFromObject(architecture.root)
  const partBounds = architecture.parts.map((part) => new THREE.Box3().setFromObject(part.group))
  const basePositions = architecture.parts.map((part) => part.group.position.y)
  const orders = Object.fromEntries(
    Object.keys(phases).map((phase) => [
      phase,
      Math.max(
        1,
        ...architecture.parts.filter((part) => part.phase === phase).map((part) => part.order),
      ),
    ]),
  )

  // Furniture rises as rigid pieces through the floor. Clipping hides its submerged portion.
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.012)
  const clippedMaterials = new Map<THREE.Material, THREE.Material>()
  for (const part of architecture.parts) {
    if (part.phase !== 'furniture' && part.phase !== 'details') continue
    part.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      const clip = (material: THREE.Material) => {
        if (!clippedMaterials.has(material)) {
          const copy = material.clone()
          copy.clippingPlanes = [floorPlane]
          copy.clipShadows = true
          clippedMaterials.set(material, copy)
        }
        return clippedMaterials.get(material)!
      }
      object.material = Array.isArray(object.material)
        ? object.material.map(clip)
        : clip(object.material)
    })
  }

  const planPoints: THREE.Vector3[] = []
  architecture.parts.forEach((part, index) => {
    if (part.phase !== 'walls') return
    const box = partBounds[index]
    const corners = [
      new THREE.Vector3(box.min.x, 0.014, box.min.z),
      new THREE.Vector3(box.max.x, 0.014, box.min.z),
      new THREE.Vector3(box.max.x, 0.014, box.max.z),
      new THREE.Vector3(box.min.x, 0.014, box.max.z),
    ]
    corners.forEach((corner, i) => planPoints.push(corner, corners[(i + 1) % 4]))
  })
  const planGeometry = new THREE.BufferGeometry().setFromPoints(planPoints)
  const planMaterial = new THREE.LineBasicMaterial({
    color: '#66838a',
    transparent: true,
    opacity: 0.45,
  })
  const plan = new THREE.LineSegments(planGeometry, planMaterial)
  scene.add(plan)

  const camera = new THREE.OrthographicCamera(-10, 10, 7, -7, 0.1, 100)
  const target = new THREE.Vector3(0, 0.55, 0)
  const cameraPosition = new THREE.Vector3(15, 16, 20)
  const cameraOrbit = new THREE.Spherical().setFromVector3(cameraPosition.clone().sub(target))
  const restingYaw = cameraOrbit.theta
  const restingPitch = cameraOrbit.phi
  const projected = new THREE.Box3()
  // Fit the whole wider camera arc once, including intermediate silhouettes.
  for (let sample = 0; sample <= 12; sample++) {
    const yaw = restingYaw - cameraSweep.yaw + (cameraSweep.yaw + cameraSweep.idleYaw) * sample / 12
    for (const pitch of [restingPitch - cameraSweep.pitch, restingPitch - 0.16, restingPitch - cameraSweep.idlePitch, restingPitch + cameraSweep.idlePitch]) {
      cameraOrbit.theta = yaw
      cameraOrbit.phi = pitch
      camera.position.setFromSpherical(cameraOrbit).add(target)
      camera.lookAt(target)
      camera.updateMatrixWorld(true)
      for (const x of [modelBounds.min.x, modelBounds.max.x]) {
        for (const y of [modelBounds.min.y, modelBounds.max.y]) {
          for (const z of [modelBounds.min.z, modelBounds.max.z]) {
            projected.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse))
          }
        }
      }
    }
  }
  const fitWidth = Math.max(Math.abs(projected.min.x), Math.abs(projected.max.x)) * 2.1
  const fitHeight = Math.max(Math.abs(projected.min.y), Math.abs(projected.max.y)) * 2.1

  const events = new AbortController()
  const { signal } = events
  let disposed = false
  let active = true
  let contextLost = false
  let reduced = reducedMotion
  let seconds = reduced ? HOME_BUILD_SECONDS : 0
  let orbitSeconds = 0
  let frame = 0
  let lastTimestamp = 0
  let lastDrawTimestamp = 0
  let accumulatedDelta = 0
  let lastReport = -1
  let structure = 0
  let structureTarget = 0
  let shadowSeconds = -1
  let shadowStructure = -1
  let shadowDirty = true
  let flight: {
    elapsed: number
    camera: THREE.OrthographicCamera
    fromPosition: THREE.Vector3
    fromQuaternion: THREE.Quaternion
    fromZoom: number
    startSeconds: number
    startStructure: number
    bounds: [number, number, number, number]
    viewport: [number, number]
    onProgress: (progress: number) => void
    resolve: (completed: HomePlanningFrame | boolean) => void
  } | undefined
  const overheadTarget = new THREE.Vector3(0, 0.5, 0)
  const flightEndPosition = new THREE.Vector3()
  const flightEndQuaternion = new THREE.Quaternion()
  const flightUp = new THREE.Vector3(0, 0, -1)

  function finishFlight(completed: boolean) {
    const current = flight
    flight = undefined
    if (!current) return
    if (completed && !contextLost && current.elapsed >= 1.8) {
      // Copy this rendered frame before the home scene is disposed. It remains
      // visible across the route change and lands on the actual SVG paper.
      const points = [-6.2, 6.2].flatMap(x => [-4.7, 4.7].map(z => new THREE.Vector3(x, -0.34, z).project(current.camera)))
      const left = (Math.min(...points.map(p => p.x)) + 1) * innerWidth / 2
      const right = (Math.max(...points.map(p => p.x)) + 1) * innerWidth / 2
      const top = (1 - Math.max(...points.map(p => p.y))) * innerHeight / 2
      const bottom = (1 - Math.min(...points.map(p => p.y))) * innerHeight / 2
      const copy = document.createElement('canvas')
      const ratio = renderer.getPixelRatio()
      copy.width = Math.ceil((right - left) * ratio)
      copy.height = Math.ceil((bottom - top) * ratio)
      const context = copy.getContext('2d')
      if (context) {
        context.drawImage(canvas, left * ratio, top * ratio, (right - left) * ratio, (bottom - top) * ratio, 0, 0, copy.width, copy.height)
        current.resolve({ canvas: copy, bounds: { left, top, width: right - left, height: bottom - top } })
        return
      }
    }
    current.resolve(completed)
  }

  function report(force = false) {
    const tick = Math.floor(seconds * 10)
    if (!force && tick === lastReport) return
    lastReport = tick
    host.dataset.buildSeconds = seconds.toFixed(2)
    host.dataset.buildState = seconds >= HOME_BUILD_SECONDS ? 'complete' : 'building'
    onUpdate({ complete: seconds >= HOME_BUILD_SECONDS, available: !contextLost })
  }

  function draw() {
    if (flight) {
      // A quick settle keeps early clicks and the structure-only view usable.
      const settle = ease(flight.elapsed / 0.42)
      seconds = flight.startSeconds + (HOME_BUILD_SECONDS - flight.startSeconds) * settle
      structure = flight.startStructure * (1 - settle)
    }
    architecture.parts.forEach((part, index) => {
      const timing = phases[part.phase]
      const progress = ease(
        (seconds - timing.start - (part.order / orders[part.phase]) * timing.spread) /
          timing.duration,
      )
      let amount = progress
      if (part.phase === 'furniture' || part.phase === 'details') amount *= 1 - structure
      part.group.visible = amount > 0.0001
      if (part.phase === 'furniture' || part.phase === 'details') {
        part.group.position.y =
          basePositions[index] - Math.max(0.1, partBounds[index].max.y + 0.02) * (1 - amount)
      } else {
        part.group.scale.y = Math.max(0.0001, amount)
      }
    })
    planMaterial.opacity = 0.42 * (1 - ease((seconds - 0.3) / 1.5))
    plan.visible = planMaterial.opacity > 0.001
    lightRoutes.update(seconds, reduced ? HOME_BUILD_SECONDS : orbitSeconds)
    // Sweep decisively while the shell rises, then decelerate as furnishings settle.
    const entry = reduced ? 1 : 1 - Math.pow(1 - clamp(seconds / HOME_BUILD_SECONDS), 3)
    const idleSeconds = Math.max(0, orbitSeconds - HOME_BUILD_SECONDS)
    const ambient = reduced ? 0 : ease(idleSeconds / 4)
    cameraOrbit.theta = restingYaw - cameraSweep.yaw * (1 - entry) + Math.sin(idleSeconds / 18) * cameraSweep.idleYaw * ambient
    cameraOrbit.phi = restingPitch - cameraSweep.pitch * (1 - entry) + Math.sin(idleSeconds / 14) * cameraSweep.idlePitch * ambient
    camera.position.setFromSpherical(cameraOrbit).add(target)
    camera.lookAt(target)
    // Recover the established final house size after fitting the much wider arc.
    camera.zoom = 1.12 + 0.15 * entry + Math.sin(orbitSeconds / 13) * 0.008 * ambient
    camera.updateProjectionMatrix()
    fill.intensity = 0.75 + Math.sin(orbitSeconds / 12) * 0.12 * ambient
    rim.intensity = 0.68 + Math.sin(orbitSeconds / 16) * 0.12 * ambient
    rim.position.x = -7 + Math.sin(orbitSeconds / 19) * 1.3 * ambient
    // The fixed key light needs a new shadow map only when construction or a layer changes.
    renderer.shadowMap.needsUpdate = shadowDirty || shadowSeconds !== seconds || shadowStructure !== structure
    if (flight) {
      const t = clamp(flight.elapsed / 1.8)
      const move = ease(clamp((t - 0.04) / 0.88))
      flightEndPosition.copy(overheadTarget).add(new THREE.Vector3(0, 30, 0.001))
      flightEndQuaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(flightEndPosition, overheadTarget, flightUp))
      const view = flight.camera
      view.position.lerpVectors(flight.fromPosition, flightEndPosition, move)
      view.quaternion.slerpQuaternions(flight.fromQuaternion, flightEndQuaternion, move)
      const [left, right, top, bottom] = flight.bounds
      const width = right - left, height = top - bottom
      view.left = THREE.MathUtils.lerp(left, -width / 2, move)
      view.right = THREE.MathUtils.lerp(right, width / 2, move)
      view.top = THREE.MathUtils.lerp(top, height / 2, move)
      view.bottom = THREE.MathUtils.lerp(bottom, -height / 2, move)
      const endZoom = Math.min(width / 13.8, height / 10.8)
      view.zoom = flight.fromZoom * Math.pow(endZoom / flight.fromZoom, move)
      view.updateProjectionMatrix()
      renderer.render(scene, view)
      host.dataset.flightProgress = t.toFixed(3)
      flight.onProgress(t)
      if (t >= 1) finishFlight(true)
    } else renderer.render(scene, camera)
    shadowSeconds = seconds
    shadowStructure = structure
    shadowDirty = false
  }

  function resize() {
    if (disposed) return
    if (flight) {
      // A device rotation should finish navigation rather than distort the flight.
      if (flight.viewport[0] !== innerWidth || flight.viewport[1] !== innerHeight) finishFlight(true)
      return
    }
    const width = Math.max(host.clientWidth, 1)
    const height = Math.max(host.clientHeight, 1)
    const aspect = width / height
    const viewHeight = Math.max(fitHeight, fitWidth / aspect)
    camera.left = (-viewHeight * aspect) / 2
    camera.right = (viewHeight * aspect) / 2
    camera.top = viewHeight / 2
    camera.bottom = -viewHeight / 2
    camera.updateProjectionMatrix()
    renderer.setSize(width, height)
    if (!contextLost) draw()
  }

  function needsFrame() {
    return (
      !disposed &&
      (active || !!flight) &&
      !document.hidden &&
      !contextLost &&
      (flight || Math.abs(structure - structureTarget) > 0.0001 || !reduced)
    )
  }

  function tick(timestamp: number) {
    frame = 0
    if (!needsFrame()) {
      lastTimestamp = 0
      return
    }
    const delta = lastTimestamp ? Math.min((timestamp - lastTimestamp) / 1000, 0.1) : 0
    lastTimestamp = timestamp
    accumulatedDelta += delta
    // Keep the lightweight RAF clock, while bounding GPU work to thirty draws per second.
    if (timestamp - lastDrawTimestamp >= 1000 / 30 - 0.5) {
      const elapsed = accumulatedDelta
      accumulatedDelta = 0
      lastDrawTimestamp = timestamp
      if (!reduced) {
        orbitSeconds += elapsed
        seconds = Math.min(HOME_BUILD_SECONDS, seconds + elapsed)
      }
      if (flight) flight.elapsed += elapsed
      else structure += (structureTarget - structure) * (1 - Math.exp(-elapsed * 2.2))
      if (Math.abs(structure - structureTarget) < 0.0001) structure = structureTarget
      draw()
      report()
    }
    if (needsFrame()) frame = requestAnimationFrame(tick)
  }

  function schedule() {
    lastTimestamp = 0
    lastDrawTimestamp = 0
    accumulatedDelta = 0
    if (needsFrame() && !frame) frame = requestAnimationFrame(tick)
    if (!needsFrame() && frame) {
      cancelAnimationFrame(frame)
      frame = 0
    }
  }

  canvas.addEventListener(
    'webglcontextlost',
    (event) => {
      event.preventDefault()
      contextLost = true
      finishFlight(true)
      host.dataset.renderer = 'recovering'
      report(true)
      schedule()
    },
    { signal },
  )
  canvas.addEventListener(
    'webglcontextrestored',
    () => {
      contextLost = false
      host.dataset.renderer = 'webgl'
      prepareEnvironment()
      shadowDirty = true
      resize()
      report(true)
      schedule()
    },
    { signal },
  )
  document.addEventListener('visibilitychange', schedule, { signal })
  const observer = new ResizeObserver(resize)
  observer.observe(host)
  resize()
  report(true)
  schedule()

  return {
    enterPlanning(onProgress) {
      if (disposed || contextLost || reduced) return Promise.resolve(!disposed)
      if (flight) return Promise.resolve(false)
      const rect = host.getBoundingClientRect()
      const unitX = (camera.right - camera.left) / rect.width
      const unitY = (camera.top - camera.bottom) / rect.height
      const bounds: [number, number, number, number] = [
        camera.left - rect.left * unitX,
        camera.right + (innerWidth - rect.right) * unitX,
        camera.top + rect.top * unitY,
        camera.bottom - (innerHeight - rect.bottom) * unitY,
      ]
      const view = new THREE.OrthographicCamera(...bounds, 0.01, 100)
      view.position.copy(camera.position)
      view.quaternion.copy(camera.quaternion)
      view.zoom = camera.zoom
      view.updateProjectionMatrix()
      const promise = new Promise<HomePlanningFrame | boolean>(resolve => {
        flight = { elapsed: 0, camera: view, fromPosition: camera.position.clone(), fromQuaternion: camera.quaternion.clone(), fromZoom: camera.zoom, startSeconds: seconds, startStructure: structure, bounds, viewport: [innerWidth, innerHeight], onProgress, resolve }
      })
      host.style.cssText = 'position:fixed;inset:0;width:100vw;height:100svh;z-index:20;'
      renderer.setSize(innerWidth, innerHeight)
      active = true
      draw()
      schedule()
      return promise
    },
    setStructure(value) {
      structureTarget = value ? 1 : 0
      if (reduced) {
        structure = structureTarget
        draw()
      }
      schedule()
    },
    setVisible(value) {
      active = value
      schedule()
    },
    setReducedMotion(value) {
      reduced = value
      if (reduced) {
        finishFlight(true)
        seconds = HOME_BUILD_SECONDS
        structure = structureTarget
        draw()
      }
      report(true)
      schedule()
    },
    dispose() {
      disposed = true
      finishFlight(false)
      cancelAnimationFrame(frame)
      observer.disconnect()
      events.abort()
      architecture.dispose()
      lightRoutes.dispose()
      clippedMaterials.forEach((material) => material.dispose())
      planGeometry.dispose()
      planMaterial.dispose()
      groundGeometry.dispose()
      groundMaterial.dispose()
      sun.shadow.map?.dispose()
      scene.environment = null
      environmentMap?.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      canvas.remove()
    },
  }
}

import * as THREE from 'three'

/** A home-only image flow. No scene geometry or other page backgrounds are changed. */
export function createHomeAtmosphere(host: HTMLElement, reducedMotion = false) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true, powerPreference: 'low-power' })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  const canvas = renderer.domElement
  canvas.dataset.homeAtmosphereCanvas = ''
  canvas.setAttribute('aria-hidden', 'true')
  host.append(canvas)
  const scene = new THREE.Scene()
  const camera = new THREE.Camera()
  const geometry = new THREE.PlaneGeometry(2, 2)
  const uniforms = {
    map: { value: null as THREE.Texture | null },
    time: { value: 0 },
    aspect: { value: 1 },
    imageAspect: { value: 1672 / 941 },
  }
  const material = new THREE.ShaderMaterial({
    uniforms,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `
      uniform sampler2D map;
      uniform float time;
      uniform float aspect;
      uniform float imageAspect;
      varying vec2 vUv;
      void main() {
        vec2 uv = vUv - 0.5;
        uv.x *= min(1.0, aspect / imageAspect);
        uv.y *= min(1.0, imageAspect / aspect);
        uv = uv * 0.84 + 0.5;
        float swell = sin(uv.x * 5.2 + time * 0.36) * 0.032;
        float ripple = sin(uv.x * 8.4 - time * 0.25) * 0.013;
        uv.y += swell + ripple + cos(time * 0.16) * 0.018;
        uv.x += sin(uv.y * 4.6 - time * 0.22) * 0.020 + sin(time * 0.13) * 0.012;
        vec3 color = texture2D(map, uv).rgb;
        float light = 0.985 + 0.025 * sin(uv.x * 3.0 + uv.y * 4.0 - time * 0.3);
        gl_FragColor = vec4(color * light, 1.0);
        #include <colorspace_fragment>
      }
    `,
  })
  scene.add(new THREE.Mesh(geometry, material))
  let disposed = false
  let visible = true
  let reduced = reducedMotion
  let loaded = false
  let lost = false
  let frame = 0
  let lastTime = 0
  let lastDraw = 0
  const events = new AbortController()
  function active() { return !disposed && loaded && visible && !reduced && !lost && !document.hidden }
  function draw(time: number) {
    frame = 0
    if (!active()) { lastTime = 0; return }
    const delta = lastTime ? Math.min((time - lastTime) / 1000, 0.1) : 0
    lastTime = time
    uniforms.time.value += delta
    if (time - lastDraw >= 50) {
      lastDraw = time
      renderer.render(scene, camera)
    }
    frame = requestAnimationFrame(draw)
  }
  function schedule() {
    if (frame) cancelAnimationFrame(frame)
    frame = 0
    lastTime = 0
    host.dataset.atmosphereMotion = reduced ? 'reduced' : active() ? 'flowing' : 'paused'
    canvas.hidden = reduced || !loaded || lost
    if (active()) frame = requestAnimationFrame(draw)
  }
  function resize() {
    if (disposed || lost) return
    uniforms.aspect.value = Math.max(1, host.clientWidth) / Math.max(1, host.clientHeight)
    renderer.setSize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight))
    if (loaded && !reduced) renderer.render(scene, camera)
  }
  const texture = new THREE.TextureLoader().load('/assets/home/luminous-atmosphere.webp', image => {
    if (disposed) { image.dispose(); return }
    image.colorSpace = THREE.SRGBColorSpace
    uniforms.map.value = image
    uniforms.imageAspect.value = image.image.width / image.image.height
    loaded = true
    host.classList.add('has-live-atmosphere')
    resize()
    schedule()
  }, undefined, () => { if (!disposed) { canvas.hidden = true; host.dataset.atmosphereMotion = 'fallback' } })
  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(host)
  document.addEventListener('visibilitychange', schedule, { signal: events.signal })
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); lost = true; schedule() }, { signal: events.signal })
  canvas.addEventListener('webglcontextrestored', () => { lost = false; texture.needsUpdate = true; resize(); schedule() }, { signal: events.signal })
  resize()
  return {
    setVisible(value: boolean) { visible = value; schedule() },
    setReducedMotion(value: boolean) { reduced = value; schedule() },
    dispose() {
      disposed = true
      cancelAnimationFrame(frame)
      events.abort()
      resizeObserver.disconnect()
      texture.dispose()
      material.dispose()
      geometry.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      canvas.remove()
      host.classList.remove('has-live-atmosphere')
      delete host.dataset.atmosphereMotion
    },
  }
}

import * as THREE from 'three'

type Point = [number, number, number]
type RouteDefinition = { name: string; start: number; duration: number; points: Point[] }

const routeDefinitions: RouteDefinition[] = [
  {
    name: 'foundation-edge',
    start: 5.6,
    duration: 1.35,
    // The foundation extends to x=6.2 and z=4.7; keep the core outside its opaque sides.
    points: [
      [-6.02, -0.1, 4.725],
      [-2.8, -0.1, 4.725],
      [2.8, -0.1, 4.725],
      [5.92, -0.1, 4.725],
      [6.225, -0.1, 4.725],
      [6.225, -0.1, 4.42],
      [6.225, -0.1, 0.2],
      [6.225, -0.1, -4.32],
    ],
  },
  {
    name: 'entry-passage',
    start: 5.85,
    duration: 1.1,
    points: [
      [4.12, 0.055, 4.22],
      [3.9, 0.055, 3.45],
      [3.2, 0.055, 2.9],
      [2, 0.055, 2.9],
      [1.9, 0.055, 1.9],
      [1.9, 0.055, 0.65],
      [1.85, 0.055, -0.45],
    ],
  },
  {
    name: 'kitchen-connection',
    start: 6.05,
    duration: 0.9,
    points: [
      [1.9, 0.055, 1.9],
      [0.25, 0.055, 1.2],
      [-0.45, 0.055, 0.3],
      [-0.45, 0.055, -1.6],
      [-0.45, 0.055, -2.85],
      [-1.2, 0.055, -3.14],
      [-3.2, 0.055, -3.14],
    ],
  },
]

const vertexShader = `
  varying vec2 vRouteUv;
  varying float vFacing;
  void main() {
    vRouteUv = uv;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vFacing = abs(dot(normalize(normalMatrix * normal), normalize(-viewPosition.xyz)));
    gl_Position = projectionMatrix * viewPosition;
  }
`

const flowShader = `
  uniform float clock;
  uniform float reveal;
  uniform float pathLength;
  uniform float phaseOffset;
  uniform vec3 routeColor;
  uniform vec3 glowColor;
  varying vec2 vRouteUv;
  varying float vFacing;

  vec2 lightPulse() {
    float behind = fract(clock * 0.13 - vRouteUv.x * pathLength / 7.5 + phaseOffset);
    float front = smoothstep(0.0, 0.018, behind);
    float tail = front * exp(-behind * 5.5);
    float head = front * exp(-pow((behind - 0.042) / 0.032, 2.0));
    float drawingHead = exp(-pow((vRouteUv.x - reveal) / 0.018, 2.0));
    drawingHead *= 1.0 - smoothstep(0.985, 1.0, reveal);
    return vec2(tail, max(head, drawingHead));
  }
`

const coreFragmentShader = `
  ${flowShader}
  void main() {
    if (vRouteUv.x > reveal) discard;
    vec2 pulse = lightPulse();
    vec3 color = mix(routeColor * 0.72, glowColor, pulse.x * 0.72);
    color = mix(color, vec3(1.35, 1.3, 1.22), pulse.y);
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`

const haloFragmentShader = `
  ${flowShader}
  uniform float strength;
  void main() {
    if (vRouteUv.x > reveal) discard;
    vec2 pulse = lightPulse();
    float edge = pow(vFacing, 0.65);
    float alpha = strength * edge * (0.12 + pulse.x * 0.9 + pulse.y * 0.85);
    gl_FragColor = vec4(mix(glowColor, vec3(1.0, 0.97, 0.9), pulse.y * 0.72), alpha);
    #include <colorspace_fragment>
  }
`

/** The construction clock reveals each route; the ambient clock keeps its trailing light in motion. */
export function createHomeLightRoutes() {
  const root = new THREE.Group()
  root.name = 'home-light-routes'
  const geometries: THREE.TubeGeometry[] = []
  const materials: THREE.ShaderMaterial[] = []

  const palette = [
    { core: '#9f86ca', glow: '#d6c0ff' },
    { core: '#74afc8', glow: '#c1ebff' },
    { core: '#c9ae82', glow: '#ffe5bb' },
  ]
  const routes = routeDefinitions.map((definition, index) => {
    const curve = new THREE.CatmullRomCurve3(
      definition.points.map((point) => new THREE.Vector3(...point)),
      false,
      'centripetal',
    )
    const group = new THREE.Group()
    group.name = definition.name
    group.visible = false
    root.add(group)

    const uniforms = {
      clock: { value: 0 },
      reveal: { value: 0 },
      pathLength: { value: curve.getLength() },
      phaseOffset: { value: index * 0.27 },
      routeColor: { value: new THREE.Color(palette[index].core) },
      glowColor: { value: new THREE.Color(palette[index].glow) },
    }
    const coreGeometry = new THREE.TubeGeometry(curve, 120, 0.024, 6, false)
    const coreMaterial = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader: coreFragmentShader,
      depthTest: true,
      depthWrite: true,
      toneMapped: false,
    })
    geometries.push(coreGeometry)
    materials.push(coreMaterial)
    const core = new THREE.Mesh(coreGeometry, coreMaterial)
    core.renderOrder = 1
    group.add(core)

    for (const [radius, strength] of [
      [0.065, 0.24],
      [0.14, 0.1],
      [0.26, 0.028],
    ]) {
      const haloGeometry = new THREE.TubeGeometry(curve, 120, radius, 6, false)
      const haloMaterial = new THREE.ShaderMaterial({
        uniforms: { ...uniforms, strength: { value: strength } },
        vertexShader,
        fragmentShader: haloFragmentShader,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      })
      geometries.push(haloGeometry)
      materials.push(haloMaterial)
      const halo = new THREE.Mesh(haloGeometry, haloMaterial)
      halo.renderOrder = 2
      group.add(halo)
    }

    return { group, uniforms, start: definition.start, duration: definition.duration }
  })

  return {
    root,
    update(seconds: number, flowSeconds = seconds) {
      const time = Math.max(0, seconds)
      for (const route of routes) {
        const t = Math.max(0, Math.min(1, (time - route.start) / route.duration))
        const reveal = t * t * t * (t * (t * 6 - 15) + 10)
        route.group.visible = reveal > 0
        route.uniforms.reveal.value = reveal
        route.uniforms.clock.value = Math.max(0, flowSeconds)
      }
    },
    dispose() {
      geometries.forEach((geometry) => geometry.dispose())
      materials.forEach((material) => material.dispose())
      root.clear()
    },
  }
}

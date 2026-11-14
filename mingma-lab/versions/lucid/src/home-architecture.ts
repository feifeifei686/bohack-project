import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

export type HomeBuildPhase = 'floor' | 'walls' | 'windows' | 'furniture' | 'details'

export interface HomeArchitecturePart {
  group: THREE.Group
  phase: HomeBuildPhase
  order: number
}

type Vector = [number, number, number]
type BoxSpec = { size: Vector; at: Vector }

/** A cutaway demonstration home. Each build group is anchored at its lowest surface. */
export function createHomeArchitecture() {
  const root = new THREE.Group()
  root.name = 'home-architecture'
  const parts: HomeArchitecturePart[] = []
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const roundedGeometries = new Map<string, THREE.BufferGeometry>()
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1)
  geometries.add(boxGeometry)

  function material(
    color: string,
    roughness = 0.8,
    metalness = 0,
    finish: THREE.MeshPhysicalMaterialParameters = {},
  ) {
    const result = new THREE.MeshPhysicalMaterial({ color, roughness, metalness, ...finish })
    materials.add(result)
    return result
  }

  const wall = material('#f2ede3', 0.82)
  const stone = material('#e5d9c7', 0.48, 0, { clearcoat: 0.28, clearcoatRoughness: 0.35 })
  const paleStone = material('#faf3e7', 0.28, 0, { clearcoat: 0.48, clearcoatRoughness: 0.24 })
  const wood = material('#c6ac88', 0.63)
  const lightWood = material('#e2ceb0', 0.58)
  const grain = material('#d8c6a8', 0.7)
  const linen = material('#eee6dc', 0.94, 0, { sheen: 0.32, sheenRoughness: 0.85, sheenColor: '#ede3da' })
  const sage = material('#b5c5d3', 0.87, 0, { sheen: 0.22, sheenColor: '#e0e4f2' })
  const deepSage = material('#7e8e7b')
  const charcoal = material('#48524f', 0.6)
  const metal = material('#c9b68f', 0.27, 0.76, { clearcoat: 0.32, clearcoatRoughness: 0.23 })
  const ceramic = material('#faf4e9', 0.24, 0, { clearcoat: 0.62, clearcoatRoughness: 0.16 })
  const soil = material('#6a6253')
  const leaves = material('#879478')
  const rug = material('#dfd5d0', 1, 0, { sheen: 0.2, sheenColor: '#e9dce3' })
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#d8eaf5',
    roughness: 0.12,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.2,
    specularIntensity: 1.15,
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  materials.add(glass)
  const frostedGlass = glass.clone()
  frostedGlass.color.set('#e2deee')
  frostedGlass.opacity = 0.35
  frostedGlass.roughness = 0.48
  frostedGlass.clearcoat = 0.2
  materials.add(frostedGlass)

  function part(name: string, phase: HomeBuildPhase, order: number, at: Vector) {
    const group = new THREE.Group()
    group.name = name
    group.position.set(...at)
    root.add(group)
    parts.push({ group, phase, order })
    return group
  }

  function addBox(
    parent: THREE.Object3D,
    size: Vector,
    at: Vector,
    surface: THREE.Material,
    radius = 0,
  ) {
    let geometry: THREE.BufferGeometry = boxGeometry
    if (radius) {
      const key = [...size, radius].join(':')
      geometry = roundedGeometries.get(key) ?? new RoundedBoxGeometry(...size, 2, radius)
      if (!roundedGeometries.has(key)) {
        roundedGeometries.set(key, geometry)
        geometries.add(geometry)
      }
    }
    const mesh = new THREE.Mesh(geometry, surface)
    if (!radius) mesh.scale.set(...size)
    mesh.position.set(...at)
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }

  function addBoxes(parent: THREE.Object3D, boxes: BoxSpec[], surface: THREE.Material) {
    const mesh = new THREE.InstancedMesh(boxGeometry, surface, boxes.length)
    const transform = new THREE.Object3D()
    boxes.forEach((box, index) => {
      transform.position.set(...box.at)
      transform.scale.set(...box.size)
      transform.updateMatrix()
      mesh.setMatrixAt(index, transform.matrix)
    })
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }

  function cylinder(
    parent: THREE.Object3D,
    radiusTop: number,
    radiusBottom: number,
    height: number,
    at: Vector,
    surface: THREE.Material,
    segments = 24,
  ) {
    const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments)
    geometries.add(geometry)
    const mesh = new THREE.Mesh(geometry, surface)
    mesh.position.set(...at)
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }

  function sphere(parent: THREE.Object3D, size: Vector, at: Vector, surface: THREE.Material) {
    const geometry = new THREE.SphereGeometry(1, 20, 12)
    geometries.add(geometry)
    const mesh = new THREE.Mesh(geometry, surface)
    mesh.scale.set(...size)
    mesh.position.set(...at)
    mesh.castShadow = true
    parent.add(mesh)
    return mesh
  }

  const base = part('foundation', 'floor', 0, [0, -0.34, 0])
  addBox(base, [12.4, 0.32, 9.4], [0, 0.16, 0], stone, 0.035)
  addBox(base, [12.06, 0.01, 9.06], [0, 0.325, 0], paleStone)

  // Individual boards share one draw call; staggered joints make the floor readable at an angle.
  const timberFloor = part('timber-floor', 'floor', 1, [0, -0.022, 0])
  const boardSpecs: BoxSpec[] = []
  function boardArea(x: number, z: number, width: number, depth: number) {
    const boardDepth = 0.25
    for (let row = 0; row * boardDepth < depth; row++) {
      const rowDepth = Math.min(boardDepth, depth - row * boardDepth)
      for (let start = row % 2 ? -1.1 : 0; start < width; start += 2.2) {
        const left = Math.max(0, start)
        const right = Math.min(width, start + 2.2)
        if (right <= left) continue
        boardSpecs.push({
          size: [right - left - 0.008, 0.022, rowDepth - 0.006],
          at: [x + (left + right) / 2, 0.011, z + row * boardDepth + rowDepth / 2],
        })
      }
    }
  }
  boardArea(-5.91, -4.41, 6.61, 8.82)
  boardArea(0.7, -1.1, 2.5, 5.51)
  boardArea(3.2, -4.41, 2.71, 8.82)
  const boards = addBoxes(timberFloor, boardSpecs, grain)
  boardSpecs.forEach((_, index) => {
    const value = 0.96 + ((index * 17) % 13) / 160
    boards.setColorAt(index, new THREE.Color(value, value * 0.996, value * 0.987))
  })

  const bathroomFloor = part('bathroom-tile', 'floor', 2, [0.72, -0.024, -4.41])
  const tiles: BoxSpec[] = []
  for (let x = 0; x < 2.46; x += 0.615) {
    for (let z = 0; z < 3.29; z += 0.658) {
      tiles.push({ size: [0.606, 0.024, 0.649], at: [x + 0.3075, 0.012, z + 0.329] })
    }
  }
  addBoxes(bathroomFloor, tiles, sage)

  // Back wall openings are built out of real side piers, sills and lintels.
  function wallWithWindow(
    name: string,
    x: number,
    width: number,
    openingX: number,
    openingWidth: number,
    sill: number,
    top: number,
    order: number,
  ) {
    const group = part(name, 'walls', order, [x, 0, -4.5])
    const openingLeft = openingX - openingWidth / 2
    const openingRight = openingX + openingWidth / 2
    const leftWidth = openingLeft + width / 2
    const rightWidth = width / 2 - openingRight
    addBoxes(
      group,
      [
        { size: [leftWidth, 2.65, 0.18], at: [-width / 2 + leftWidth / 2, 1.325, 0] },
        { size: [rightWidth, 2.65, 0.18], at: [width / 2 - rightWidth / 2, 1.325, 0] },
        { size: [openingWidth, sill, 0.18], at: [openingX, sill / 2, 0] },
        { size: [openingWidth, 2.65 - top, 0.18], at: [openingX, (2.65 + top) / 2, 0] },
      ],
      wall,
    )
    return { x: x + openingX, z: -4.5, width: openingWidth, bottom: sill, height: top - sill }
  }

  const kitchenWindow = wallWithWindow('kitchen-back-wall', -2.65, 6.7, -0.45, 3.5, 1.05, 2.3, 0)
  const bathWindow = wallWithWindow('bathroom-back-wall', 1.95, 2.5, 0, 1.55, 1.45, 2.3, 1)
  const bedroomWindow = wallWithWindow('bedroom-back-wall', 4.6, 2.8, 0.08, 1.9, 0.85, 2.3, 2)

  const leftWall = part('left-cutaway-wall', 'walls', 3, [-6, 0, 0])
  addBoxes(
    leftWall,
    [
      { size: [0.18, 2.65, 1.45], at: [0, 1.325, -3.775] },
      { size: [0.18, 0.44, 6.4], at: [0, 0.22, 0.15] },
      { size: [0.18, 2.65, 0.9], at: [0, 1.325, 4.05] },
    ],
    wall,
  )

  const bathSide = part('bathroom-side-wall', 'walls', 4, [0.7, 0, -2.8])
  addBox(bathSide, [0.16, 2.3, 3.4], [0, 1.15, 0], wall)
  const bathFront = part('bathroom-door-wall', 'walls', 5, [1.95, 0, -1.1])
  addBoxes(
    bathFront,
    [
      { size: [0.5, 2.3, 0.16], at: [-1, 1.15, 0] },
      { size: [0.95, 2.3, 0.16], at: [0.775, 1.15, 0] },
      { size: [1.05, 0.18, 0.16], at: [-0.225, 2.21, 0] },
    ],
    wall,
  )

  const bedroomSide = part('bedroom-door-wall', 'walls', 6, [3.2, 0, -1.15])
  addBoxes(
    bedroomSide,
    [
      { size: [0.16, 2.3, 4.25], at: [0, 1.15, -1.225] },
      { size: [0.16, 2.3, 1.35], at: [0, 1.15, 2.775] },
      { size: [0.16, 0.18, 1.2], at: [0, 2.21, 1.5] },
    ],
    wall,
  )

  const rightWall = part('right-cutaway-wall', 'walls', 7, [6, 0, 0])
  addBoxes(
    rightWall,
    [
      { size: [0.18, 1.3, 6.8], at: [0, 0.65, -1.1] },
      { size: [0.18, 0.44, 2.2], at: [0, 0.22, 3.4] },
    ],
    wall,
  )

  const frontWall = part('front-entry-wall', 'walls', 8, [0, 0, 4.5])
  addBoxes(
    frontWall,
    [
      { size: [9.45, 0.35, 0.18], at: [-1.275, 0.175, 0] },
      { size: [1.3, 0.35, 0.18], at: [5.35, 0.175, 0] },
    ],
    wall,
  )

  function windowFrame(
    name: string,
    order: number,
    x: number,
    z: number,
    width: number,
    bottom: number,
    height: number,
    rotation = 0,
    frosted = false,
  ) {
    const group = part(name, 'windows', order, [x, bottom, z])
    group.rotation.y = rotation
    const edge = 0.045
    const frameBoxes: BoxSpec[] = [
      { size: [edge, height, 0.08], at: [-width / 2 + edge / 2, height / 2, 0] },
      { size: [edge, height, 0.08], at: [width / 2 - edge / 2, height / 2, 0] },
      { size: [width, edge, 0.08], at: [0, edge / 2, 0] },
      { size: [width, edge, 0.08], at: [0, height - edge / 2, 0] },
      { size: [edge, height, 0.07], at: [0, height / 2, 0] },
    ]
    addBoxes(group, frameBoxes, metal)
    const pane = addBox(
      group,
      [width - edge, height - edge, 0.018],
      [0, height / 2, 0],
      frosted ? frostedGlass : glass,
    )
    pane.castShadow = false
    pane.receiveShadow = false
    return group
  }

  windowFrame(
    'kitchen-window',
    0,
    kitchenWindow.x,
    kitchenWindow.z,
    kitchenWindow.width,
    kitchenWindow.bottom,
    kitchenWindow.height,
  )
  windowFrame(
    'bathroom-window',
    1,
    bathWindow.x,
    bathWindow.z,
    bathWindow.width,
    bathWindow.bottom,
    bathWindow.height,
    0,
    true,
  )
  windowFrame(
    'bedroom-window',
    2,
    bedroomWindow.x,
    bedroomWindow.z,
    bedroomWindow.width,
    bedroomWindow.bottom,
    bedroomWindow.height,
  )
  windowFrame('living-picture-window', 3, -6, 0.25, 6.4, 0.44, 2.12, Math.PI / 2)

  // Door leaves are slightly open, exposing the openings and connecting passage.
  const bathDoor = part('bathroom-door', 'windows', 4, [1.22, 0, -1.1])
  bathDoor.rotation.y = -0.48
  addBox(bathDoor, [0.96, 2.08, 0.055], [0.48, 1.04, 0], lightWood)
  addBox(bathDoor, [0.14, 0.025, 0.035], [0.82, 1.02, 0.045], metal)
  const bedDoor = part('bedroom-door', 'windows', 5, [3.2, 0, -0.25])
  bedDoor.rotation.y = -0.8
  addBox(bedDoor, [1.02, 2.08, 0.055], [0.51, 1.04, 0], lightWood)
  addBox(bedDoor, [0.14, 0.025, 0.035], [0.88, 1.02, 0.045], metal)

  const entryDoor = part('entry-door', 'windows', 6, [4.75, 0, 4.5])
  entryDoor.rotation.y = 0.42
  addBox(entryDoor, [1.15, 2.2, 0.07], [-0.575, 1.1, 0], wood)
  addBox(entryDoor, [0.035, 0.3, 0.035], [-1.01, 1.05, -0.06], metal)

  const kitchen = part('kitchen-cabinets', 'furniture', 0, [-3.2, 0, -3.82])
  addBox(kitchen, [4.85, 0.88, 0.82], [0, 0.44, 0], lightWood, 0.02)
  addBox(kitchen, [4.98, 0.08, 0.92], [0, 0.92, 0.01], paleStone, 0.02)
  const cabinetDivisions: BoxSpec[] = []
  for (let x = -1.75; x <= 1.8; x += 0.72) {
    cabinetDivisions.push({ size: [0.012, 0.74, 0.012], at: [x, 0.46, 0.418] })
  }
  addBoxes(kitchen, cabinetDivisions, wood)
  addBox(kitchen, [0.82, 0.025, 0.53], [-0.7, 0.967, 0.02], metal, 0.04)
  addBox(kitchen, [0.65, 0.026, 0.4], [-0.7, 0.972, 0.02], charcoal, 0.035)
  const tapCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.7, 0.97, -0.27),
    new THREE.Vector3(-0.7, 1.25, -0.27),
    new THREE.Vector3(-0.7, 1.29, -0.05),
    new THREE.Vector3(-0.7, 1.17, 0.02),
  ])
  const tapGeometry = new THREE.TubeGeometry(tapCurve, 16, 0.018, 8, false)
  geometries.add(tapGeometry)
  kitchen.add(new THREE.Mesh(tapGeometry, metal))
  addBox(kitchen, [0.76, 0.025, 0.51], [1.45, 0.975, 0], charcoal, 0.015)
  for (const x of [1.25, 1.65]) cylinder(kitchen, 0.12, 0.12, 0.012, [x, 0.994, 0], metal, 20)

  const tallCabinet = part('kitchen-tall-cabinet', 'furniture', 1, [-5.43, 0, -2.3])
  addBox(tallCabinet, [0.92, 2.28, 1.24], [0, 1.14, 0], lightWood, 0.02)
  addBox(tallCabinet, [0.68, 0.5, 0.035], [0.01, 1.2, 0.64], charcoal, 0.015)
  addBox(tallCabinet, [0.5, 0.022, 0.05], [0.01, 1.35, 0.67], metal)

  const island = part('kitchen-island', 'furniture', 2, [-2.45, 0, -1.45])
  addBox(island, [2.8, 0.88, 0.92], [0, 0.44, 0], stone, 0.025)
  addBox(island, [3.12, 0.09, 1.15], [0, 0.925, 0.08], paleStone, 0.035)
  const stool = part('island-stools', 'furniture', 3, [-2.45, 0, -0.45])
  for (const x of [-0.95, 0, 0.95]) {
    cylinder(stool, 0.23, 0.23, 0.1, [x, 0.63, 0], linen)
    cylinder(stool, 0.025, 0.025, 0.58, [x, 0.29, 0], metal, 12)
    cylinder(stool, 0.19, 0.21, 0.045, [x, 0.025, 0], metal)
  }

  const livingRug = part('living-rug', 'furniture', 4, [-2.5, 0, 2.1])
  addBox(livingRug, [4.6, 0.018, 3.5], [0, 0.009, 0], rug, 0.008)

  const sofa = part('living-sofa', 'furniture', 5, [-3.8, 0.02, 1.85])
  addBoxes(
    sofa,
    [-0.38, 0.38].flatMap((x) =>
      [-1.28, 1.28].map((z) => ({ size: [0.09, 0.1, 0.09] as Vector, at: [x, 0.05, z] as Vector })),
    ),
    wood,
  )
  addBox(sofa, [1.12, 0.34, 3.05], [0, 0.25, 0], linen, 0.13)
  addBox(sofa, [0.29, 0.65, 3.12], [-0.43, 0.58, 0], linen, 0.12)
  for (const z of [-0.93, 0, 0.93]) addBox(sofa, [0.86, 0.18, 0.89], [0.08, 0.5, z], ceramic, 0.075)
  addBox(sofa, [1.14, 0.45, 0.23], [0.01, 0.45, -1.48], linen, 0.1)
  addBox(sofa, [1.14, 0.45, 0.23], [0.01, 0.45, 1.48], linen, 0.1)
  const pillow = addBox(sofa, [0.2, 0.44, 0.48], [-0.15, 0.78, -0.95], sage, 0.08)
  pillow.rotation.z = -0.25

  const coffeeTable = part('coffee-table', 'furniture', 6, [-1.75, 0.02, 2.15])
  cylinder(coffeeTable, 0.68, 0.68, 0.085, [0, 0.43, 0], paleStone, 40).scale.z = 0.75
  cylinder(coffeeTable, 0.35, 0.4, 0.37, [0, 0.195, 0], lightWood, 32).scale.z = 0.72
  cylinder(coffeeTable, 0.08, 0.07, 0.09, [0.43, 0.52, -0.18], ceramic)

  addBox(coffeeTable, [0.35, 0.045, 0.28], [-0.1, 0.495, 0.03], linen, 0.008)

  const loungeChair = part('lounge-chair', 'furniture', 7, [-0.15, 0, 3.12])
  loungeChair.rotation.y = -0.35
  addBoxes(
    loungeChair,
    [-0.3, 0.3].flatMap((x) =>
      [-0.28, 0.28].map((z) => ({
        size: [0.07, 0.18, 0.07] as Vector,
        at: [x, 0.09, z] as Vector,
      })),
    ),
    wood,
  )
  addBox(loungeChair, [0.88, 0.3, 0.82], [0, 0.32, 0], sage, 0.12)
  addBox(loungeChair, [0.92, 0.52, 0.2], [0, 0.59, 0.32], sage, 0.1)
  addBox(loungeChair, [0.13, 0.36, 0.75], [-0.39, 0.49, 0], sage, 0.055)
  addBox(loungeChair, [0.13, 0.36, 0.75], [0.39, 0.49, 0], sage, 0.055)

  const bedroomRug = part('bedroom-rug', 'furniture', 8, [4.65, 0, -1.65])
  addBox(bedroomRug, [2.36, 0.018, 3.3], [0, 0.009, 0], rug, 0.008)
  const bed = part('bed', 'furniture', 9, [4.67, 0.02, -2.15])
  addBoxes(
    bed,
    [-0.78, 0.78].flatMap((x) =>
      [-0.95, 0.95].map((z) => ({ size: [0.13, 0.1, 0.13] as Vector, at: [x, 0.05, z] as Vector })),
    ),
    wood,
  )
  addBox(bed, [1.96, 0.24, 2.32], [0, 0.2, 0], lightWood, 0.045)
  addBox(bed, [1.88, 0.28, 2.23], [0, 0.45, 0], ceramic, 0.075)
  addBox(bed, [1.9, 0.07, 1.4], [0, 0.625, 0.37], sage, 0.03)
  addBox(bed, [2.08, 1.1, 0.13], [0, 0.55, -1.17], linen, 0.045)
  for (const x of [-0.47, 0.47]) addBox(bed, [0.72, 0.15, 0.48], [x, 0.65, -0.75], linen, 0.065)

  const wardrobe = part('bedroom-wardrobe', 'furniture', 10, [4.7, 0, 1.8])
  addBox(wardrobe, [2.24, 2.3, 0.56], [0, 1.15, 0], lightWood, 0.018)
  addBoxes(
    wardrobe,
    [-0.75, 0, 0.75].map((x) => ({ size: [0.009, 2.12, 0.01], at: [x, 1.17, -0.286] })),
    wood,
  )
  addBoxes(
    wardrobe,
    [-0.43, 0.43].map((x) => ({ size: [0.022, 0.32, 0.035], at: [x, 1.1, -0.31] })),
    metal,
  )

  const vanity = part('bathroom-vanity', 'furniture', 11, [1.95, 0, -3.95])
  addBox(vanity, [1.72, 0.14, 0.55], [0, 0.07, 0], wood)
  addBox(vanity, [1.9, 0.72, 0.65], [0, 0.48, 0], lightWood, 0.02)
  addBox(vanity, [2.02, 0.08, 0.75], [0, 0.88, 0], ceramic, 0.025)
  cylinder(vanity, 0.29, 0.22, 0.1, [-0.3, 0.98, 0.04], ceramic, 32).scale.z = 0.75
  cylinder(vanity, 0.019, 0.019, 0.21, [-0.3, 1.02, -0.23], metal, 12)
  addBox(vanity, [1.45, 0.65, 0.035], [0, 1.64, -0.4], metal, 0.015)
  const mirrorMaterial = material('#b6c4be', 0.12, 0.75)
  addBox(vanity, [1.38, 0.58, 0.015], [0, 1.64, -0.375], mirrorMaterial)

  const toilet = part('toilet', 'furniture', 12, [1.35, 0, -2.0])
  cylinder(toilet, 0.2, 0.17, 0.32, [0, 0.16, 0], ceramic)
  sphere(toilet, [0.28, 0.13, 0.36], [0, 0.38, 0.05], ceramic)
  addBox(toilet, [0.44, 0.63, 0.17], [0, 0.315, -0.31], ceramic, 0.04)

  const shower = part('shower-screen', 'furniture', 13, [2.1, 0, -2.27])
  const screen = addBox(shower, [0.018, 1.96, 1.55], [0, 0.98, 0], glass)
  screen.castShadow = false
  addBoxes(
    shower,
    [
      { size: [0.035, 1.98, 0.035], at: [0, 0.99, 0.775] },
      { size: [0.035, 1.98, 0.035], at: [0, 0.99, -0.775] },
    ],
    metal,
  )

  const entryCabinet = part('entry-console', 'furniture', 14, [5.45, 0, 3.2])
  addBox(entryCabinet, [0.65, 0.88, 1.75], [0, 0.44, 0], lightWood, 0.02)
  addBox(entryCabinet, [0.73, 0.06, 1.83], [0, 0.91, 0], paleStone, 0.025)
  const entryBench = part('entry-bench', 'furniture', 15, [2, 0, 3.77])
  addBox(entryBench, [1.6, 0.1, 0.55], [0, 0.41, 0], sage, 0.045)
  addBoxes(
    entryBench,
    [
      { size: [0.13, 0.36, 0.48], at: [-0.62, 0.18, 0] },
      { size: [0.13, 0.36, 0.48], at: [0.62, 0.18, 0] },
    ],
    lightWood,
  )

  const floorLamp = part('living-floor-lamp', 'details', 0, [-4.8, 0, 3.5])
  cylinder(floorLamp, 0.24, 0.27, 0.05, [0, 0.025, 0], metal)
  cylinder(floorLamp, 0.025, 0.025, 1.72, [0, 0.88, 0], metal, 12)
  cylinder(floorLamp, 0.14, 0.32, 0.28, [0, 1.77, 0], linen, 32)

  function plant(name: string, order: number, x: number, z: number, scale: number) {
    const group = part(name, 'details', order, [x, 0, z])
    cylinder(group, 0.29 * scale, 0.21 * scale, 0.48 * scale, [0, 0.24 * scale, 0], stone)
    cylinder(group, 0.25 * scale, 0.25 * scale, 0.025 * scale, [0, 0.47 * scale, 0], soil)
    cylinder(group, 0.025 * scale, 0.04 * scale, 1.15 * scale, [0, 0.94 * scale, 0], wood, 10)
    sphere(group, [0.4 * scale, 0.6 * scale, 0.38 * scale], [0.08 * scale, 1.52 * scale, 0], leaves)
    sphere(
      group,
      [0.3 * scale, 0.37 * scale, 0.29 * scale],
      [-0.2 * scale, 1.25 * scale, 0.16 * scale],
      deepSage,
    )
    return group
  }
  plant('living-plant', 1, -5.15, 0.05, 0.9)
  plant('entry-plant', 2, 0.65, 3.65, 0.65)

  const kitchenObjects = part('kitchen-objects', 'details', 3, [-2.45, 0.97, -1.45])
  cylinder(kitchenObjects, 0.13, 0.09, 0.25, [0.75, 0.125, 0], ceramic)
  sphere(kitchenObjects, [0.24, 0.19, 0.2], [0.76, 0.43, 0], leaves)
  cylinder(kitchenObjects, 0.24, 0.15, 0.06, [-0.75, 0.03, 0.08], stone)

  return {
    root,
    parts,
    dispose() {
      root.traverse((object) => {
        if (object instanceof THREE.InstancedMesh) object.dispose()
      })
      geometries.forEach((geometry) => geometry.dispose())
      materials.forEach((surface) => surface.dispose())
      root.clear()
    },
  }
}

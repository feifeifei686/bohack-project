import { renderRecognizedFloorplan, type PlanFurniture, type PlanSegment } from './planning-recognized'
type Point = [number, number]
export type Bounds = [x: number, z: number, width: number, depth: number]

export type PlanningRoom = { id: string; name: string; bounds: Bounds; label: Point; material: string; polygon?: Point[]; confidence?: number; previousNames?: string[] }

export const planningRooms: PlanningRoom[] = [
  { id: 'living', name: '客厅', bounds: [0, 4.15, 7.4, 3.25], label: [4.55, 5.95], material: 'wood' },
  { id: 'bedroom', name: '卧室', bounds: [0, 0, 4.2, 3], label: [2.7, 2.05], material: 'wood' },
  { id: 'kitchen', name: '厨房', bounds: [6.8, 0, 3.2, 4.15], label: [8.1, 2.65], material: 'stone' },
  { id: 'bathroom', name: '卫生间', bounds: [4.2, 0, 2.6, 3], label: [5.25, 1.05], material: 'tile' },
  { id: 'entry', name: '玄关', bounds: [7.4, 4.15, 2.6, 3.25], label: [8.6, 6.0], material: 'stone' },
]

type Palette = [top: string, front: string, side: string]
const oak: Palette = ['#dbc5a1', '#b89d75', '#c7ae87']
const linen: Palette = ['#f9f4e5', '#ded4bc', '#e9dfc9']
const sage: Palette = ['#bbc5ad', '#89987e', '#a3af96']
const porcelain: Palette = ['#fcfaf0', '#d5ded2', '#e6ece1']
const wall: Palette = ['#fbf7ec', '#e8e0cd', '#d9ceb6']
const floorColors: Record<string, Palette> = {
  wood: ['#ede0c7', '#c5ac86', '#d7c2a1'],
  stone: ['#eae6d5', '#bfbaa7', '#d4ceba'],
  tile: ['#dce6dc', '#9dad9c', '#b9c9b8'],
}

function project(x: number, z: number, height = 0): Point {
  return [300 + 49 * x - 33 * z, 94 + 18 * x + 24 * z - 53 * height]
}

function corners([x, z, w, d]: Bounds, height = 0): Point[] {
  return [project(x, z, height), project(x + w, z, height), project(x + w, z + d, height), project(x, z + d, height)]
}

function points(vertices: Point[]) {
  return vertices.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
}

function polygon(vertices: Point[], fill: string, attributes = '') {
  return `<polygon points="${points(vertices)}" fill="${fill}" ${attributes}/>`
}

function box(bounds: Bounds, height: number, colors: Palette, base = 0, attributes = '') {
  const top = corners(bounds, base + height)
  const lower = corners(bounds, base)
  return `<g data-model-box="${[...bounds, height, base].join(' ')}" ${attributes}>${polygon([top[3], top[2], lower[2], lower[3]], colors[1])}${polygon([top[1], top[2], lower[2], lower[1]], colors[2])}${polygon(top, colors[0])}</g>`
}

function line(a: Point, b: Point) {
  return `<polyline points="${points([a, b])}" />`
}

function seams([x, z, w, d]: Bounds, material: string) {
  const isWood = material === 'wood'
  const horizontal = Array.from({ length: Math.ceil(d / 0.47) - 1 }, (_, i) => {
    const row = z + (i + 1) * 0.47
    return line(project(x, row), project(x + w, row))
  })
  const vertical = isWood ? [] : Array.from({ length: Math.ceil(w / 0.65) - 1 }, (_, i) => {
    const col = x + (i + 1) * 0.65
    return line(project(col, z), project(col, z + d))
  })
  return `<g class="planning-seams" aria-hidden="true">${[...horizontal, ...vertical].join('')}</g>`
}

function bathroom() {
  const cabinet = box([4.4, 0.36, 0.69, 1.06], 0.56, sage)
    + box([4.38, 0.32, 0.73, 1.13], 0.09, porcelain, 0.56)
    + polygon(corners([4.51, 0.53, 0.45, 0.67], 0.654), '#b3c2b8', 'data-model-detail')
  return `<g data-floor-feature="bath-vanity">${cabinet}</g>`
    + box([6.02, 0.20, 0.58, 0.86], 0.35, porcelain)
    + box([6.10, 0.20, 0.44, 0.25], 0.23, linen, 0.35)
    + box([5.94, 1.77, 0.69, 1.01], 0.075, porcelain)
    + box([6.57, 1.77, 0.045, 1.01], 0.77, ['#d2e1d9', '#aabeb2', '#c2d2c8'], 0.075, 'opacity=".64"')
}

const furnishings: Record<string, string> = {
  bedroom: box([0.52, 0.33, 1.79, 2.02], 0.35, oak)
    + box([0.60, 0.38, 1.62, 1.85], 0.14, linen, 0.35)
    + box([0.60, 1.05, 1.62, 1.18], 0.045, sage, 0.49)
    + box([0.71, 0.48, 0.62, 0.41], 0.075, porcelain, 0.49)
    + box([1.46, 0.48, 0.62, 0.41], 0.075, porcelain, 0.49)
    + box([2.5, 0.39, 0.47, 0.50], 0.4, oak)
    + box([3.25, 0.24, 0.72, 0.72], 0.98, linen),
  bathroom: bathroom(),
  kitchen: '<g data-floor-feature="kitchen-cabinet">' + box([7.02, 0.18, 2.78, 0.62], 0.65, sage)
    + box([7.01, 0.17, 2.81, 0.65], 0.07, linen, 0.65)
    + polygon(corners([7.56, 0.27, 0.62, 0.38], 0.724), '#a5b6ad', 'data-model-detail')
    + polygon(corners([8.73, 0.28, 0.54, 0.39], 0.724), '#6e7a70', 'data-model-detail')
    + box([9.22, 0.83, 0.58, 1.60], 0.65, sage)
    + box([9.20, 0.82, 0.62, 1.62], 0.07, linen, 0.65) + '</g>',
  living: polygon(corners([1.33, 4.69, 3.73, 2.20], 0.005), '#ded0b4', 'data-model-detail')
    + box([0.33, 4.55, 2.64, 0.98], 0.33, linen)
    + box([0.33, 4.53, 2.64, 0.21], 0.44, sage, 0.24)
    + box([0.33, 4.74, 0.21, 0.77], 0.19, sage, 0.33)
    + box([2.76, 4.74, 0.21, 0.77], 0.19, sage, 0.33)
    + box([1.62, 5.84, 1.36, 0.59], 0.22, oak)
    + box([5.74, 6.64, 1.24, 0.40], 0.40, oak),
  entry: box([9.18, 4.62, 0.63, 1.60], 0.64, oak)
    + box([9.15, 4.60, 0.69, 1.65], 0.065, linen, 0.64)
    + polygon(corners([8.12, 6.63, 1.16, 0.53], 0.005), '#c9bea3', 'data-model-detail'),
}

type Wall = { bounds: Bounds; height: number; owner: string; front?: boolean }
const demoWalls: Wall[] = [
  { bounds: [0, -.12, 4.2, .12], height: 1, owner: 'bedroom' },
  { bounds: [4.2, -.12, 2.6, .12], height: 1, owner: 'bathroom' },
  { bounds: [6.8, -.12, 3.32, .12], height: 1, owner: 'kitchen' },
  { bounds: [-.12, 0, .12, 3], height: .68, owner: 'bedroom' },
  { bounds: [-.12, 3, .12, 1.15], height: .68, owner: 'corridor' },
  { bounds: [-.12, 4.15, .12, 3.35], height: .68, owner: 'living' },
  { bounds: [4.14, 0, .12, 3], height: .47, owner: 'bathroom' },
  { bounds: [6.74, 0, .12, 3.18], height: .52, owner: 'kitchen' },
  { bounds: [6.74, 3.92, .12, .23], height: .35, owner: 'kitchen' },
  { bounds: [0, 2.94, 2.95, .12], height: .36, owner: 'bedroom', front: true },
  { bounds: [3.76, 2.94, .44, .12], height: .36, owner: 'bedroom', front: true },
  { bounds: [4.2, 2.94, 1, .12], height: .36, owner: 'bathroom', front: true },
  { bounds: [5.98, 2.94, .76, .12], height: .36, owner: 'bathroom', front: true },
  { bounds: [0, 4.09, 2.24, .12], height: .23, owner: 'living' },
  { bounds: [4.17, 4.09, 2.57, .12], height: .23, owner: 'living' },
  { bounds: [8.26, 4.09, 1.74, .12], height: .23, owner: 'kitchen', front: true },
  { bounds: [7.34, 5.88, .12, 1.52], height: .24, owner: 'entry' },
  { bounds: [10, 0, .12, 4.15], height: .28, owner: 'kitchen', front: true },
  { bounds: [10, 4.15, .12, 3.37], height: .28, owner: 'entry', front: true },
  { bounds: [-.12, 7.4, 7.52, .12], height: .22, owner: 'living', front: true },
  { bounds: [7.4, 7.4, .75, .12], height: .22, owner: 'entry', front: true },
  { bounds: [9.22, 7.4, .9, .12], height: .22, owner: 'entry', front: true },
]
const demoWindows: { bounds: Bounds; owner: string }[] = [
  { bounds: [.7, -.12, 2.15, .13], owner: 'bedroom' },
  { bounds: [7.36, -.12, 1.44, .13], owner: 'kitchen' },
]

export type PlanningModel = { rooms: PlanningRoom[]; drawing?: string; drawingAspect?: number; recognized?: boolean; imageBounds?: Bounds; walls?: PlanSegment[]; openings?: (PlanSegment & { kind: 'door' | 'window' })[]; furniture?: PlanFurniture[]; warnings?: string[]; analysisState?: 'idle' | 'pending' | 'ready' | 'error'; analysisError?: string }
export const demoPlanningModel: PlanningModel = { rooms: planningRooms }

function wallsFor(model: PlanningModel): Wall[] {
  if (!model.drawing) return demoWalls
  return model.rooms.flatMap(({ id, bounds: [x, z, w, d] }) => {
    const opening = Math.min(w * .28, .75)
    return [
      { bounds: [x, z, w, .07], height: .65, owner: id },
      { bounds: [x, z, .07, d], height: .44, owner: id },
      { bounds: [x + w - .07, z, .07, d], height: .3, owner: id, front: true },
      { bounds: [x, z + d - .07, (w - opening) / 2, .07], height: .22, owner: id, front: true },
      { bounds: [x + (w + opening) / 2, z + d - .07, (w - opening) / 2, .07], height: .22, owner: id, front: true },
    ] satisfies Wall[]
  })
}

function renderWalls(walls: Wall[]) {
  return walls.map(({ bounds, height }) => box(bounds, height, wall, 0, 'data-model-wall')).join('')
}

const bathHotspots = [
  { id: 'bath-vanity', name: '浴室柜', position: project(4.74, 0.95, 0.72) },
  { id: 'bath-tile', name: '旧地砖', position: project(5.46, 2.38) },
]

function drawRoom(room: PlanningRoom, preview: boolean, walls: Wall[], demo: boolean) {
  const { id, name, bounds, label, material } = room
  const [lx, ly] = project(...label)
  const labelWidth = Math.max(68, name.length * 20 + 22)
  return `<g data-floor-room="${id}" class="planning-room">
    ${box(bounds, 0.22, floorColors[material], -0.22, 'data-model-floor')}
    ${polygon(corners(bounds), 'transparent', 'class="planning-tint"')}
    ${seams(bounds, material)}
    ${preview ? polygon(corners(bounds), 'transparent', 'class="planning-preview-floor"') : ''}
    ${renderWalls(walls.filter(item => !item.front))}
    ${demo ? demoWindows.filter(item => item.owner === id).map(item => box(item.bounds, .30, ['#e9f0e5', '#baccc1', '#d5e0d4'], .55, 'data-model-wall')).join('') + (furnishings[id] || '') : ''}
    ${polygon(corners(bounds), 'transparent', 'class="planning-outline"')}
    ${renderWalls(walls.filter(item => item.front))}
    <g class="planning-room-label" transform="translate(${lx} ${ly})" aria-hidden="true">
      <rect x="${-labelWidth / 2}" y="-15" width="${labelWidth}" height="31" rx="10"/>
      <text text-anchor="middle" dominant-baseline="central">${name.replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]!)}</text>
    </g>
    ${demo && !preview && id === 'bathroom' ? bathHotspots.map(({ id, name, position: [x, y] }) => `<g class="planning-hotspot" data-floor-hotspot="${id}" role="button" tabindex="-1" aria-label="${name}" transform="translate(${x} ${y})"><title>${name}</title><circle class="planning-hotspot-hit" r="18"/><circle r="9"/><circle r="3"/></g>`).join('') : ''}
  </g>`
}

export function renderPlanningFloorplan(preview = false, model = demoPlanningModel) {
  if (model.recognized && model.rooms.length) return renderRecognizedFloorplan(model, preview)
  const shadow = preview ? 'planning-preview-shadow' : 'planning-shadow'
  const base: Bounds = [-0.20, -0.20, 10.40, 7.80]
  const corridor: Bounds = [0, 3, 6.8, 1.15]
  const demo = !model.drawing
  const walls = wallsFor(model)
  const orderedRooms = [...model.rooms].sort((a, b) => (a.bounds[0] * 18 + a.bounds[1] * 24) - (b.bounds[0] * 18 + b.bounds[1] * 24))
  return `<svg class="planning-floorplan" viewBox="0 16 840 485" ${preview ? 'aria-hidden="true"' : 'role="group" aria-label="可点选的轴测演示户型"'}>
    <defs><filter id="${shadow}" x="-25%" y="-50%" width="150%" height="200%"><feGaussianBlur stdDeviation="10"/></filter></defs>
    ${polygon(corners(base, -0.55), '#64523b', `filter="url(#${shadow})" opacity=".26" data-model-detail`)}
    ${box(base, 0.33, ['#f8f3e5', '#baa98b', '#ccbea5'], -0.55)}
    ${demo ? box(corridor, 0.22, floorColors.stone, -0.22) + seams(corridor, 'stone') + renderWalls(walls.filter(item => item.owner === 'corridor')) : ''}
    <g class="planning-lift-shadow" aria-hidden="true">${orderedRooms.map(room => polygon(corners(room.bounds, -0.13), '#5c634b', `data-floor-shadow="${room.id}"`)).join('')}</g>
    <g class="planning-room-layer">${orderedRooms.map(room => drawRoom(room, preview, walls.filter(item => item.owner === room.id), demo)).join('')}</g>
  </svg>`
}

export function drawingBounds(model: PlanningModel): Bounds {
  if (model.imageBounds) return model.imageBounds
  const ratio = model.drawingAspect || 10 / 7.4
  const width = Math.min(10, 7.4 * ratio)
  const depth = width / ratio
  return [(10 - width) / 2, (7.4 - depth) / 2, width, depth]
}

export function demoDrawingSvg(warm = false) {
  const roomFills: Record<string, string> = { bedroom: '#ede8dc', bathroom: '#e6ebe1', kitchen: '#e2e8db', living: '#e8ebdb', entry: '#eee6d3' }
  const rooms = planningRooms.map(({ id, bounds: [x, z, w, d], name }) =>
    `<rect x="${x}" y="${z}" width="${w}" height="${d}" fill="${warm ? roomFills[id] : '#e7f0f2'}" stroke="${warm ? '#adb4a4' : '#97b6bc'}" stroke-width=".025"/>
    <text x="${x + w / 2}" y="${z + d / 2}" text-anchor="middle" dominant-baseline="middle">${name}</text>`).join('')
  const walls = demoWalls.map(({ bounds: [x, z, w, d] }) => `<rect x="${x}" y="${z}" width="${w}" height="${d}" fill="#1c4953"/>`).join('')
  const windows = demoWindows.map(({ bounds: [x, z, w] }) => `<path d="M${x} ${z}h${w}m-${w} .12h${w}" stroke="#5bb0bf" stroke-width=".055"/>`).join('')
  const sheet = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-.65 -.85 11.3 9.05" role="img" aria-label="五区演示户型平面图">
    <defs><pattern id="drawing-grid" width=".25" height=".25" patternUnits="userSpaceOnUse"><path d="M.25 0H0V.25" fill="none" stroke="#bbd4d9" stroke-width=".013"/></pattern></defs>
    <rect x="-1" y="-1" width="12" height="10" fill="#f6fbfc"/>
    <rect x="-1" y="-1" width="12" height="10" fill="url(#drawing-grid)"/>
    <g font-family="sans-serif" font-size=".29" fill="#214b53">
      ${rooms}${walls}${windows}
      <text x="3.4" y="3.63" text-anchor="middle" font-size=".22">公共走道</text>
      <text x="8.68" y="7.91" text-anchor="middle" font-size=".22">入户</text>
      <path d="M8.68 7.6v-.42m-.10 .11 .10-.11 .10 .11" fill="none" stroke="#326b76" stroke-width=".04"/>
      <path d="M2.95 3v-.79a.8 .8 0 0 1 .8 .79M5.2 3v-.77a.78 .78 0 0 1 .78 .77M6.8 3.18h.74a.74 .74 0 0 1-.74 .74M7.4 4.15v.86a.86 .86 0 0 0 .86-.86" fill="none" stroke="#618c96" stroke-width=".035"/>
      <path d="M0 -.38H10M0 -.49v.21m10-.21v.21M-.39 0V7.4m-.10-7.4h.20m-.20 7.4h.20" fill="none" stroke="#618c96" stroke-width=".024"/>
      <text x="5" y="-.51" text-anchor="middle" font-size=".19">示意尺寸 · 比例未校准</text>
    </g>
  </svg>`
  return warm ? sheet.replaceAll('#1c4953', '#374b3e').replaceAll('#5bb0bf', '#9aa48f').replaceAll('#bbd4d9', '#ddd6c6').replaceAll('#f6fbfc', '#faf7ee').replaceAll('#214b53', '#4d6052').replaceAll('#326b76', '#8c9b85').replaceAll('#618c96', '#94a38d').replace('示意尺寸 · 比例未校准', '').replace('font-size=".29"', 'font-size=".52"').replaceAll('font-size=".22"', 'font-size=".36"').replace('width=".25" height=".25"', 'width=".5" height=".5"').replace('M.25 0H0V.25', 'M.5 0H0V.5') : sheet
}

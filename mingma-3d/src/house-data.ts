export type LayerId = 'cold' | 'hot' | 'electric'
export type Point3 = [number, number, number]
export type RoomId = 'living' | 'bedroom' | 'kitchen' | 'bathroom' | 'entry'

export interface Room {
  id: RoomId
  name: string
  area: number
  bounds: { x: number; z: number; width: number; depth: number }
}

export interface Route {
  id: string
  roomId: RoomId
  name: string
  layer: LayerId
  points: Point3[]
  from: string
  to: string
  note: string
  workItems: string[]
}

export const layerColors: Record<LayerId, string> = {
  cold: '#318aaa',
  hot: '#ca6f58',
  electric: '#c28e2c',
}

export const rooms: Room[] = [
  { id: 'living', name: '客厅', area: 28, bounds: { x: -5, z: -0.15, width: 8, depth: 3.5 } },
  { id: 'bedroom', name: '卧室', area: 17, bounds: { x: -5, z: -3.35, width: 5.3125, depth: 3.2 } },
  { id: 'kitchen', name: '厨房', area: 9, bounds: { x: 0.3125, z: -3.35, width: 2.8125, depth: 3.2 } },
  { id: 'bathroom', name: '卫生间', area: 6, bounds: { x: 3.125, z: -3.35, width: 1.875, depth: 3.2 } },
  { id: 'entry', name: '玄关', area: 7, bounds: { x: 3, z: -0.15, width: 2, depth: 3.5 } },
]

const waterNote = '演示管线。实际位置、管径、设备接点和施工方式由施工图与现场复核确定。'
const electricNote = '演示回路。实际回路划分、保护措施和电气参数由专业人员依据现场复核。'

export const routes: Route[] = [
  {
    id: 'cold-kitchen', roomId: 'kitchen', name: '厨房冷水支路', layer: 'cold',
    points: [[4.75, 0.22, -3.05], [0.62, 0.22, -3.05], [0.62, 0.22, -2.25], [0.62, 1.03, -2.25]],
    from: '给水入口示意', to: '厨房水槽示意', note: waterNote,
    workItems: ['给水点位复核', '管线敷设', '接点连接', '试压记录'],
  },
  {
    id: 'cold-bathroom', roomId: 'bathroom', name: '卫生间冷水支路', layer: 'cold',
    points: [[4.75, 0.22, -3.05], [4.75, 0.22, -0.7], [4.15, 0.22, -0.7], [4.15, 1.03, -0.7]],
    from: '给水入口示意', to: '洗手盆示意', note: waterNote,
    workItems: ['给水点位复核', '管线敷设', '接点连接', '试压记录'],
  },
  {
    id: 'hot-kitchen', roomId: 'kitchen', name: '厨房热水支路', layer: 'hot',
    points: [[4.57, 1.75, -2.95], [4.57, 0.35, -2.95], [0.79, 0.35, -2.95], [0.79, 0.35, -2.25], [0.79, 1.03, -2.25]],
    from: '热水设备示意', to: '厨房水槽示意', note: waterNote,
    workItems: ['热水点位复核', '管线敷设', '接点连接', '试压记录'],
  },
  {
    id: 'hot-bathroom', roomId: 'bathroom', name: '卫生间热水支路', layer: 'hot',
    points: [[4.57, 1.75, -2.95], [4.57, 0.35, -2.95], [4.57, 0.35, -0.87], [4.32, 0.35, -0.87], [4.32, 1.03, -0.87]],
    from: '热水设备示意', to: '洗手盆示意', note: waterNote,
    workItems: ['热水点位复核', '管线敷设', '接点连接', '试压记录'],
  },
  {
    id: 'electric-living', roomId: 'living', name: '客厅用电回路示意', layer: 'electric',
    points: [[4.68, 1.72, 2.7], [4.68, 0.12, 2.7], [2.65, 0.12, 2.7], [2.65, 0.12, 0.2], [-4.64, 0.12, 0.2], [-4.64, 1.1, 0.2]],
    from: '配电箱示意', to: '客厅用电点位', note: electricNote,
    workItems: ['用电需求复核', '点位与回路确认', '线管与线缆敷设', '检测记录'],
  },
  {
    id: 'electric-bedroom', roomId: 'bedroom', name: '卧室用电回路示意', layer: 'electric',
    points: [[4.68, 1.72, 2.7], [4.68, 0.14, 2.7], [2.82, 0.14, 2.7], [2.82, 0.14, -0.45], [-0.05, 0.14, -0.45], [-0.05, 0.14, -2.8], [-0.05, 0.8, -2.8]],
    from: '配电箱示意', to: '卧室用电点位', note: electricNote,
    workItems: ['用电需求复核', '点位与回路确认', '线管与线缆敷设', '检测记录'],
  },
  {
    id: 'electric-kitchen', roomId: 'kitchen', name: '厨房用电回路示意', layer: 'electric',
    points: [[4.68, 1.72, 2.7], [4.68, 0.18, 2.7], [3.3, 0.18, 2.7], [3.3, 0.18, -0.55], [2.78, 0.18, -0.55], [2.78, 1.15, -0.55]],
    from: '配电箱示意', to: '厨房用电点位', note: electricNote,
    workItems: ['厨房设备清单复核', '点位与回路确认', '线管与线缆敷设', '检测记录'],
  },
  {
    id: 'electric-bathroom', roomId: 'bathroom', name: '卫生间用电回路示意', layer: 'electric',
    points: [[4.68, 1.72, 2.7], [4.85, 1.72, 2.7], [4.85, 0.18, 2.7], [4.85, 0.18, -1.7], [4.85, 1.35, -1.7]],
    from: '配电箱示意', to: '卫生间用电点位', note: electricNote,
    workItems: ['用电需求复核', '点位与回路确认', '线管与线缆敷设', '检测记录'],
  },
  {
    id: 'electric-entry', roomId: 'entry', name: '玄关照明回路示意', layer: 'electric',
    points: [[4.68, 1.72, 2.7], [4.68, 2.15, 2.7], [4, 2.15, 2.7], [4, 2.15, 1.5]],
    from: '配电箱示意', to: '玄关照明示意', note: electricNote,
    workItems: ['照明需求复核', '点位与回路确认', '线管与线缆敷设', '检测记录'],
  },
]

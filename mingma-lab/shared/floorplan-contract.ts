/** Image coordinates: x/y in [0,1000], relative to the complete uploaded image. */
export type PlanPoint = [number, number]
export type FurnitureKind = 'bed' | 'sofa' | 'table' | 'chair' | 'cabinet' | 'counter' | 'sink' | 'stove' | 'toilet' | 'bathtub' | 'shower' | 'washer' | 'fridge'
export interface FloorplanResult {
  rooms: { id: string; name: string; kind: 'living' | 'bedroom' | 'kitchen' | 'bathroom' | 'balcony' | 'entry' | 'dining' | 'corridor' | 'other'; polygon: PlanPoint[]; confidence: number }[]
  walls: { roomId: string; start: PlanPoint; end: PlanPoint }[]
  openings: { roomId: string; kind: 'door' | 'window'; start: PlanPoint; end: PlanPoint }[]
  furniture: { id: string; roomId: string; kind: FurnitureKind; bounds: [number, number, number, number]; rotation: number; confidence: number }[]
  warnings: string[]
}

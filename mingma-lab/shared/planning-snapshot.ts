import type { PlanningModel } from './planning-floorplan'
import type { WallAnnotation, WallExpansionMode } from './wall-demolition-data'

export type WallDemolitionSnapshot = {
  schema: 1
  mode: WallExpansionMode
  amount: number
  roomId: string
  wallId: string
  preview: boolean
  marked: string[]
  annotations: [string, WallAnnotation][]
}
export type RoomPlanningSnapshot = {
  schema: 1
  model: PlanningModel
  selectedRoomId: string
  stage: 'drawing' | 'model' | 'walls'
  walls: WallDemolitionSnapshot
}
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const string = (v: unknown, max = 1000): v is string => typeof v === 'string' && v.length <= max
const id = (v: unknown): v is string => string(v, 100) && /^[A-Za-z0-9_-]+$/.test(v)
const number = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 100000
const point = (v: unknown) => Array.isArray(v) && v.length === 2 && v.every(number)
const bounds = (v: unknown) => Array.isArray(v) && v.length === 4 && v.every(number) && v[2] > 0 && v[3] > 0
const list = (v: unknown, test: (value: unknown) => boolean, max = 1000): boolean => Array.isArray(v) && v.length <= max && v.every(test)
const optional = (v: unknown, test: (value: unknown) => boolean) => v === undefined || test(v)
const boolean = (v: unknown) => typeof v === 'boolean'
const segment = (v: unknown) => record(v) && id(v.roomId) && point(v.start) && point(v.end)
const enumValue = (v: unknown, values: readonly string[]) => typeof v === 'string' && values.includes(v)

export function decodePlanningModel(value: unknown): PlanningModel {
  const room = (v: unknown) => record(v) && id(v.id) && string(v.name, 100) && bounds(v.bounds) &&
    (v.bounds as number[])[2] <= 100 && (v.bounds as number[])[3] <= 100 && point(v.label) && string(v.material, 30) &&
    optional(v.polygon, x => list(x, point, 128) && (x as unknown[]).length >= 3) &&
    optional(v.confidence, number) && optional(v.previousNames, x => list(x, y => string(y, 100), 100))
  if (!record(value) || !list(value.rooms, room, 48) ||
    !optional(value.drawing, x => string(x, 18_000_000) && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(x)) ||
    !optional(value.drawingAspect, x => number(x) && x > 0) ||
    !optional(value.recognized, boolean) || !optional(value.imageBounds, bounds) ||
    !optional(value.walls, x => list(x, segment)) ||
    !optional(value.openings, x => list(x, y => segment(y) && record(y) && enumValue(y.kind, ['door', 'window']))) ||
    !optional(value.furniture, x => list(x, y => record(y) && id(y.id) && id(y.roomId) && bounds(y.bounds) && number(y.rotation) && number(y.confidence) && enumValue(y.kind, ['bed', 'sofa', 'table', 'chair', 'cabinet', 'counter', 'sink', 'stove', 'toilet', 'bathtub', 'shower', 'washer', 'fridge']), 250)) ||
    !optional(value.warnings, x => list(x, y => string(y), 100)) ||
    !optional(value.analysisState, x => enumValue(x, ['idle', 'pending', 'ready', 'error'])) ||
    !optional(value.analysisError, x => string(x))) throw new Error('保存的户型格式无法读取，原草稿已保留。')
  const model = structuredClone(value) as PlanningModel
  const ids = new Set(model.rooms.map(room => room.id))
  if (ids.size !== model.rooms.length || (model.drawing && !model.drawingAspect) || (model.recognized && !model.drawing)) throw new Error('保存的户型信息不完整，原草稿已保留。')
  // Restoring a draft never restarts an AI request or claims that an interrupted analysis finished.
  if (model.analysisState === 'pending') model.analysisState = 'idle'
  return model
}

export function decodeWallSnapshot(value: unknown): WallDemolitionSnapshot {
  if (!record(value) || value.schema !== 1 || !enumValue(value.mode, ['all', 'room', 'wall']) ||
    !number(value.amount) || value.amount < 0 || value.amount > 1 || !string(value.roomId, 100) || !string(value.wallId, 100) ||
    !boolean(value.preview) || !list(value.marked, id) ||
    !list(value.annotations, v => Array.isArray(v) && v.length === 2 && id(v[0]) && record(v[1]) && enumValue(v[1].type, ['unknown', 'bearing', 'partition']) && string(v[1].note, 300))) {
    throw new Error('保存的墙体标注无法读取，原草稿已保留。')
  }
  const snapshot = structuredClone(value) as WallDemolitionSnapshot
  const bearing = new Set(snapshot.annotations.filter(([, annotation]) => annotation.type === 'bearing').map(([id]) => id))
  snapshot.marked = [...new Set(snapshot.marked)].filter(id => !bearing.has(id))
  snapshot.preview = snapshot.preview && snapshot.marked.length > 0
  return snapshot
}

export function decodeRoomPlanningSnapshot(value: unknown): RoomPlanningSnapshot {
  if (!record(value) || value.schema !== 1 || !string(value.selectedRoomId, 100) || !enumValue(value.stage, ['drawing', 'model', 'walls'])) {
    throw new Error('保存的空间规划版本无法读取，原草稿已保留。')
  }
  const model = decodePlanningModel(value.model)
  const selectedRoomId = model.rooms.some(room => room.id === value.selectedRoomId) ? value.selectedRoomId : model.rooms[0]?.id || ''
  return { schema: 1, model, selectedRoomId, stage: model.rooms.length ? value.stage as RoomPlanningSnapshot['stage'] : 'drawing', walls: decodeWallSnapshot(value.walls) }
}

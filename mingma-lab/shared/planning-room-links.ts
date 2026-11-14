import type { PlanningModel, PlanningRoom } from './planning-floorplan'

// Existing requirement snapshots refer to area names. Keep these references
// resolvable after a display-name correction without rewriting the snapshots.
export function planningRoomNames(room: PlanningRoom): string[] {
  return [...new Set([room.name, ...(room.previousNames || [])])]
}

export function renamePlanningRoom(model: PlanningModel, room: PlanningRoom, name: string): boolean {
  if (!name || model.rooms.some(other => other.id !== room.id && planningRoomNames(other).includes(name))) return false
  if (name !== room.name) {
    room.previousNames = planningRoomNames(room).filter(previous => previous !== name)
    room.name = name
  }
  return true
}

export function planningRoomMatches(room: PlanningRoom, areas: string[]): boolean {
  return planningRoomNames(room).some(name => areas.includes(name))
}

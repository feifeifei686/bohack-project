import type { IntakeItem, IntakeQuestion } from './intake-contract.ts'
import { demoPlanningModel, type PlanningModel } from './planning-floorplan.ts'

export type SpatialFocus = { roomIds: string[]; feature?: string; label: string }

export function intakeSpatialFocus(areas: string[], question?: IntakeQuestion, target?: IntakeItem, model: PlanningModel = demoPlanningModel): SpatialFocus {
  const knownRooms = model.rooms.filter(room => {
    if (target) return (target.scope === 'area' || target.scope === 'shared') && target.areas.includes(room.name)
    if (question) return question.text.includes(room.name)
    return areas.includes(room.name)
  })
  const roomIds = knownRooms.map(room => room.id)
  const label = knownRooms.map(room => room.name).join('、') ||
    (target && target.scope !== 'global' ? '区域待定位' : !question && areas.length ? '区域待定位' : '全屋')
  if (roomIds.length !== 1 || !question) return { roomIds, label }

  const part = target?.component.trim() || question.text
  if (!model.drawing && roomIds[0] === 'bathroom' && /浴室柜|洗手台|台盆柜/.test(part)) {
    return { roomIds, feature: 'bath-vanity', label: '卫生间 · 浴室柜' }
  }
  if (!model.drawing && roomIds[0] === 'kitchen' && /橱柜|地柜|吊柜/.test(part)) {
    return { roomIds, feature: 'kitchen-cabinet', label: '厨房 · 橱柜' }
  }
  if (/墙体|墙面|墙壁|隔墙/.test(part)) {
    return { roomIds, feature: 'wall', label: `${label} · 墙体` }
  }
  if (/地砖|地面|地板|铺装/.test(part)) {
    return { roomIds, feature: 'floor', label: `${label} · 地面` }
  }
  return { roomIds, label }
}

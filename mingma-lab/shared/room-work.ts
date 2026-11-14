import type { IntakeDocument } from './intake-contract.ts'
import type { Requirement } from '../versions/lucid/src/domain.ts'
export type RoomWork = { id: string; name: string; prefix: string; draft: string | null; requirements: Requirement[]; document?: IntakeDocument; savedDraft?: string | null; idMap?: Record<string, string> }
export function saveRoomRequirements(existing: Requirement[], room: RoomWork, incoming: Requirement[], document: IntakeDocument) {
  const mapping = new Map(Object.entries(room.idMap || {}))
  const used = new Set(mapping.values())
  const originals = new Set([...document.result.items.flatMap(item => [item.id, ...item.dependencies]), ...document.result.conflicts.flatMap(item => [item.id, ...item.itemIds]), ...document.reviewedIds, ...document.acceptedSuggestionIds])
  let ordinal = mapping.size + 1
  for (const id of originals) {
    if (mapping.has(id)) continue
    let candidate = `${room.prefix}_${id}`
    if (candidate.length > 64 || used.has(candidate)) {
      do { candidate = `${room.prefix.slice(0,32)}_item_${ordinal++}` } while (used.has(candidate))
    }
    mapping.set(id, candidate); used.add(candidate)
  }
  const rename = (id: string) => mapping.get(id) || `${room.prefix}_${id}`
  const item = (value: IntakeDocument['result']['items'][number]) => ({ ...structuredClone(value), id: rename(value.id), dependencies: value.dependencies.map(rename) })
  const requirements = incoming.map(req => ({ ...structuredClone(req), id: rename(req.id), ...(req.intake ? { intake: item(req.intake) } : {}) }))
  const oldIds = new Set(room.requirements.map(req => req.id))
  return { requirements: [...existing.filter(req => !oldIds.has(req.id)), ...requirements], room: { ...room, idMap: Object.fromEntries(mapping), requirements, document: structuredClone(document), savedDraft: room.draft } }
}
export function combinedRoomDocument(rooms: RoomWork[]): IntakeDocument | undefined {
  const saved = rooms.filter(room => room.document)
  if (!saved.length) return undefined
  const key = (room: RoomWork, id: string) => room.idMap && Object.hasOwn(room.idMap, id) ? room.idMap[id] : room.requirements.some(req => req.id === id) ? id : `${room.prefix}_${id}`
  const doc = structuredClone(saved[0].document!)
  doc.brief = saved.map(room => `${room.name}：${room.document!.brief}`).join('\n')
  doc.areas = [...new Set(saved.flatMap(room => room.document!.areas))]
  doc.result.items = saved.flatMap(room => room.document!.result.items.map(item => ({ ...structuredClone(item), id: key(room, item.id), dependencies: item.dependencies.map(id => key(room, id)) })))
  doc.result.conflicts = saved.flatMap(room => room.document!.result.conflicts.map(conflict => ({ ...conflict, id: key(room, conflict.id), itemIds: conflict.itemIds.map(id => key(room, id)) })))
  doc.reviewedIds = saved.flatMap(room => room.document!.reviewedIds.map(id => key(room, id)))
  doc.acceptedSuggestionIds = saved.flatMap(room => room.document!.acceptedSuggestionIds.map(id => key(room, id)))
  return doc
}

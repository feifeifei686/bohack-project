import { validItem, validResult } from './intake-state.ts'

const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown): value is string => typeof value === 'string'
const texts = (value: unknown): value is string[] => Array.isArray(value) && value.every(text)
const bool = (value: unknown) => typeof value === 'boolean'
const integer = (value: unknown, minimum = 0) => typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum
const id = (value: unknown) => text(value) && /^[A-Za-z0-9_-]{1,128}$/.test(value)
const choice = (value: unknown, values: readonly string[]) => text(value) && values.includes(value)
const optional = (value: unknown, check: (value: unknown) => boolean) => value === undefined || check(value)
const array = (value: unknown, check: (value: unknown) => boolean) => Array.isArray(value) && value.every(check)
const fields = (value: Record<string, unknown>, names: string[]) => names.every(name => text(value[name]))
const date = (value: unknown) => text(value) && Number.isFinite(Date.parse(value))
const dimensionNames: Record<string, string> = { safety: '安全底线', budget: '预算合理性', reserve: '预备金充足度', extras: '增项风险敞口', schedule: '工期可行性', priority: '需求优先级', information: '信息完整性', consistency: '决策一致性' }
const levels = ['low', 'medium', 'high', 'pending', 'na']

/** Optional future fields may carry passive data, never functions, accessors, exotic prototypes or cycles. */
function passiveData(value: unknown): boolean {
  const ancestors = new Set<object>()
  let visited = 0
  function visit(item: unknown, depth: number): boolean {
    if (++visited > 1_000_000 || depth > 40) return false
    if (item === null || item === undefined || typeof item === 'string' || typeof item === 'boolean') return true
    if (typeof item === 'number') return Number.isFinite(item)
    if (typeof item !== 'object' || ancestors.has(item)) return false
    const prototype = Object.getPrototypeOf(item)
    if (prototype !== Object.prototype && prototype !== Array.prototype && prototype !== null) return false
    ancestors.add(item)
    const valid = Object.values(Object.getOwnPropertyDescriptors(item)).every(descriptor => !descriptor.get && !descriptor.set && visit(descriptor.value, depth + 1))
    ancestors.delete(item)
    return valid
  }
  return visit(value, 0)
}

export function validProjectContext(value: unknown): boolean {
  return object(value) && ['household', 'schedule', 'confirmation'].every(key => {
    const field = value[key]
    return object(field) && text(field.text) && bool(field.confirmed)
  })
}
const contextEntries = (value: unknown) => array(value, item => object(item) && choice(item.id, ['household', 'schedule', 'confirmation']) && text(item.text) && bool(item.confirmed)) &&
  (value as Record<string, unknown>[]).length <= 3 && new Set((value as Record<string, unknown>[]).map(item => item.id)).size === (value as unknown[]).length
const answer = (value: unknown) => object(value) && id(value.id) && (value.targetId === null || id(value.targetId)) &&
  fields(value, ['dimension', 'question', 'answer']) && choice(value.disposition, ['answered', 'deferred'])

export function validIntakeDocument(value: unknown): boolean {
  return object(value) && value.version === 2 && text(value.brief) && texts(value.areas) &&
    array(value.answers, answer) && optional(value.projectContext, contextEntries) && validResult(value.result, 1000) &&
    array(value.acceptedSuggestionIds, id) && array(value.reviewedIds, id) && (value.adoptedAt === '' || date(value.adoptedAt))
}
function requirement(value: unknown): boolean {
  return object(value) && id(value.id) && fields(value, ['title', 'description', 'room', 'category', 'source']) &&
    choice(value.priority, ['must', 'prefer']) && texts(value.pending) && optional(value.intake, validItem)
}
function proposal(value: unknown): boolean {
  return object(value) && id(value.id) && choice(value.vendorId, ['a', 'b']) && text(value.vendorName) &&
    integer(value.version, 1) && integer(value.requirementVersion, 1) && date(value.createdAt) &&
    array(value.items, item => object(item) && id(item.requirementId) && choice(item.commitment, ['yes', 'partial', 'no', 'unknown']) && text(item.text))
}
function assessmentNote(value: unknown): boolean {
  return object(value) && fields(value, ['targetKey', 'issueId', 'fingerprint', 'owner', 'text']) && date(value.at)
}
function assessmentIssue(value: unknown): boolean {
  return object(value) && fields(value, ['id', 'title', 'reason', 'evidence', 'next', 'owner', 'fingerprint']) &&
    choice(value.dimension, Object.keys(dimensionNames)) && choice(value.level, levels) && array(value.requirementIds, id) &&
    array(value.blocks, action => choice(action, ['publish', 'select', 'construction']))
}
export function validAssessmentRun(value: unknown): boolean {
  if (!object(value) || !id(value.id) || !fields(value, ['targetKey', 'targetLabel', 'ruleVersion', 'signature']) || !date(value.at) ||
    !(value.requirementVersion === null || integer(value.requirementVersion, 1)) || !(value.proposalVersion === null || integer(value.proposalVersion, 1)) ||
    !array(value.issues, assessmentIssue) || !array(value.notes, assessmentNote) || !array(value.dimensions, item => object(item) &&
      choice(item.id, Object.keys(dimensionNames)) && item.label === dimensionNames[item.id as string] && choice(item.level, levels) && text(item.detail))) return false
  const dimensions = value.dimensions as { id: string }[]
  return dimensions.length === 8 && new Set(dimensions.map(item => item.id)).size === 8
}
function snapshot(value: unknown): boolean {
  return object(value) && integer(value.version, 1) && date(value.at) && array(value.requirements, requirement) &&
    optional(value.intakeDocument, validIntakeDocument) && optional(value.projectContext, validProjectContext) &&
    optional(value.assessment, validAssessmentRun) && optional(value.insight, object)
}
function selection(value: unknown): boolean {
  return value === null || (object(value) && proposal(value.proposal) && snapshot(value.requirements) && date(value.at) && texts(value.pending) && optional(value.assessment, validAssessmentRun))
}

/** Validate every field consumed by the restored project UI before assigning it to live state. */
export function validProjectState(value: unknown): boolean {
  try {
    if (!passiveData(value) || !object(value) || value.schema !== 1 || !text(value.brief) || !integer(value.question, -1) || !bool(value.dirty) ||
      !object(value.answers) || !fields(value.answers, ['layout', 'cleaning', 'cabinet', 'window']) || !texts(value.answers.devices) ||
      !array(value.requirements, requirement) || !array(value.snapshots, snapshot) || !array(value.proposals, proposal) ||
      !array(value.assessments, validAssessmentRun) || !array(value.assessmentNotes, assessmentNote) ||
      !array(value.feedback, item => object(item) && id(item.id) && id(item.proposalId) && integer(item.version, 1) && texts(item.items) && date(item.at)) ||
      !array(value.events, item => object(item) && text(item.text) && date(item.at)) || !selection(value.selection) ||
      !optional(value.intakeDocument, validIntakeDocument) || !optional(value.projectContext, validProjectContext)) return false
    const snapshots = value.snapshots as { version: number }[]
    const proposals = value.proposals as { id: string }[]
    // Version/source lookup must remain unambiguous after recovery.
    return new Set(snapshots.map(item => item.version)).size === snapshots.length && new Set(proposals.map(item => item.id)).size === proposals.length
  } catch { return false }
}

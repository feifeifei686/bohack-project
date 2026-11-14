import type {
  IntakeAnswer, IntakeDocument, IntakeItem, IntakeLegacyRequirement, IntakeQuestion,
  IntakeRequest, IntakeResult, IntakeScope, Necessity, IntakeProjectContextEntry,
} from './intake-contract.ts'

export type IntakeStage = 'express' | 'refine' | 'draft'
export type IntakeState = {
  schema: 2
  brief: string
  areas: string[]
  answers: IntakeAnswer[]
  projectContext?: IntakeProjectContextEntry[]
  result: IntakeResult | null
  stage: IntakeStage
  acceptedSuggestionIds: string[]
  reviewedIds: string[]
  editedIds: string[]
  needsAnalysis: boolean
  replaceAcknowledged: boolean
  revision: number
  reply: { questionId: string; selected: string[]; free: string }
}
export const scopeLabels: Record<IntakeScope, string> = { global: '全局硬装', area: '分区域需求', shared: '过渡与公共项', unassigned: '归属待定' }
export const necessityLabels: Record<Necessity, string> = { must: '必须满足', prefer: '优先偏好', optional: '可选增强', undecided: '暂不决定', excluded: '本次不做' }
export const ownerLabels = { user: '业主确认', merchant: '商家说明', site: '现场核实', professional: '专业复核', unassigned: '责任人待定' }
export const projectContextLabels = { household: '使用者与生活习惯', schedule: '居住安排与时间', confirmation: '交付与确认方式' }
const copy = <T>(value: T): T => structuredClone(value)
const unique = (values: string[]) => [...new Set(values)]

export function newIntakeState(brief = '', projectContext: IntakeProjectContextEntry[] = []): IntakeState {
  return { schema: 2, brief, areas: [], answers: [], projectContext: normalizeProjectContext(projectContext), result: null, stage: 'express', acceptedSuggestionIds: [], reviewedIds: [], editedIds: [], needsAnalysis: false, replaceAcknowledged: false, revision: 0, reply: { questionId: '', selected: [], free: '' } }
}
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown, max = 6000): v is string => typeof v === 'string' && v.length <= max
const strings = (v: unknown, max = 100): v is string[] => Array.isArray(v) && v.length <= max && v.every(x => str(x))
const safeId = (v: unknown): v is string => str(v, 64) && /^[A-Za-z0-9_-]{1,64}$/.test(v)
const evidence = (v: unknown) => Array.isArray(v) && v.length <= 20 && v.every(x => record(x) && str(x.sourceId) && str(x.quote))
const inEnum = (v: unknown, values: readonly string[]) => typeof v === 'string' && values.includes(v)
function normalizeProjectContext(value: unknown): IntakeProjectContextEntry[] {
  if (!Array.isArray(value) || value.length > 3 || !value.every(entry => record(entry) && inEnum(entry.id, Object.keys(projectContextLabels)) && str(entry.text, 1200) && entry.text.trim().length > 0 && typeof entry.confirmed === 'boolean')) throw new Error('项目背景格式不兼容')
  const entries = value as IntakeProjectContextEntry[]
  if (unique(entries.map(entry => entry.id)).length !== entries.length) throw new Error('项目背景编号不能重复')
  return entries.map(entry => ({ id: entry.id, text: entry.text.trim(), confirmed: entry.confirmed })).sort((a, b) => a.id.localeCompare(b.id))
}
/** Canonical project background is read-only here; this flow retains a snapshot for provenance. */
export function syncProjectContext(state: IntakeState, projectContext: IntakeProjectContextEntry[]): IntakeState {
  const nextContext = normalizeProjectContext(projectContext)
  const previousContext = normalizeProjectContext(state.projectContext || [])
  if (JSON.stringify(previousContext) === JSON.stringify(nextContext)) return state
  const next = copy(state)
  next.projectContext = nextContext
  next.reviewedIds = []
  next.acceptedSuggestionIds = []
  next.replaceAcknowledged = false
  next.needsAnalysis = Boolean(next.result) || next.needsAnalysis
  next.revision++
  return next
}
export function validItem(v: unknown): v is IntakeItem {
  return record(v) && safeId(v.id) && str(v.title, 200) && str(v.description) && inEnum(v.scope, Object.keys(scopeLabels)) && strings(v.areas, 20) &&
    str(v.category, 100) && str(v.component, 100) && inEnum(v.origin, ['user', 'suggestion']) && inEnum(v.necessity, Object.keys(necessityLabels)) && inEnum(v.clarity, ['clear', 'vague']) && evidence(v.evidence) && strings(v.dependencies, 30) &&
    Array.isArray(v.standards) && v.standards.length <= 30 && v.standards.every(x => record(x) && str(x.metric) && inEnum(x.kind, ['quantity', 'scope', 'functional', 'measurement', 'professional']) && (x.value === null || str(x.value)) && (x.unit === null || str(x.unit)) && inEnum(x.status, ['user_stated', 'to_measure', 'to_confirm', 'proposal_required']) && str(x.verification) && evidence(x.evidence)) &&
    Array.isArray(v.pending) && v.pending.length <= 40 && v.pending.every(x => record(x) && str(x.question) && inEnum(x.owner, Object.keys(ownerLabels)) && inEnum(x.kind, ['scope', 'necessity', 'decision', 'measurement', 'detail']) && typeof x.blocking === 'boolean')
}
export function validResult(v: unknown, maxItems = 30): v is IntakeResult {
  return record(v) && str(v.summary) && Array.isArray(v.items) && v.items.length <= maxItems && v.items.every(validItem) && unique(v.items.map(x => x.id)).length === v.items.length &&
    Array.isArray(v.questions) && v.questions.length <= 2 && v.questions.every(x => record(x) && safeId(x.id) && (x.targetId === null || safeId(x.targetId)) && str(x.dimension) && str(x.text) && str(x.reason) && strings(x.options, 8) && typeof x.allowMultiple === 'boolean' && inEnum(x.priority, ['scope', 'intent', 'global', 'dependency', 'shared', 'detail'])) &&
    Array.isArray(v.conflicts) && v.conflicts.length <= 30 && v.conflicts.every(x => record(x) && safeId(x.id) && strings(x.itemIds, 30) && str(x.message)) &&
    typeof v.readyForDraft === 'boolean' && str(v.stopReason) && strings(v.warnings, 100)
}
function validAnswer(v: unknown): v is IntakeAnswer {
  return record(v) && safeId(v.id) && (v.targetId === null || safeId(v.targetId)) && str(v.dimension) && str(v.question) && str(v.answer) && inEnum(v.disposition, ['answered', 'deferred'])
}
export function restoreIntakeState(raw: string): IntakeState {
  const value: unknown = JSON.parse(raw)
  if (!record(value) || value.schema !== 2 || !str(value.brief, 4000) || !strings(value.areas, 12) || !Array.isArray(value.answers) || !value.answers.every(validAnswer) || (value.result !== null && !validResult(value.result)) || !inEnum(value.stage, ['express', 'refine', 'draft']) || !strings(value.acceptedSuggestionIds, 30) || !strings(value.reviewedIds, 30) || !strings(value.editedIds, 30) || typeof value.needsAnalysis !== 'boolean' || typeof value.replaceAcknowledged !== 'boolean' || typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision) || !record(value.reply) || !str(value.reply.questionId) || !strings(value.reply.selected, 8) || !str(value.reply.free, 2000)) throw new Error('访谈记录格式不兼容')
  const state = value as unknown as IntakeState
  state.projectContext = normalizeProjectContext(value.projectContext ?? [])
  if (!state.result) state.stage = 'express'
  state.revision = Math.max(0, state.revision)
  return state
}
export function toIntakeRequest(state: IntakeState, mode: 'refine' | 'draft' = 'refine'): IntakeRequest {
  const request: IntakeRequest = {
    brief: state.brief.trim(), areas: unique(state.areas.map(x => x.trim()).filter(Boolean)),
    answers: [], previousItems: copy(state.result?.items || []), projectContext: copy(state.projectContext || []), mode,
  }
  // Keep the full history locally. Prioritize the latest answer and citations
  // still used by the draft before filling the remaining provider context.
  const cited = new Set(request.previousItems.flatMap(item =>
    [...item.evidence, ...item.standards.flatMap(standard => standard.evidence)]
      .filter(evidence => evidence.sourceId.startsWith('answer:')).map(evidence => evidence.sourceId.slice(7)),
  ))
  const history = [...state.answers].reverse()
  const candidates = [...history.slice(0, 1), ...history.slice(1).filter(answer => cited.has(answer.id)), ...history.slice(1).filter(answer => !cited.has(answer.id))]
  const encoder = new TextEncoder()
  let bytes = encoder.encode(JSON.stringify(request)).byteLength
  const included = new Set<string>()
  for (const answer of candidates) {
    if (included.size === 40) break
    const size = encoder.encode(JSON.stringify(answer)).byteLength + 1
    if (bytes + size > 128 * 1024) continue
    included.add(answer.id)
    bytes += size
  }
  request.answers = copy(state.answers.filter(answer => included.has(answer.id)))
  const available = (evidence: IntakeItem['evidence'][number]) => !evidence.sourceId.startsWith('answer:') || included.has(evidence.sourceId.slice(7))
  for (const item of request.previousItems) {
    item.evidence = item.evidence.filter(available)
    for (const standard of item.standards) standard.evidence = standard.evidence.filter(available)
  }
  return request
}
export function pendingQuestions(state: IntakeState): IntakeQuestion[] {
  const answered = new Set(state.answers.map(x => x.id))
  return (state.result?.questions || []).filter(question => !answered.has(question.id))
}
export function applyIntakeResult(state: IntakeState, result: IntakeResult): IntakeState {
  const next = copy(state)
  const previous = new Map((state.result?.items || []).map(item => [item.id, JSON.stringify(item)]))
  const unchanged = new Set(result.items.filter(item => previous.get(item.id) === JSON.stringify(item)).map(item => item.id))
  next.result = copy(result)
  const ids = new Set([...next.answers.map(answer => answer.id), ...result.questions.map(question => question.id)])
  for (const question of next.result.questions) {
    if (!next.answers.some(answer => answer.id === question.id && answer.question !== question.text)) continue
    let suffix = 1
    let candidate = `${question.id.slice(0, 48)}-next-${suffix}`
    while (ids.has(candidate)) candidate = `${question.id.slice(0, 48)}-next-${++suffix}`
    ids.add(candidate)
    question.id = candidate
  }
  next.reviewedIds = state.reviewedIds.filter(id => unchanged.has(id))
  next.acceptedSuggestionIds = state.acceptedSuggestionIds.filter(id => unchanged.has(id))
  next.editedIds = state.editedIds.filter(id => unchanged.has(id))
  next.needsAnalysis = false
  next.replaceAcknowledged = false
  next.reply = { questionId: '', selected: [], free: '' }
  next.revision++
  next.stage = pendingQuestions(next).length ? 'refine' : 'draft'
  return next
}
export function answerQuestion(state: IntakeState, question: IntakeQuestion, answer: string, disposition: IntakeAnswer['disposition']): IntakeState {
  if (!answer.trim()) throw new Error('请先选择或补充回答。')
  const next = copy(state)
  const entry: IntakeAnswer = { id: question.id, targetId: question.targetId, dimension: question.dimension, question: question.text, answer: answer.trim(), disposition }
  const index = next.answers.findIndex(x => x.id === question.id)
  if (index >= 0) next.answers[index] = entry
  else next.answers.push(entry)
  const affected = question.targetId
    ? new Set([question.targetId, ...(next.result?.items.filter(item => item.dependencies.includes(question.targetId!)).map(item => item.id) || [])])
    : null
  next.reviewedIds = affected ? next.reviewedIds.filter(id => !affected.has(id)) : []
  next.acceptedSuggestionIds = affected ? next.acceptedSuggestionIds.filter(id => !affected.has(id)) : []
  next.needsAnalysis = true; next.replaceAcknowledged = false; next.revision++
  next.reply = { questionId: '', selected: [], free: '' }
  return next
}
export function editIntakeItem(state: IntakeState, id: string, patch: Partial<Pick<IntakeItem, 'title' | 'description' | 'scope' | 'areas' | 'category' | 'component' | 'necessity'>>): IntakeState {
  const next = copy(state)
  const item = next.result?.items.find(x => x.id === id)
  if (!item) return next
  const descriptionChanged = patch.description !== undefined && patch.description !== item.description
  Object.assign(item, patch)
  if (item.scope === 'global' || item.scope === 'unassigned') item.areas = []
  item.areas = unique(item.areas.map(x => x.trim()).filter(Boolean)).slice(0, 12)
  if (descriptionChanged) {
    item.standards = item.standards.map(standard => standard.value !== null ? { ...standard, value: null, status: 'to_confirm' } : standard)
  }
  next.reviewedIds = next.reviewedIds.filter(x => x !== id)
  next.acceptedSuggestionIds = next.acceptedSuggestionIds.filter(x => x !== id)
  next.editedIds = unique([...next.editedIds, id])
  next.replaceAcknowledged = false; next.revision++
  return next
}
export function deferConflict(state: IntakeState, conflictId: string): IntakeState {
  const next = copy(state)
  const conflict = next.result?.conflicts.find(x => x.id === conflictId)
  if (!conflict) return next
  for (const item of next.result!.items) if (conflict.itemIds.includes(item.id)) {
    item.necessity = 'undecided'
  }
  next.reviewedIds = next.reviewedIds.filter(id => !conflict.itemIds.includes(id))
  next.replaceAcknowledged = false; next.revision++
  return next
}
export function includedItems(state: IntakeState): IntakeItem[] {
  return (state.result?.items || []).filter(item => !['undecided', 'excluded'].includes(item.necessity) && (item.origin !== 'suggestion' || state.acceptedSuggestionIds.includes(item.id)))
}
export function adoptionIssues(state: IntakeState, existingCount: number): string[] {
  const issues: string[] = []
  if (!state.result) return ['请先整理一份需求草稿。']
  if (state.needsAnalysis) issues.push('还有新表达或回答尚未整理，请先“整理最新草稿”。')
  const included = includedItems(state)
  if (!included.length) issues.push('至少保留一条已决定纳入的需求。')
  const unreviewed = included.filter(item => !state.reviewedIds.includes(item.id))
  if (unreviewed.length) issues.push(`还有 ${unreviewed.length} 条拟纳入需求需要你逐项确认。`)
  for (const item of included) {
    if (!item.title.trim() || !item.description.trim() || !item.category.trim() || !item.component.trim()) issues.push(`${item.id} 的名称、描述、工程或构件尚未填完整。`)
    if (['area', 'shared'].includes(item.scope) && !item.areas.length) issues.push(`${item.title || item.id} 需要关联区域，或改为归属待定。`)
    if (item.necessity === 'must' && (item.scope === 'unassigned' || item.pending.some(x => x.blocking && ['user', 'unassigned'].includes(x.owner)))) issues.push(`${item.title || item.id} 仍有影响方向的业主决策，请补充回答或暂缓该项。`)
  }
  const mandatory = new Set(included.filter(item => item.necessity === 'must').map(item => item.id))
  for (const conflict of state.result.conflicts) if (conflict.itemIds.some(id => mandatory.has(id))) issues.push(`需先处理冲突：${conflict.message}`)
  if (existingCount > 0 && !state.replaceAcknowledged) issues.push('请确认替换当前未发布草稿；历史版本会保留。')
  return unique(issues)
}
export function intakeDocument(state: IntakeState, adoptedAt = ''): IntakeDocument {
  if (!state.result) throw new Error('尚无需求草稿。')
  return copy({ version: 2, brief: state.brief, areas: state.areas, answers: state.answers, projectContext: state.projectContext || [], result: state.result, acceptedSuggestionIds: state.acceptedSuggestionIds, reviewedIds: state.reviewedIds, adoptedAt })
}
export function adoptionPayload(state: IntakeState, existingCount: number, now = new Date().toISOString()): { requirements: IntakeLegacyRequirement[]; document: IntakeDocument } {
  const issues = adoptionIssues(state, existingCount)
  if (issues.length) throw new Error(issues[0])
  const requirements: IntakeLegacyRequirement[] = includedItems(state).map(item => ({
    id: item.id, title: item.title.trim(), description: item.description.trim(),
    room: item.scope === 'global' ? '全屋' : item.scope === 'unassigned' ? '待定' : item.areas.join('、'),
    category: item.category, priority: item.necessity === 'must' ? 'must' : 'prefer',
    source: `${item.origin === 'suggestion' ? 'AI 建议，已由用户采纳' : '用户表达，已逐项确认'}${state.editedIds.includes(item.id) ? '；用户已编辑' : ''}`,
    pending: unique(item.pending.map(x => `${ownerLabels[x.owner]}：${x.question}`)), intake: copy(item),
  }))
  return { requirements, document: intakeDocument(state, now) }
}

/** A cancelled, edited or unmounted request can never replace newer local work. */
export class IntakeRequestGate {
  private version = 0
  private disposed = false
  begin() { return ++this.version }
  invalidate() { this.version++ }
  accepts(version: number) { return !this.disposed && version === this.version }
  dispose() { this.disposed = true; this.version++ }
}

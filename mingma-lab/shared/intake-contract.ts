/** Shared public shapes for the intake flow. No provider credentials or runtime imports. */
export type IntakeScope = 'global' | 'area' | 'shared' | 'unassigned'
export type Necessity = 'must' | 'prefer' | 'optional' | 'undecided' | 'excluded'
export type IntakeEvidence = { sourceId: string; quote: string }
export type IntakeStandard = {
  metric: string
  kind: 'quantity' | 'scope' | 'functional' | 'measurement' | 'professional'
  value: string | null
  unit: string | null
  status: 'user_stated' | 'to_measure' | 'to_confirm' | 'proposal_required'
  verification: string
  evidence: IntakeEvidence[]
}
export type IntakePending = {
  question: string
  owner: 'user' | 'merchant' | 'site' | 'professional' | 'unassigned'
  kind: 'scope' | 'necessity' | 'decision' | 'measurement' | 'detail'
  blocking: boolean
}
export type IntakeItem = {
  id: string
  title: string
  scope: IntakeScope
  areas: string[]
  category: string
  component: string
  description: string
  origin: 'user' | 'suggestion'
  necessity: Necessity
  clarity: 'clear' | 'vague'
  evidence: IntakeEvidence[]
  standards: IntakeStandard[]
  pending: IntakePending[]
  dependencies: string[]
}
export type IntakeQuestion = {
  id: string
  targetId: string | null
  dimension: string
  text: string
  reason: string
  options: string[]
  allowMultiple: boolean
  priority: 'scope' | 'intent' | 'global' | 'dependency' | 'shared' | 'detail'
}
export type IntakeAnswer = {
  id: string
  targetId: string | null
  dimension: string
  question: string
  answer: string
  disposition: 'answered' | 'deferred'
}
export type IntakeConflict = { id: string; itemIds: string[]; message: string }
export type IntakeProjectContextEntry = {
  id: 'household' | 'schedule' | 'confirmation'
  text: string
  confirmed: boolean
}
export type IntakeRequest = {
  brief: string
  areas: string[]
  answers: IntakeAnswer[]
  previousItems: IntakeItem[]
  projectContext?: IntakeProjectContextEntry[]
  mode: 'refine' | 'draft'
}
export type IntakeResult = {
  summary: string
  items: IntakeItem[]
  questions: IntakeQuestion[]
  conflicts: IntakeConflict[]
  readyForDraft: boolean
  stopReason: string
  warnings: string[]
}
export type IntakeResponse = {
  requestId: string
  data: IntakeResult
  meta: { model: string; promptVersion: string; durationMs: number; requiresHumanConfirmation: true; usage: { promptTokens: number; completionTokens: number; totalTokens: number } }
}
export type IntakeDocument = {
  version: 2
  brief: string
  areas: string[]
  answers: IntakeAnswer[]
  projectContext?: IntakeProjectContextEntry[]
  result: IntakeResult
  acceptedSuggestionIds: string[]
  reviewedIds: string[]
  adoptedAt: string
}
export type IntakeLegacyRequirement = {
  id: string; title: string; description: string; room: string; category: string
  priority: 'must' | 'prefer'; source: string; pending: string[]; intake: IntakeItem
}

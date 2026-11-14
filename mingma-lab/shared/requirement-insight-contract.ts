/** Second-pass analysis of a published requirement snapshot. Counts are derived server-side. */
export type InsightRequirement = {
  id: string; title: string; description: string; room: string; category: string
  priority: 'must' | 'prefer'; source: string; pending: string[]
}
export type RequirementInsightRequest = {
  requirementVersion: number
  requirements: InsightRequirement[]
  projectContext?: { id: 'household' | 'schedule' | 'confirmation'; text: string; confirmed: boolean }[]
}
export type InsightEvidence = { sourceId: string; quote: string }
export type InsightFinding = {
  requirementId: string; clarity: 'clear' | 'needs_detail'; rationale: string
  evidence: InsightEvidence[]; checks: string[]
}
export type InsightConnection = {
  fromId: string; toId: string; kind: 'dependency' | 'synergy' | 'tradeoff'
  reason: string; evidence: InsightEvidence[]
}
export type RequirementInsight = {
  requirementVersion: number
  summary: string
  findings: InsightFinding[]
  connections: InsightConnection[]
  nextSteps: { title: string; reason: string; requirementIds: string[] }[]
  warnings: string[]
  metrics: {
    total: number; must: number; clear: number; needsDetail: number
    connections: number; pendingChecks: number; clarityPercent: number
  }
}
export type RequirementInsightResponse = {
  requestId: string
  data: RequirementInsight
  meta: {
    model: string; promptVersion: string; durationMs: number; requiresHumanConfirmation: true
    usage: { promptTokens: number; completionTokens: number; totalTokens: number }
  }
}

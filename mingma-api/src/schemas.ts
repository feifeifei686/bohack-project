import { z } from 'zod'
import { IntakeRequestSchema, IntakeResultSchema } from './intake.ts'
import type { IntakeRequest, IntakeResult } from '../../mingma-lab/shared/intake-contract.ts'

const text = (max: number) => z.string().trim().min(1).max(max)
export const Id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)
export const Evidence = z.strictObject({ sourceId: text(80), quote: text(2000) })
export const Answer = z.strictObject({ id: Id, question: text(400), answer: text(2000) })
const contextShape = {
  room: text(40), brief: text(4000), answers: z.array(Answer).max(20).default([]),
}
export const ClarifyRequest = z.strictObject({
  ...contextShape, maxQuestions: z.number().int().min(1).max(3).default(2),
})
export const RequirementsRequest = z.strictObject(contextShape)
export const Requirement = z.strictObject({
  id: Id, title: text(100), description: text(2000), room: text(40),
  category: text(80), priority: z.enum(['must', 'prefer']),
  source: z.string().max(2000).default(''), pending: z.array(text(400)).max(15).default([]),
})
export const Proposal = z.strictObject({
  id: Id, version: z.number().int().positive(),
  requirementVersion: z.number().int().positive(), text: text(30000),
})
const reviewShape = {
  requirementVersion: z.number().int().positive(),
  requirements: z.array(Requirement).min(1).max(30), proposal: Proposal,
}
export const ReviewRequest = z.strictObject(reviewShape)
export const ExplainRequest = z.strictObject({
  ...reviewShape, focusRequirementIds: z.array(Id).max(30).default([]),
})

const warnings = z.array(text(500)).max(40)
export const ClarifyData = z.strictObject({
  summary: text(1500),
  facts: z.array(z.strictObject({ dimension: text(80), value: text(500), evidence: z.array(Evidence).min(1).max(5) })).max(30),
  questions: z.array(z.strictObject({
    id: Id, dimension: text(80), question: text(400), options: z.array(text(160)).min(2).max(6),
    allowMultiple: z.boolean(), reason: text(500),
  })).max(3),
  readyForDraft: z.boolean(), pending: z.array(text(400)).max(30), warnings,
})
export const RequirementsData = z.strictObject({
  summary: text(1500),
  requirements: z.array(Requirement.extend({
    origin: z.enum(['user', 'suggestion']), evidence: z.array(Evidence).max(5),
  })).min(1).max(30),
  pending: z.array(text(400)).max(40), warnings,
})
export const Finding = z.strictObject({
  requirementId: Id, status: z.enum(['responded', 'partial', 'conflict', 'unknown']),
  reason: text(1200), evidence: z.array(Evidence).max(8),
  missing: z.array(text(400)).max(15), action: text(800),
})
export const ReviewData = z.strictObject({
  summary: text(1500), findings: z.array(Finding).min(1).max(30),
  additionalItems: z.array(z.strictObject({
    title: text(100), classification: z.enum(['necessary_support', 'optional', 'needs_explanation']),
    reason: text(800), evidence: z.array(Evidence).min(1).max(5),
  })).max(20),
  siteChecks: z.array(text(400)).max(100), warnings,
})
export const ExplainData = z.strictObject({
  summary: text(1500),
  explanations: z.array(z.strictObject({
    requirementId: Id, plainLanguage: text(1600), impact: text(1200),
    questions: z.array(text(400)).max(10), evidence: z.array(Evidence).max(8),
  })).min(1).max(30),
  feedbackDraft: text(6000), siteChecks: z.array(text(400)).max(100), warnings,
})

export const schemas = {
  clarify: { input: ClarifyRequest, output: ClarifyData },
  requirements: { input: RequirementsRequest, output: RequirementsData },
  review: { input: ReviewRequest, output: ReviewData },
  explain: { input: ExplainRequest, output: ExplainData },
  intake: { input: IntakeRequestSchema, output: IntakeResultSchema },
} as const
export type Operation = keyof typeof schemas
export type ClarifyInput = z.infer<typeof ClarifyRequest>
export type RequirementsInput = z.infer<typeof RequirementsRequest>
export type ReviewInput = z.infer<typeof ReviewRequest>
export type ExplainInput = z.infer<typeof ExplainRequest>
export type RequestInput = ClarifyInput | RequirementsInput | ReviewInput | ExplainInput | IntakeRequest
export type ResponseData = z.infer<typeof ClarifyData> | z.infer<typeof RequirementsData> | z.infer<typeof ReviewData> | z.infer<typeof ExplainData> | IntakeResult
export const Metadata = z.strictObject({
  model: text(100), promptVersion: text(80), durationMs: z.number().nonnegative(),
  requiresHumanConfirmation: z.literal(true),
  usage: z.strictObject({ promptTokens: z.number().int().nonnegative(), completionTokens: z.number().int().nonnegative(), totalTokens: z.number().int().nonnegative() }),
})
export const ErrorResponse = z.strictObject({
  requestId: z.string().uuid(),
  error: z.strictObject({
    code: text(80), message: text(1200), retryable: z.boolean(),
    details: z.array(z.strictObject({ path: z.string(), message: z.string() })).optional(),
  }),
})
export const successSchema = (operation: Operation) => z.strictObject({ requestId: z.string().uuid(), data: schemas[operation].output, meta: Metadata })

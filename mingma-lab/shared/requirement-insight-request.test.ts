import test from 'node:test'
import assert from 'node:assert/strict'
import { validRequirementInsight } from './requirement-insight-request.ts'
import type { RequirementInsightRequest, RequirementInsightResponse } from './requirement-insight-contract.ts'

const input: RequirementInsightRequest = {
  requirementVersion: 2,
  requirements: [{ id: 'K01', title: '保留窗户', description: '本次保留厨房窗户。', room: '厨房', category: '边界', priority: 'must', source: '用户确认', pending: ['现场状态待核实'] }],
}
const response = (): RequirementInsightResponse => ({
  requestId: 'insight-test',
  data: {
    requirementVersion: 2, summary: '本次改造边界已说明。',
    findings: [{ requirementId: 'K01', clarity: 'clear', rationale: '明确保留现有窗户。', evidence: [{ sourceId: 'K01', quote: '保留厨房窗户' }], checks: ['现场状态待核实'] }],
    connections: [], nextSteps: [], warnings: [],
    metrics: { total: 1, must: 1, clear: 1, needsDetail: 0, connections: 0, pendingChecks: 1, clarityPercent: 100 },
  },
  meta: { model: 'deepseek-flash', promptVersion: 'test', durationMs: 10, requiresHumanConfirmation: true, usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } },
})
test('insight client accepts a grounded single-demand result without invented relationships', () => {
  assert(validRequirementInsight(response(), input))
})
test('insight client rejects old versions and arbitrary quantitative scores', () => {
  const old = response(); old.data.requirementVersion = 1
  assert.equal(validRequirementInsight(old, input), false)
  const inflated = response(); inflated.data.metrics.clarityPercent = 99
  assert.equal(validRequirementInsight(inflated, input), false)
})
test('insight client rejects unknown or duplicate findings and fabricated evidence', () => {
  const unknown = response(); unknown.data.findings[0].requirementId = 'K02'
  assert.equal(validRequirementInsight(unknown, input), false)
  const duplicate = response(); duplicate.data.findings.push(duplicate.data.findings[0])
  assert.equal(validRequirementInsight(duplicate, input), false)
  const forged = response(); forged.data.findings[0].evidence[0].quote = '窗户已验收'
  assert.equal(validRequirementInsight(forged, input), false)
})
test('insight client cannot lose pending site checks or accept malformed text arrays', () => {
  const lost = response(); lost.data.findings[0].checks = []; lost.data.metrics.pendingChecks = 0
  assert.equal(validRequirementInsight(lost, input), false)
  assert.equal(validRequirementInsight({ ...response(), data: { ...response().data, warnings: [null] } }, input), false)
  assert.equal(validRequirementInsight(null, input), false)
})

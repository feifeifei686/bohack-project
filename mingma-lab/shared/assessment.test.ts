import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateAssessment, assessmentIsStale, blockedIssues, type AssessmentInput, type RiskRequirement } from './assessment.ts'
import { renderAssessment } from './assessment-ui.ts'
import { canVisit } from '../versions/lucid/src/project-flow.ts'

const req = (patch: Partial<RiskRequirement> = {}): RiskRequirement => ({ id: 'K1', title: '保留厨房窗户', description: '窗户保留，不安排更换。', room: '厨房', category: '门窗', priority: 'must', pending: [], ...patch })
const input = (patch: Partial<AssessmentInput> = {}): AssessmentInput => ({ targetKey: 'draft', targetLabel: '需求草稿', requirementVersion: null, latestVersion: null, requirements: [req()], responses: [], notes: [], ...patch })
const proposal = { id: 'p1', version: 1, requirementVersion: 1, vendorName: '测试商家', items: [{ requirementId: 'K1', commitment: 'no', text: '本方案将更换窗户。' }] }

test('all eight dimensions are present and absent evidence never becomes zero or a safety pass', () => {
  const run = evaluateAssessment(input())
  assert.equal(run.dimensions.length, 8)
  for (const dimension of ['budget', 'reserve', 'extras', 'schedule', 'safety']) assert.equal(run.dimensions.find(d => d.id === dimension)?.level, 'pending')
  assert.equal(blockedIssues(run, 'publish').length, 0)
})
test('empty scope cannot be published and early assessment access does not unlock later steps', () => {
  assert.equal(blockedIssues(evaluateAssessment(input({ requirements: [] })), 'publish').length, 1)
  assert.equal(canVisit('assessment', 2), false)
  assert.equal(canVisit('assessment', 3), true)
  assert.equal(canVisit('compare', 3), false)
  assert.equal(canVisit('space', 3), false)
})
test('an explicit denial of a must item blocks selection, even without a text-rule finding', () => {
  const run = evaluateAssessment(input({ targetKey: 'proposal:p1', proposal, requirementVersion: 1, latestVersion: 1 }))
  assert.equal(blockedIssues(run, 'select').length, 1)
  assert.equal(blockedIssues(run, 'publish').length, 0)
  assert.equal(run.dimensions.find(d => d.id === 'priority')?.level, 'high')
  const preferred = evaluateAssessment(input({ proposal, requirementVersion: 1, latestVersion: 1, requirements: [req({ priority: 'prefer' })] }))
  assert.equal(blockedIssues(preferred, 'select').length, 0)
})
test('professional evidence and site checks may accompany consultation; arrangements cannot waive risks', () => {
  const original = input({ requirements: [req({ title: '拆除厨房墙体', description: '希望拆除厨房墙体，承重情况未知。', pending: ['现场测量'] })] })
  const first = evaluateAssessment(original)
  assert.equal(blockedIssues(first, 'publish').length, 0)
  assert.equal(blockedIssues(first, 'construction').length, 1)
  const safety = first.issues.find(i => i.dimension === 'safety')!
  const next = evaluateAssessment({ ...original, notes: [{ targetKey: 'draft', issueId: safety.id, fingerprint: safety.fingerprint, owner: '专业人员', text: '用户称已经安全，无需复核。', at: '2026-11-14' }] })
  assert.equal(next.notes.length, 1)
  assert.equal(blockedIssues(next, 'construction').length, 1)
  assert.equal(next.issues.find(i => i.id === safety.id)?.level, 'pending')
})
test('changed requirement, proposal, context and task data invalidate the old result', () => {
  const original = input({ proposal, requirementVersion: 1, latestVersion: 1 })
  const run = evaluateAssessment(original)
  const saved = JSON.stringify(run)
  assert.equal(assessmentIsStale(run, original), false)
  assert.equal(assessmentIsStale(run, { ...original, requirements: [req({ description: '考虑换窗。' })] }), true)
  assert.equal(assessmentIsStale(run, { ...original, proposal: { ...proposal, items: [] } }), true)
  assert.equal(assessmentIsStale(run, { ...original, context: { schedule: '下周' } }), true)
  assert.equal(assessmentIsStale(run, { ...original, notes: [{ targetKey: 'draft', issueId: 'x', fingerprint: '', owner: '商家', text: '说明', at: '' }] }), true)
  evaluateAssessment({ ...original, latestVersion: 2 })
  assert.equal(JSON.stringify(run), saved)
})
test('old proposal cannot be selected; revised source does not inherit previous task evidence', () => {
  const base = input({ targetKey: 'proposal:p1', proposal, requirementVersion: 1, latestVersion: 2 })
  assert.ok(blockedIssues(evaluateAssessment(base), 'select').some(i => i.id === 'version'))
  const issue = evaluateAssessment(base).issues.find(i => i.id === 'response:K1')!
  const notes = [{ targetKey: base.targetKey, issueId: issue.id, fingerprint: issue.fingerprint, owner: '商家', text: '原方案安排', at: '' }]
  const changed = evaluateAssessment({ ...base, notes, proposal: { ...proposal, items: [{ ...proposal.items[0], text: '不同的原文' }] } })
  assert.equal(changed.notes.length, 0)
})
test('a repaired merchant commitment clears the conflict but never certifies safety', () => {
  const fixed = evaluateAssessment(input({ proposal: { ...proposal, version: 2, items: [{ requirementId: 'K1', commitment: 'yes', text: '保留窗户。' }] }, requirementVersion: 1, latestVersion: 1,
    responses: [{ requirementId: 'K1', status: 'responded', evidence: '保留窗户。', reason: '文字回应', action: '' }] }))
  assert.equal(blockedIssues(fixed, 'select').length, 0)
  assert.equal(fixed.dimensions.find(d => d.id === 'safety')?.level, 'pending')
})
test('a newer proposal invalidates the old run and blocks selecting the old revision', () => {
  const base = input({ proposal, requirementVersion: 1, latestVersion: 1, latestProposalId: 'p1' })
  const run = evaluateAssessment(base)
  const updated = { ...base, latestProposalId: 'p2' }
  assert.equal(assessmentIsStale(run, updated), true)
  assert.ok(blockedIssues(evaluateAssessment(updated), 'select').some(i => i.id === 'proposal-version'))
})
test('user-provided markup is escaped and stale task forms cannot be submitted', () => {
  const run = evaluateAssessment(input({ requirements: [req({ title: '<img src=x onerror=alert(1)>', pending: ['<script>alert(1)</script>'] })] }))
  const html = renderAssessment(run, { targets: [{ key: 'draft', label: '<img src=x>' }], stale: true, filter: 'all', canSelect: false, isDraft: true })
  assert.ok(!html.includes('<script>') && !html.includes('<img'))
  assert.ok(html.includes('&lt;script&gt;'))
  assert.match(html, /type="submit" disabled/)
})

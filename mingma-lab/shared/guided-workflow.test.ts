import test from 'node:test'
import assert from 'node:assert/strict'
import { canVisit, unlockedStep } from '../versions/lucid/src/project-flow.ts'
import { createSampleProposal } from '../versions/lucid/src/proposal-samples.ts'
import { adoptionPayload, applyIntakeResult, newIntakeState, editIntakeItem } from './intake-state.ts'
import { confirmQuestionnaireItem, deferQuestionnaireItem, questionnaireItemIssues, questionnaireReply } from './intake-questionnaire.ts'
import type { IntakeItem } from './intake-contract.ts'

const item = (id: string, patch: Partial<IntakeItem> = {}): IntakeItem => ({ id, title: '厨房好打理', description: '墙面易擦拭。', category: '墙面', component: '饰面', scope: 'area', areas: ['厨房'], necessity: 'must', clarity: 'clear', origin: 'user', evidence: [], standards: [], pending: [], dependencies: [], ...patch })
const stateFor = (items: IntakeItem[]) => applyIntakeResult(newIntakeState('厨房想好打理'), { summary: '厨房清洁', items, questions: [], readyForDraft: true, stopReason: '', conflicts: [], warnings: [] })

test('future project routes are locked, including vendor and manually entered hashes', () => {
  assert.equal(canVisit('planning', 1), true)
  for (const page of ['clarify', 'requirements', 'compare', 'space', 'records', 'vendor', 'unknown']) assert.equal(canVisit(page, 1), false)
  assert.equal(canVisit('compare', 4), true)
  assert.equal(canVisit('vendor', 4), true)
  assert.equal(canVisit('space', 4), false)
})
test('returning to previous steps or editing drafts never relocks completed pages', () => {
  const evidence = { planningChosen: true, requirements: 2, published: 1, proposals: 2, selected: false }
  const reached = unlockedStep(1, evidence)
  assert.equal(reached, 5)
  assert.equal(unlockedStep(reached, { planningChosen: false, requirements: 0, published: 0, proposals: 0, selected: false }), 5)
  assert.equal(unlockedStep(reached, { ...evidence, selected: true }), 6)
})
test('single-item confirmation explicitly adopts suggestions and preserves site tasks', () => {
  const state = stateFor([item('n1', { origin: 'suggestion', necessity: 'prefer', pending: [{ question: '现场待测', owner: 'site', kind: 'measurement', blocking: false }] }), item('n2')])
  const next = confirmQuestionnaireItem(state, 'n1')
  assert.deepEqual(next.acceptedSuggestionIds, ['n1'])
  assert.deepEqual(next.reviewedIds, ['n1'])
  assert.equal(next.result!.items[0].pending[0].owner, 'site')
  assert.deepEqual(state.reviewedIds, [])
  assert.throws(() => adoptionPayload(next, 0), /逐项确认/)
})
test('owner decisions, missing fields, conflicts and new input still block confirmation', () => {
  const owner = item('n1', { pending: [{ question: '保留还是更换？', owner: 'user', kind: 'decision', blocking: true }] })
  assert.throws(() => confirmQuestionnaireItem(stateFor([owner]), 'n1'), /业主决策/)
  const blank = item('n1', { description: '' })
  assert.ok(questionnaireItemIssues(stateFor([blank]), blank).length)
  const conflicted = stateFor([item('n1')]); conflicted.result!.conflicts = [{ id: 'c1', itemIds: ['n1'], message: '需要取舍' }]
  assert.throws(() => confirmQuestionnaireItem(conflicted, 'n1'), /冲突/)
  const stale = stateFor([item('n1')]); stale.needsAnalysis = true
  assert.throws(() => confirmQuestionnaireItem(stale, 'n1'), /尚未整理/)
})
test('deferral retains the record without creating merchant obligations; edits revoke review', () => {
  let state = stateFor([item('n1'), item('n2', { pending: [{ question: '保留还是更换？', owner: 'user', kind: 'decision', blocking: true }] })])
  state = confirmQuestionnaireItem(state, 'n1')
  state = deferQuestionnaireItem(state, 'n2')
  const output = adoptionPayload(state, 0)
  assert.deepEqual(output.requirements.map(r => r.id), ['n1'])
  assert.equal(output.document.result.items.length, 2)
  state = editIntakeItem(state, 'n1', { description: '改成耐用优先。' })
  assert.throws(() => adoptionPayload(state, 0), /逐项确认/)
})
test('sample responses match real requirement IDs and keep versioned history immutable', () => {
  const requirements = [{ id: 'N123', title: '多区域供暖', description: '方式待现场说明。', room: '全屋', category: '供暖', priority: 'must' as const, source: '用户', pending: ['现场条件待测'] }]
  const first = createSampleProposal(requirements, 1, 'a')
  const saved = JSON.stringify(first)
  const next = createSampleProposal(requirements, 2, 'a', first)
  assert.deepEqual(first.items.map(i => i.requirementId), ['N123'])
  assert.equal(first.items[0].commitment, 'partial')
  assert.match(first.items[0].text, /演示回应/)
  assert.equal(next.requirementVersion, 2)
  assert.equal(next.version, 2)
  assert.notEqual(next.id, first.id)
  assert.equal(JSON.stringify(first), saved)
})

 test('returning to a question restores choices separately from free text', () => {
  const question = { id: 'q1', targetId: null, dimension: 'goal', text: '关心什么？', reason: '', options: ['容易擦拭', '少接缝'], allowMultiple: true, priority: 'intent' as const }
  assert.deepEqual(questionnaireReply(question, '容易擦拭、少接缝；补充：不想用深色'), { questionId: 'q1', selected: ['容易擦拭', '少接缝'], free: '不想用深色' })
  assert.deepEqual(questionnaireReply(question, '希望保留现在的墙面').selected, [])
})

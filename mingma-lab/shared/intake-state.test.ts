import test from 'node:test'
import assert from 'node:assert/strict'
import type { IntakeItem, IntakeQuestion, IntakeResult } from './intake-contract.ts'
import { adoptionIssues, adoptionPayload, answerQuestion, applyIntakeResult, deferConflict, editIntakeItem, includedItems, IntakeRequestGate, newIntakeState, pendingQuestions, restoreIntakeState, syncProjectContext, toIntakeRequest } from './intake-state.ts'

function item(id = 'N001', patch: Partial<IntakeItem> = {}): IntakeItem {
  return { id, title: '洗碗机使用需求', scope: 'area', areas: ['厨房'], category: '设备与配套', component: '洗碗机', description: '希望厨房增加洗碗机。', origin: 'user', necessity: 'must', clarity: 'clear', evidence: [{ sourceId: 'brief', quote: '增加洗碗机' }], standards: [{ metric: '安装条件说明', kind: 'functional', value: null, unit: null, status: 'proposal_required', verification: '商家分别说明安装位及配套。', evidence: [] }], pending: [{ question: '设备型号与尺寸待确认', owner: 'site', kind: 'measurement', blocking: false }], dependencies: [], ...patch }
}
const question: IntakeQuestion = { id: 'q-device', targetId: 'N001', dimension: '设备型号', text: '设备型号选好了吗？', reason: '需要确认安装条件。', options: ['已选好', '还没选', '暂不确定'], allowMultiple: false, priority: 'dependency' }
function result(items = [item()], patch: Partial<IntakeResult> = {}): IntakeResult {
  return { summary: '希望增加洗碗机，配套需要继续说明。', items, questions: [question], conflicts: [], readyForDraft: false, stopReason: '还需确认设备情况。', warnings: [], ...patch }
}
function stateFor(items = [item()]) { return applyIntakeResult(newIntakeState('厨房想增加洗碗机。'), result(items)) }

test('suggestions require explicit adoption and every included item requires individual review', () => {
  const state = stateFor([item(), item('N002', { title: '配套建议', origin: 'suggestion', necessity: 'prefer' })])
  state.reviewedIds = ['N001']
  assert.deepEqual(includedItems(state).map(x => x.id), ['N001'])
  assert.equal(adoptionIssues(state, 0).length, 0)
  state.acceptedSuggestionIds = ['N002']
  assert.ok(adoptionIssues(state, 0).some(x => x.includes('逐项确认')))
  state.reviewedIds.push('N002')
  assert.equal(adoptionIssues(state, 0).length, 0)
})

test('undecided and excluded items remain in the document but never become merchant obligations', () => {
  const state = stateFor([item(), item('N002', { necessity: 'undecided' }), item('N003', { necessity: 'excluded' })])
  state.reviewedIds = ['N001']
  const output = adoptionPayload(state, 0, '2026-11-14T00:00:00.000Z')
  assert.deepEqual(output.requirements.map(x => x.id), ['N001'])
  assert.equal(output.document.result.items.length, 3)
  assert.equal(output.document.adoptedAt, '2026-11-14T00:00:00.000Z')
})

test('existing draft replacement needs acknowledgement and cannot mutate prior snapshots', () => {
  const state = stateFor()
  state.reviewedIds = ['N001']
  const oldSnapshot = structuredClone(state.result!.items)
  assert.throws(() => adoptionPayload(state, 4), /替换当前未发布草稿/)
  state.replaceAcknowledged = true
  const payload = adoptionPayload(state, 4)
  payload.requirements[0]!.intake.description = 'changed in caller'
  payload.document.result.items[0]!.pending[0]!.question = 'changed in caller'
  assert.deepEqual(state.result!.items, oldSnapshot)
})

test('mandatory conflict is blocked and explicit deferral keeps a visible decision record', () => {
  let state = stateFor([item(), item('N002', { title: '不改造厨房', description: '厨房保持现状。' })])
  state.result!.conflicts = [{ id: 'c1', itemIds: ['N001', 'N002'], message: '厨房新增设备与完全保持现状需要取舍。' }]
  state.reviewedIds = ['N001', 'N002']
  assert.ok(adoptionIssues(state, 0).some(x => x.includes('需先处理冲突')))
  state = deferConflict(state, 'c1')
  assert.deepEqual(state.result!.items.map(x => x.necessity), ['undecided', 'undecided'])
  assert.equal(state.result!.conflicts.length, 1)
  assert.equal(state.result!.conflicts[0]!.message, '厨房新增设备与完全保持现状需要取舍。')
  assert.equal(includedItems(state).length, 0)
})

test('unresolved owner direction cannot be published as a mandatory requirement', () => {
  const state = stateFor([item('N001', { pending: [{ question: '保留还是更换？', owner: 'user', kind: 'decision', blocking: true }] })])
  state.reviewedIds = ['N001']
  assert.ok(adoptionIssues(state, 0).some(x => x.includes('业主决策')))
  state.result!.items[0]!.necessity = 'undecided'
  assert.equal(includedItems(state).length, 0)
})

test('a changed answer invalidates target and dependent confirmations even if the model returns unchanged JSON', () => {
  let state = stateFor([item(), item('N002', { origin: 'suggestion', necessity: 'prefer', dependencies: ['N001'] }), item('N003')])
  state.reviewedIds = ['N001', 'N002', 'N003']; state.acceptedSuggestionIds = ['N002']
  const sameResult = structuredClone(state.result!)
  state = answerQuestion(state, question, '改成不安装洗碗机。', 'answered')
  assert.deepEqual(state.reviewedIds, ['N003']); assert.deepEqual(state.acceptedSuggestionIds, [])
  assert.ok(state.needsAnalysis)
  state = applyIntakeResult(state, sameResult)
  assert.deepEqual(state.reviewedIds, ['N003'])
  assert.ok(adoptionIssues(state, 0).some(x => x.includes('逐项确认')))
})

test('a global answer revokes all prior confirmations and suggestion adoptions', () => {
  let state = stateFor([item(), item('N002', { origin: 'suggestion', necessity: 'prefer' })])
  state.reviewedIds = ['N001', 'N002']; state.acceptedSuggestionIds = ['N002']
  state = answerQuestion(state, { ...question, targetId: null }, '本次只处理客厅。', 'answered')
  assert.deepEqual(state.reviewedIds, []); assert.deepEqual(state.acceptedSuggestionIds, [])
})

test('model revisions revoke changed item confirmations, retain unchanged review, and do not mutate input', () => {
  let state = stateFor([item(), item('N002')])
  state.reviewedIds = ['N001', 'N002']
  const original = structuredClone(state)
  const updated = structuredClone(state.result!); updated.items[0]!.description = '新的使用目标。'
  state = applyIntakeResult(state, updated)
  assert.deepEqual(state.reviewedIds, ['N002'])
  assert.equal(original.result!.items[0]!.description, '希望厨房增加洗碗机。')
})

test('manual description changes clear old numeric targets and require fresh review', () => {
  let state = stateFor([item('N001', { origin: 'suggestion', necessity: 'prefer', standards: [{ metric: '设备数量', kind: 'quantity', value: '3', unit: '台', status: 'user_stated', verification: '按清单核对', evidence: [{ sourceId: 'brief', quote: '3台' }] }] })])
  state.acceptedSuggestionIds = ['N001']; state.reviewedIds = ['N001']
  state = editIntakeItem(state, 'N001', { description: '暂时不决定设备数量。' })
  assert.equal(state.result!.items[0]!.standards[0]!.value, null)
  assert.equal(state.result!.items[0]!.standards[0]!.status, 'to_confirm')
  assert.deepEqual(state.reviewedIds, []); assert.deepEqual(state.acceptedSuggestionIds, [])
  assert.ok(state.editedIds.includes('N001'))
})

test('shared items are adopted once and multiple areas stay associated', () => {
  const state = stateFor([item('N001', { scope: 'shared', areas: ['客厅', '公共走道'], necessity: 'prefer' })])
  state.reviewedIds = ['N001']
  const output = adoptionPayload(state, 0)
  assert.equal(output.requirements.length, 1)
  assert.equal(output.requirements[0]!.room, '客厅、公共走道')
  assert.deepEqual(output.requirements[0]!.intake.areas, ['客厅', '公共走道'])
})

test('editing and deferring a full pending list never exceed the API budget or discard site items', () => {
  const pending = Array.from({ length: 12 }, (_, i) => ({ question: `现场核实 ${i + 1}`, owner: 'site' as const, kind: 'measurement' as const, blocking: false }))
  let state = stateFor([item('N001', { pending })])
  state.result!.conflicts = [{ id: 'c1', itemIds: ['N001'], message: '范围需要取舍' }]
  state = editIntakeItem(state, 'N001', { description: '用户修改后的需求。' })
  state = deferConflict(state, 'c1')
  assert.deepEqual(state.result!.items[0]!.pending, pending)
  assert.equal(toIntakeRequest(state).previousItems[0]!.pending.length, 12)
  assert.equal(state.result!.conflicts[0]!.message, '范围需要取舍')
})

test('deferred answers are saved as answers and not converted into materials or equipment', () => {
  const state = answerQuestion(stateFor(), question, '暂时跳过，保留为待确认。', 'deferred')
  assert.equal(pendingQuestions(state).length, 0)
  assert.equal(state.answers[0]!.disposition, 'deferred')
  const request = toIntakeRequest(state)
  assert.equal(request.answers[0]!.answer, '暂时跳过，保留为待确认。')
  assert.deepEqual(request.previousItems, state.result!.items)
  request.previousItems[0]!.title = 'caller changed'
  assert.notEqual(state.result!.items[0]!.title, 'caller changed')
})

test('restoration rejects malformed records and preserves a valid interrupted draft', () => {
  const state = answerQuestion(stateFor(), question, '还没选型号。', 'answered')
  assert.deepEqual(restoreIntakeState(JSON.stringify(state)), state)
  assert.throws(() => restoreIntakeState('{broken'))
  assert.throws(() => restoreIntakeState(JSON.stringify({ ...state, result: { items: 'not-an-array' } })))
})

test('cancel, newer requests and unmount all reject late results', () => {
  const gate = new IntakeRequestGate()
  const first = gate.begin(); assert.equal(gate.accepts(first), true)
  gate.invalidate(); assert.equal(gate.accepts(first), false)
  const second = gate.begin(); const third = gate.begin()
  assert.equal(gate.accepts(second), false); assert.equal(gate.accepts(third), true)
  gate.dispose(); assert.equal(gate.accepts(third), false)
})

test('legacy conversation records restore with empty background and keep their existing draft', () => {
  const original = stateFor()
  const legacy = structuredClone(original)
  delete legacy.projectContext
  const restored = restoreIntakeState(JSON.stringify(legacy))
  assert.deepEqual(restored.projectContext, [])
  assert.deepEqual(restored.result, original.result)
  assert.deepEqual(restored.answers, original.answers)
})

test('canonical background changes revoke prior confirmations without overwriting answers or results', () => {
  const original = stateFor([item(), item('N002', { origin: 'suggestion', necessity: 'prefer' })])
  original.reviewedIds = ['N001', 'N002']; original.acceptedSuggestionIds = ['N002']; original.replaceAcknowledged = true
  const previous = structuredClone(original)
  const updated = syncProjectContext(original, [{ id: 'household', text: '3人常住，每天做饭。', confirmed: true }])
  assert.deepEqual(updated.reviewedIds, []); assert.deepEqual(updated.acceptedSuggestionIds, [])
  assert.equal(updated.replaceAcknowledged, false); assert.equal(updated.needsAnalysis, true)
  assert.deepEqual(updated.result, original.result); assert.deepEqual(updated.answers, original.answers)
  assert.deepEqual(original, previous)
  const afterModel = applyIntakeResult(updated, structuredClone(original.result!))
  assert.deepEqual(afterModel.reviewedIds, [], 'unchanged model JSON cannot restore stale user confirmation')
})

test('unchanged project background does not force reanalysis or clear confirmed requirements', () => {
  let state = syncProjectContext(stateFor(), [{ id: 'schedule', text: '施工时继续居住。', confirmed: false }, { id: 'household', text: '两人常住。', confirmed: true }])
  state.needsAnalysis = false; state.reviewedIds = ['N001']
  const same = syncProjectContext(state, [{ id: 'household', text: '两人常住。', confirmed: true }, { id: 'schedule', text: '施工时继续居住。', confirmed: false }])
  assert.equal(same, state)
  assert.equal(same.needsAnalysis, false); assert.deepEqual(same.reviewedIds, ['N001'])
})

test('removing canonical background removes its request snapshot and preserves the old document', () => {
  let state = syncProjectContext(stateFor(), [{ id: 'household', text: '三人常住。', confirmed: true }])
  state.needsAnalysis = false; state.reviewedIds = ['N001']
  const old = adoptionPayload(state, 0).document
  state = syncProjectContext(state, [])
  assert.deepEqual(toIntakeRequest(state).projectContext, [])
  assert.equal(state.needsAnalysis, true)
  assert.equal(old.projectContext?.[0]?.text, '三人常住。')
})

test('background snapshots stay separate from the forty-answer budget and are copied on export', () => {
  let state = syncProjectContext(stateFor(), [{ id: 'confirmation', text: '先看逐项说明，由业主确认。', confirmed: false }])
  state.answers = Array.from({ length: 40 }, (_, i) => ({ ...question, id: `q${i}`, question: '已回答问题', answer: '已回答', disposition: 'answered' as const }))
  state.needsAnalysis = false; state.reviewedIds = ['N001']
  const request = toIntakeRequest(state)
  assert.equal(request.answers.length, 40); assert.equal(request.projectContext?.length, 1)
  request.projectContext![0]!.text = 'caller changed'
  assert.equal(state.projectContext![0]!.text, '先看逐项说明，由业主确认。')
  const exported = adoptionPayload(state, 0).document
  exported.projectContext![0]!.text = 'export changed'
  assert.equal(state.projectContext![0]!.text, '先看逐项说明，由业主确认。')
})

test('invalid or duplicate saved project background is rejected instead of silently changing sources', () => {
  const state = stateFor()
  assert.throws(() => restoreIntakeState(JSON.stringify({ ...state, projectContext: [{ id: 'unknown', text: '内容', confirmed: true }] })), /项目背景/)
  const entry = { id: 'household' as const, text: '两人常住。', confirmed: true }
  assert.throws(() => syncProjectContext(state, [entry, entry]), /编号不能重复/)
  assert.throws(() => syncProjectContext(state, [{ ...entry, text: '' }]), /格式不兼容/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { validProjectState } from './project-session-validation.ts'
import { buildRequirements, seedProposals } from '../versions/lucid/src/domain.ts'
import { newIntakeState, applyIntakeResult, adoptionPayload } from './intake-state.ts'
import { initializeProjectContext } from './requirements-hub.ts'
import { evaluateAssessment } from './assessment.ts'
import { createProjectStorage } from '../versions/lucid/src/project-storage.ts'
import type { IntakeResult } from './intake-contract.ts'

const at = '2026-11-14T06:00:00.000Z'
function empty(): Record<string, any> {
  return { schema: 1, assessments: [], assessmentNotes: [], brief: '', answers: { layout: '', devices: [], cleaning: '', cabinet: '', window: '' }, question: -1, requirements: [], snapshots: [], proposals: [], feedback: [], selection: null, events: [], dirty: false }
}
function demo() {
  const state = empty()
  state.answers = { layout: '保留现有布局', devices: ['洗碗机'], cleaning: '容易擦拭、减少接缝', cabinet: '不要开放展示格', window: '保留现有窗' }
  state.requirements = buildRequirements('', state.answers)
  state.projectContext = initializeProjectContext(undefined, {})
  state.snapshots = [{ version: 1, requirements: structuredClone(state.requirements), projectContext: structuredClone(state.projectContext), at }]
  state.proposals = seedProposals(state.requirements, 1)
  state.events = [{ text: '生成演示', at }]
  state.feedback = [{ id: 'feedback1', proposalId: state.proposals[0].id, version: 1, items: ['K02'], at }]
  const run = evaluateAssessment({ targetKey: 'draft', targetLabel: '当前需求', requirementVersion: 1, latestVersion: 1, requirements: state.requirements, responses: [], notes: [] }, at)
  state.assessments = [run]
  state.snapshots[0].assessment = structuredClone(run)
  state.selection = { proposal: structuredClone(state.proposals[0]), requirements: structuredClone(state.snapshots[0]), at, pending: ['待核实接口'], assessment: structuredClone(run) }
  return state
}
function aiProject() {
  const result: IntakeResult = {
    summary: '保留浴室柜', readyForDraft: true, stopReason: '', warnings: [], questions: [], conflicts: [],
    items: [{ id: 'N1', title: '保留现有浴室柜', description: '施工期间保护现有浴室柜', scope: 'area', areas: ['卫生间'], category: '保留', component: '浴室柜', origin: 'user', necessity: 'must', clarity: 'clear', evidence: [{ sourceId: 'brief', quote: '保留浴室柜' }], standards: [], pending: [], dependencies: [] }],
  }
  const intake = applyIntakeResult(newIntakeState('保留浴室柜'), result)
  intake.areas = ['卫生间']
  intake.reviewedIds = ['N1']
  const adopted = adoptionPayload(intake, 0, at)
  const state = empty()
  state.brief = intake.brief
  state.requirements = adopted.requirements
  state.intakeDocument = adopted.document
  state.snapshots = [{ version: 1, requirements: structuredClone(state.requirements), intakeDocument: structuredClone(adopted.document), at }]
  return state
}

test('empty, published demo, complete assessment and adopted AI projects are restorable', () => {
  for (const project of [empty(), demo(), aiProject()]) assert.equal(validProjectState(project), true)
})

test('missing intake metadata is rejected even when the AI result itself is valid', () => {
  for (const mutate of [
    (state: Record<string, any>) => { delete state.intakeDocument.acceptedSuggestionIds },
    (state: Record<string, any>) => { state.intakeDocument.projectContext = {} },
    (state: Record<string, any>) => { state.intakeDocument.answers = [null] },
    (state: Record<string, any>) => { state.snapshots[0].intakeDocument.reviewedIds = null },
    (state: Record<string, any>) => { state.intakeDocument.version = 1 },
    (state: Record<string, any>) => { state.intakeDocument.adoptedAt = 'bad date' },
  ]) {
    const state = aiProject(); mutate(state)
    assert.equal(validProjectState(state), false)
  }
})

test('all assessment consumption paths reject broken nested records before rendering', () => {
  for (const mutate of [
    (state: Record<string, any>) => { state.assessments[0].issues = [null] },
    (state: Record<string, any>) => { state.assessments[0].issues[0].blocks = null },
    (state: Record<string, any>) => { state.assessments[0].dimensions[0] = null },
    (state: Record<string, any>) => { state.assessments[0].dimensions[0].label = '<img onerror=alert(1)>' },
    (state: Record<string, any>) => { state.assessmentNotes = [null] },
    (state: Record<string, any>) => { state.snapshots[0].assessment.notes = [{ issueId: 'x' }] },
    (state: Record<string, any>) => { state.selection.assessment.issues = [null] },
    (state: Record<string, any>) => { state.selection.requirements.assessment.dimensions = [] },
  ]) {
    const state = demo(); mutate(state)
    assert.equal(validProjectState(state), false)
  }
})

test('nested historical context, proposal dates and version references are validated', () => {
  for (const mutate of [
    (state: Record<string, any>) => { state.snapshots[0].projectContext.household = null },
    (state: Record<string, any>) => { state.selection.proposal.items[0].commitment = 'maybe' },
    (state: Record<string, any>) => { delete state.proposals[0].createdAt },
    (state: Record<string, any>) => { state.snapshots.push(structuredClone(state.snapshots[0])) },
    (state: Record<string, any>) => { state.proposals.push(structuredClone(state.proposals[0])) },
    (state: Record<string, any>) => { state.requirements[0].id = '\" onfocus=\"evil' },
  ]) {
    const state = demo(); mutate(state)
    assert.equal(validProjectState(state), false)
  }
})

test('optional insight extensions remain passive, and getters are never evaluated', () => {
  const state = demo()
  state.snapshots[0].insight = { requestId: 'test', futureVersion: { values: ['extra data', 2, null] } }
  assert.equal(validProjectState(state), true, 'semantic insight version checks remain the insight decoder’s responsibility')
  state.snapshots[0].insight.execute = () => assert.fail('must never execute')
  assert.equal(validProjectState(state), false)
  delete state.snapshots[0].insight.execute
  Object.defineProperty(state.snapshots[0].insight, 'execute', { enumerable: true, get() { assert.fail('getter must not execute') } })
  assert.equal(validProjectState(state), false)
  const cyclic = empty(); cyclic.self = cyclic
  assert.equal(validProjectState(cyclic), false)
})

test('a malformed nested document locks the project store without overwriting the source record', async () => {
  const state = aiProject()
  delete state.intakeDocument.acceptedSuggestionIds
  const envelope = { schema: 1, savedAt: at, data: state }
  const store = createProjectStorage({
    decode(value) { if (!validProjectState(value)) throw new Error('项目草稿格式无法读取'); return value },
    backend: { read: async () => envelope, write: async () => assert.fail('must not overwrite'), remove: async () => assert.fail('must not remove') },
  })
  await assert.rejects(store.load(), /格式无法读取/)
  await assert.rejects(store.save(empty()), /保护原记录/)
  assert.deepEqual(await store.readRaw(), envelope)
})

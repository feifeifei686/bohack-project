import test from 'node:test'
import assert from 'node:assert/strict'
import { workflowTask, type WorkflowFacts } from '../versions/lucid/src/workflow-action.ts'
const facts: WorkflowFacts = { page: 'planning', roomCount: 5, requirementCount: 0, published: false, dirty: false, contextChanged: false, currentProposal: false, currentSelection: false, choosingProposal: false }
test('workflow never treats an in-progress build or absent rooms as ready to enter the questionnaire', () => {
  assert.equal(workflowTask({ ...facts, planningStage: 'building' }).action, 'wait-planning')
  assert.equal(workflowTask({ ...facts, recognizing: true }).busy, true)
  assert.equal(workflowTask({ ...facts, roomCount: 0 }).action, 'need-rooms')
  assert.equal(workflowTask({ ...facts, planningStage: 'model', roomName: '厨房' }).action, 'enter-room')
})
test('changed context requires a fresh draft while an optional failed insight does not block comparison', () => {
  const published = { ...facts, page: 'requirements' as const, requirementCount: 3, published: true }
  assert.equal(workflowTask({ ...published, contextChanged: true, dirty: true }).action, 'clarify')
  assert.equal(workflowTask({ ...published, dirty: true }).action, 'publish')
  assert.equal(workflowTask({ ...published, insight: 'error' }).action, 'compare')
})
test('current proposals unlock preview but never automatically select a merchant', () => {
  assert.equal(workflowTask({ ...facts, page: 'compare' }).action, 'need-proposal')
  assert.equal(workflowTask({ ...facts, page: 'compare', currentProposal: true }).action, 'space')
  assert.equal(workflowTask({ ...facts, page: 'space', currentProposal: true }).action, 'choose-proposal')
  assert.equal(workflowTask({ ...facts, page: 'compare', currentProposal: true, choosingProposal: true }).action, 'choose-proposal')
  assert.equal(workflowTask({ ...facts, page: 'space', currentSelection: true }).action, 'records')
})

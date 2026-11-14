import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newPreferences, preferenceQuestions, preferenceBrief, preferenceContext, selectPreference, preferenceRooms, validPreferences, restorePreferencePosition, selectedPreferences } from './intake-preferences.ts'
import { newIntakeState, restoreIntakeState, toIntakeRequest } from './intake-state.ts'
import type { PlanningModel } from './planning-floorplan.ts'
const bathroom = { id: 'bath-a', name: '卫生间 A' }
const kitchen = { id: 'kitchen', name: '厨房' }
const model: PlanningModel = { recognized: true, rooms: [{ ...bathroom, bounds: [0, 0, 3, 4], label: [1, 1], material: 'tile' }], furniture: [{ id: 'tub', roomId: 'bath-a', kind: 'bathtub', bounds: [0, 0, 1, 2], rotation: 0, confidence: .8 }, { id: 'bed', roomId: 'another', kind: 'bed', bounds: [4, 0, 2, 2], rotation: 0, confidence: .9 }] }

test('room-specific choices use actual room names and do not invent rooms', () => {
  assert.deepEqual(preferenceRooms(model).map(r => r.name), ['卫生间 A', '全屋与公共需求'])
  const draft = newPreferences(bathroom.id)
  assert.ok(preferenceQuestions(bathroom, draft)[0].options.some(o => o.id === 'shower'))
  assert.ok(!preferenceQuestions(kitchen, draft)[0].options.some(o => o.id === 'shower'))
  assert.ok(preferenceQuestions(kitchen, draft)[0].options.some(o => o.id === 'appliance'))
})
test('floor details are conditional and no scale answer is preselected', () => {
  let d = newPreferences(bathroom.id)
  assert.ok(!preferenceQuestions(bathroom, d).some(q => q.scale))
  d = selectPreference(d, preferenceQuestions(bathroom, d)[0], 'floor', true)
  assert.deepEqual(preferenceQuestions(bathroom, d).filter(q => q.scale).map(q => q.id), ['floor-hardness', 'floor-cleaning', 'floor-slip'])
  assert.equal(d.answers['floor-hardness'], undefined)
})
test('unknown and no-retention are exclusive while regular options support multiple choices', () => {
  let d = newPreferences(bathroom.id)
  const q = preferenceQuestions(bathroom, d).find(q => q.id === 'retention')!
  d = selectPreference(d, q, 'floor', true)
  d = selectPreference(d, q, 'doors', true)
  assert.deepEqual(d.answers.retention, ['floor', 'doors'])
  d = selectPreference(d, q, 'none', true)
  assert.deepEqual(d.answers.retention, ['none'])
  d = selectPreference(d, q, 'unknown', true)
  assert.deepEqual(d.answers.retention, ['unknown'])
  d = selectPreference(d, q, 'doors', true)
  assert.deepEqual(d.answers.retention, ['doors'])
})
test('hidden dependent answers are excluded from the AI brief after a goal changes', () => {
  const d = newPreferences(bathroom.id)
  d.answers = { goals: ['floor'], 'floor-hardness': ['5'], 'floor-cleaning': ['4'] }
  assert.match(preferenceBrief(bathroom, d), /5\/5（偏硬实）/)
  d.answers.goals = ['lighting']
  assert.doesNotMatch(preferenceBrief(bathroom, d), /偏硬实|5\/5/)
})
test('furniture hints are restricted to the recognized room and never pre-adopted', () => {
  const d = newPreferences(bathroom.id)
  const retention = preferenceQuestions(bathroom, d, model).find(q => q.id === 'retention')!
  assert.ok(retention.options.some(o => o.id === 'seen-bathtub'))
  assert.ok(!retention.options.some(o => o.id === 'seen-bed'))
  assert.match(preferenceContext(model, bathroom), /请核对/)
  assert.doesNotMatch(preferenceBrief(bathroom, d, model), /浴缸/)
  assert.ok(!preferenceQuestions(bathroom, d, { ...model, recognized: false }).find(q => q.id === 'retention')!.options.some(o => o.id === 'seen-bathtub'))
})
test('choices preserve uncertainty and explicitly describe scale values as preferences', () => {
  const d = newPreferences(bathroom.id)
  d.answers = { goals: ['floor'], users: ['unknown'], 'floor-hardness': ['2'], 'floor-slip': ['unknown'] }
  const brief = preferenceBrief(bathroom, d)
  assert.match(brief, /主观偏好，不是工程参数/)
  assert.match(brief, /2\/5（稍柔软）/)
  assert.match(brief, /防滑表现.*暂不确定/)
  const state = newIntakeState(brief)
  state.preferences = d
  assert.equal(toIntakeRequest(state).brief, brief)
  assert.equal('preferences' in toIntakeRequest(state), false)
})
test('old drafts remain readable and new questionnaire drafts restore choices and cursor', () => {
  const state = newIntakeState('原有表达要保留')
  assert.equal(restoreIntakeState(JSON.stringify(state)).brief, '原有表达要保留')
  state.preferences = { ...newPreferences('bath-a', state.brief), cursor: 3, answers: { goals: ['floor'] } }
  assert.deepEqual(restoreIntakeState(JSON.stringify(state)).preferences, state.preferences)
  assert.equal(validPreferences({ ...state.preferences, answers: { goals: 'floor' } }), false)
  assert.throws(() => restoreIntakeState(JSON.stringify({ ...state, preferences: { version: 9 } })))
})
test('long notes are retained for editing and the combined brief can be checked without truncation', () => {
  const draft = newPreferences('bath-a', '长'.repeat(4000))
  assert.ok(validPreferences(draft))
  assert.ok(preferenceBrief(bathroom, draft).length > 4000)
})

test('storage digs into contents, pain and access with room-specific second-level details', () => {
  const room = { id: 'bed', name: '主卧' }
  const d = newPreferences(room.id)
  d.answers = { goals: ['storage'], 'storage-items': ['hanging'] }
  const questions = preferenceQuestions(room, d)
  for (const id of ['usage', 'pain', 'storage-items', 'storage-problem', 'storage-access', 'wardrobe', 'priority', 'tradeoff']) assert.ok(questions.some(q => q.id === id), id)
  assert.ok(!questions.some(q => q.id === 'floor-hardness'))
  d.answers.goals = ['lighting']
  d.answers.wardrobe = ['hang']
  assert.doesNotMatch(preferenceBrief(room, d), /多留挂衣空间/)
})
test('kitchen equipment choices unfold matching habits and disappear from current evidence when removed', () => {
  const d = newPreferences(kitchen.id)
  d.answers = { goals: ['appliance'], appliance: ['dishwasher'], 'dishwasher-use': ['pots'] }
  assert.ok(preferenceQuestions(kitchen, d).some(q => q.id === 'dishwasher-use'))
  assert.ok(!preferenceQuestions(kitchen, d).some(q => q.id === 'oven-use'))
  assert.match(preferenceBrief(kitchen, d), /锅具等大件清洗/)
  d.answers.appliance = ['oven']
  assert.ok(preferenceQuestions(kitchen, d).some(q => q.id === 'oven-use'))
  assert.doesNotMatch(preferenceBrief(kitchen, d), /锅具等大件清洗/)
})
test('family accessibility answers unfold a night-light branch without inventing professional needs', () => {
  const d = newPreferences('r')
  d.answers = { users: ['senior'], accessibility: ['night'], 'night-light': ['sensor'] }
  assert.ok(preferenceQuestions(bathroom, d).some(q => q.id === 'night-light'))
  assert.match(preferenceBrief(bathroom, d), /经过时自动亮起/)
  d.answers.users = ['adult']
  assert.ok(!preferenceQuestions(bathroom, d).some(q => q.id === 'accessibility'))
  assert.doesNotMatch(preferenceBrief(bathroom, d), /经过时自动亮起/)
})
test('priority follows current goals and never silently keeps a deselected goal as the top priority', () => {
  const d = newPreferences('r')
  d.answers = { goals: ['floor', 'storage'], priority: ['floor'] }
  let priority = preferenceQuestions(bathroom, d).find(q => q.id === 'priority')!
  assert.equal(selectedPreferences(priority, d)[0].id, 'floor')
  d.answers.goals = ['storage']
  priority = preferenceQuestions(bathroom, d).find(q => q.id === 'priority')!
  assert.equal(selectedPreferences(priority, d).length, 0)
})
test('legacy first-stage cursor migrates to the same question and completed summaries expose new unanswered questions', () => {
  const legacy = { version: 1 as const, roomId: bathroom.id, cursor: 4, answers: { goals: ['floor'], users: ['adult'], extent: ['refresh'], 'floor-hardness': ['4'] }, note: '原补充' }
  const restored = restorePreferencePosition(legacy, bathroom)
  assert.equal(restored.stepId, 'floor-hardness')
  assert.equal(preferenceQuestions(bathroom, restored)[restored.cursor - 1].id, 'floor-hardness')
  assert.equal(restored.note, '原补充')
  assert.equal(restored.answers.usage, undefined)
  const summary = restorePreferencePosition({ ...legacy, cursor: 8 }, bathroom)
  assert.equal(summary.stepId, 'summary')
  assert.equal(summary.cursor, preferenceQuestions(bathroom, summary).length + 1)
})
test('stable question IDs preserve position as earlier conditional questions are inserted', () => {
  const d = newPreferences(bathroom.id)
  d.cursor = 8; d.stepId = 'storage-items'; d.answers = { goals: ['storage'] }
  const a = restorePreferencePosition(d, bathroom)
  const b = restorePreferencePosition({ ...a, answers: { ...a.answers, goals: ['floor', 'storage'] } }, bathroom)
  assert.equal(b.stepId, 'storage-items')
  assert.ok(b.cursor > a.cursor)
})
test('fully explored room paths have bounded, distinct questions and fit the existing request budget', () => {
  for (const name of ['卫生间', '厨房', '卧室', '客厅', '餐厅', '玄关', '阳台', '书房', '全屋与公共需求']) {
    const room = { id: 'r', name }, d = newPreferences('r')
    for (let n = 0; n < 4; n++) for (const q of preferenceQuestions(room, d)) {
      const options = q.options.filter(o => !['unknown', 'none'].includes(o.id))
      d.answers[q.id] = q.multiple ? options.map(o => o.id) : [q.scale ? '5' : q.id === 'shower' ? 'screen' : options.reduce((a, b) => a.label.length > b.label.length ? a : b).id]
    }
    const qs = preferenceQuestions(room, d)
    assert.ok(qs.length >= 20 && qs.length < 100, name)
    assert.equal(new Set(qs.map(q => q.id)).size, qs.length, name)
    assert.ok(qs.every(q => q.options.some(o => o.id === 'unknown') && q.group), name)
    assert.ok(preferenceBrief(room, d).length < 4000, name)
    assert.ok(validPreferences({ ...d, cursor: qs.length + 1 }), name)
  }
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { choiceOnlyQuestion, choiceOnlyAnswer, questionnaireReply } from './intake-questionnaire.ts'
import { newPreferences, preferenceBrief, validPreferences } from './intake-preferences.ts'
import { preferencesMarkup } from './intake-preferences-ui.ts'
import type { IntakeQuestion } from './intake-contract.ts'
const base: IntakeQuestion = { id: 'q', targetId: null, dimension: 'goal', text: '希望改善什么？', reason: '', options: [], allowMultiple: true, priority: 'intent' }
test('AI follow-up has selectable uncertainty even without useful provider options', () => {
  assert.deepEqual(choiceOnlyQuestion(base).options, ['暂不确定', '以上选项都不适合'])
  assert.deepEqual(choiceOnlyQuestion({ ...base, options: ['保留', '其他（请填写）', '暂不确定'] }).options, ['保留', '暂不确定', '以上选项都不适合'])
})
test('choice answers exclude free text and defer mismatched or unknown preferences', () => {
  const q = choiceOnlyQuestion({ ...base, options: ['保留', '局部更换'] })
  assert.deepEqual(choiceOnlyAnswer(q, ['保留', '伪造选项']), { answer: '保留', disposition: 'answered' })
  assert.deepEqual(choiceOnlyAnswer(q, ['保留', '以上选项都不适合']), { answer: '以上选项都不适合', disposition: 'deferred' })
  assert.deepEqual(choiceOnlyAnswer({ ...q, allowMultiple: false }, ['保留', '局部更换']), { answer: '保留', disposition: 'answered' })
})
test('initial and summary screens have only choices; old notes are escaped read-only records', () => {
  const room = { id: 'bath', name: '卫生间' }
  const draft = newPreferences(room.id, '<img src=x onerror=alert(1)>')
  for (const cursor of [0, 100]) {
    const markup = preferencesMarkup({ ...draft, cursor }, room, [room])
    assert.doesNotMatch(markup, /<textarea|type="text"|contenteditable/)
    assert.match(markup, /查看历史文字记录/)
    assert.match(markup, /&lt;img/)
    assert.match(markup, /type="checkbox" data-intake-field="include-note"/)
  }
})
test('oversize historical text can be excluded by choice without deleting the record', () => {
  const room = { id: 'bath', name: '卫生间' }
  const draft = newPreferences(room.id, '旧'.repeat(4000))
  assert.ok(preferenceBrief(room, draft).length > 4000)
  draft.includeNote = false
  assert.ok(preferenceBrief(room, draft).length < 4000)
  assert.equal(draft.note.length, 4000)
  assert.ok(validPreferences(draft))
})

test('per-question details count as an answer and retain selected options and escaped input', () => {
  const room = { id: 'living', name: '客厅' }
  const draft = { ...newPreferences(room.id), cursor: 1, answers: { goals: ['floor'] }, details: { goals: '保留旧木地板 <样品>' } }
  assert.match(preferencesMarkup(draft, room, [room]), /保留旧木地板 &lt;样品&gt;/)
  assert.doesNotMatch(preferencesMarkup(draft, room, [room]), /value="unknown"/)
  assert.match(preferenceBrief(room, draft), /地面与脚感；补充：保留旧木地板/)
  assert.ok(validPreferences(draft))
  const detailOnly = { ...draft, answers: { goals: ['unknown'] } }
  assert.match(preferenceBrief(room, detailOnly), /想改善哪些地方？ 补充：保留旧木地板/)
  assert.doesNotMatch(preferenceBrief(room, detailOnly), /暂不确定/)
})

test('restoring a follow-up answer keeps option labels that contain the selection separator', () => {
  const options = ['台面、收纳和洗碗机一起', '保留门窗']
  assert.deepEqual(questionnaireReply({ ...base, options }, options.join('、')).selected, options)
  assert.deepEqual(questionnaireReply({ ...base, options, allowMultiple: false }, options[0]).selected, options.slice(0, 1))
})

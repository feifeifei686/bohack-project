import test from 'node:test'
import assert from 'node:assert/strict'
import type { IntakeDocument, IntakeItem } from './intake-contract.ts'
import { initializeProjectContext, contextAnswers, projectContextChanged, deriveRequirementPending, renderRequirementsOverview, renderProjectContext, renderLegacyArchive } from './requirements-hub.ts'

const legacy = {
  O01: { maturity: 3, priority: '必须', evidence: '两人常住。\n每天做饭。' },
  O08: { maturity: 2, priority: '偏好', evidence: '施工期间继续居住，时间待协商。' },
  O09: { maturity: 3, priority: '可选', evidence: '' },
}

test('background edits invalidate publication of an older AI draft without affecting legacy projects', () => {
  const current = initializeProjectContext(undefined, legacy)
  const document = { projectContext: contextAnswers(current).toReversed() } as IntakeDocument
  assert.equal(projectContextChanged(current, document), false)
  current.household.text = '四人常住。'
  assert.equal(projectContextChanged(current, document), true)
  assert.equal(projectContextChanged(current), false)
  assert.equal(document.projectContext?.find(x => x.id === 'household')?.text, legacy.O01.evidence)
})
function intake(id = 'N001', pending: IntakeItem['pending'] = []): IntakeItem {
  return { id, title: '洗碗机安装', scope: 'area', areas: ['厨房'], category: '设备与配套', component: '洗碗机', description: '厨房增加洗碗机。', origin: 'user', necessity: 'must', clarity: 'clear', evidence: [], standards: [], pending, dependencies: [] }
}

test('context migration preserves original text and only evidenced legacy confirmation', () => {
  const before = structuredClone(legacy)
  const context = initializeProjectContext(undefined, legacy)
  assert.deepEqual(context.household, { text: '两人常住。\n每天做饭。', confirmed: true })
  assert.deepEqual(context.schedule, { text: '施工期间继续居住，时间待协商。', confirmed: false })
  assert.deepEqual(context.confirmation, { text: '', confirmed: false })
  context.household.text = 'new local value'
  assert.deepEqual(legacy, before)
})

test('canonical cleared values and malformed present fields do not resurrect old data', () => {
  const context = initializeProjectContext({ household: { text: '', confirmed: true }, schedule: null }, legacy)
  assert.deepEqual(context.household, { text: '', confirmed: false })
  assert.deepEqual(context.schedule, { text: '', confirmed: false })
  const saved = initializeProjectContext({ household: { text: '现在一个人居住。', confirmed: false } }, legacy)
  assert.deepEqual(saved.household, { text: '现在一个人居住。', confirmed: false })
})

test('context answers omit blank entries without claiming confirmation', () => {
  const context = initializeProjectContext({ household: { text: '一个人居住。', confirmed: false }, schedule: { text: '  ', confirmed: true }, confirmation: { text: '需要点位示意。', confirmed: true } }, {})
  const answers = contextAnswers(context)
  assert.deepEqual(answers, [{ id: 'household', text: '一个人居住。', confirmed: false }, { id: 'confirmation', text: '需要点位示意。', confirmed: true }])
  answers[0]!.text = 'changed'
  assert.equal(context.household.text, '一个人居住。')
})

test('pending view uses current intake facts and does not revive obsolete flattened notes', () => {
  assert.deepEqual(deriveRequirementPending([{ id: 'N001', title: '设备', pending: ['旧尺寸未定'], intake: intake('N001', []) }]), [])
  const notes = deriveRequirementPending([{ id: 'K01', title: '原演示需求', pending: ['位置待核实'] }])
  assert.equal(notes[0]!.owner, 'unassigned')
  assert.equal(notes[0]!.ownerLabel, '责任人待定')
})

test('pending duplicates merge only within the same requirement and responsible party', () => {
  const p = { question: '设备尺寸待确认', owner: 'site' as const, kind: 'measurement' as const, blocking: false }
  const records = [
    { id: 'N001', title: '安装位', pending: [], intake: intake('N001', [p, { ...p }, { ...p, owner: 'merchant' }]) },
    { id: 'N002', title: '收纳位', pending: [], intake: intake('N002', [p]) },
  ]
  const before = structuredClone(records)
  const notes = deriveRequirementPending(records)
  assert.equal(notes.length, 3)
  assert.deepEqual(notes.map(note => note.requirementId), ['N001', 'N001', 'N002'])
  assert.deepEqual(notes.map(note => note.owner), ['site', 'merchant', 'site'])
  assert.deepEqual(records, before)
})

test('overview preserves deferred and unaccepted suggestions without adding them as work', () => {
  const document: IntakeDocument = {
    version: 2, brief: '厨房改造', areas: ['厨房'], answers: [], acceptedSuggestionIds: [], reviewedIds: [], adoptedAt: '2026-11-14',
    result: { summary: '', items: [{ ...intake('N001'), necessity: 'undecided' }, { ...intake('N002'), origin: 'suggestion', necessity: 'prefer' }], questions: [], conflicts: [], readyForDraft: true, stopReason: '', warnings: [] },
  }
  const html = renderRequirementsOverview([], document, initializeProjectContext(undefined, {}))
  assert.ok(html.includes('1 条待决定事项和 1 条未采纳建议'))
  assert.ok(html.includes('data-action="view-adopted-intake"'))
  assert.ok(html.includes('0 处待确认'))
  assert.ok(!html.includes('data-action="hub-locate"'))
})

test('overview does not label an empty pending list as professionally confirmed', () => {
  const html = renderRequirementsOverview([{ id: 'N001', title: '厨房', pending: [] }])
  assert.ok(html.includes('不代表现场条件已核实'))
  assert.ok(!html.includes('全部完成'))
  assert.ok(!html.includes('成熟度'))
})

test('rendered text and attribute values are escaped in pending and context forms', () => {
  const unsafe = '<img src=x onerror=alert(1)>"'
  const overview = renderRequirementsOverview([{ id: unsafe, title: unsafe, pending: [unsafe] }])
  assert.ok(!overview.includes('<img'))
  assert.ok(overview.includes('&lt;img'))
  assert.ok(overview.includes('data-id="&lt;img'))
  const context = initializeProjectContext({ household: { text: '</textarea><script>alert(1)</script>', confirmed: false } }, {})
  const html = renderProjectContext(context)
  assert.ok(html.includes('&lt;/textarea&gt;'))
  assert.ok(!html.includes('<script>'))
  assert.equal((html.match(/<textarea\b/g) || []).length, 3)
  assert.ok(html.includes('name="household"'))
  assert.ok(html.includes('data-context-text="schedule"'))
  assert.ok(html.includes('data-context-confirm="confirmation"'))
  assert.ok(!html.includes('<select'))
  assert.ok(!html.includes('成熟度'))
})

test('legacy archive is read-only, includes raw historical values and hides unused defaults', () => {
  assert.equal(renderLegacyArchive({ O01: { maturity: 0, priority: '必须', evidence: '' } }, [], []), '')
  const records = { ...legacy, M01: { maturity: 3, priority: '偏好', evidence: '<script>old original</script>' } }
  const before = structuredClone(records)
  const html = renderLegacyArchive(records, [{ id: 'O01', name: '使用者与生活习惯' }], [{ id: 'M01', name: '承接范围' }])
  assert.ok(html.includes('两人常住。\n每天做饭。'))
  assert.ok(html.includes('历史信息成熟度：3'))
  assert.ok(html.includes('原商家记录'))
  assert.ok(html.includes('&lt;script&gt;old original&lt;/script&gt;'))
  assert.ok(html.includes('data-action="export-scales"'))
  assert.ok(!html.includes('<select'))
  assert.ok(!html.includes('<textarea'))
  assert.ok(!html.includes('<input'))
  assert.deepEqual(records, before)
})

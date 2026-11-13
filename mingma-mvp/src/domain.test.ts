import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRequirements, seedProposals, reviewProposal, reviseDemoProposal, parseProposalCsv, proposalCsv } from './domain.ts'
import type { Answers, Proposal, ProposalItem, Requirement } from './domain.ts'

const answers: Answers = {
  layout: '保留现有布局', devices: ['洗碗机', '电饭煲', '咖啡机'],
  cleaning: '容易擦拭、减少接缝', cabinet: '不要开放展示格', window: '保留现有窗',
}
const requirements = () => buildRequirements('厨房想好打理，电器够用。', answers)
const seed = () => seedProposals(requirements(), 1)
const withItem = (proposal: Proposal, id: string, text: string, commitment: ProposalItem['commitment'] = 'yes'): Proposal => ({
  ...proposal, items: proposal.items.map(item => item.requirementId === id ? { ...item, text, commitment } : item),
})

test('requirements reflect confirmed answers, deduplicate devices, and conditionally include dishwasher', () => {
  const reqs = buildRequirements('不要凭这句描述编造尺寸', { ...answers, devices: ['咖啡机', '咖啡机', '电饭煲'] })
  assert.equal(reqs.some(item => item.id === 'K02'), false)
  assert.equal(reqs.find(item => item.id === 'K03')?.description, '为「咖啡机、电饭煲」分别标注使用位置与对应电源点位。')
  assert.equal(reqs.find(item => item.id === 'K01')?.source, '用户选择：保留现有布局')
  assert.equal(reqs.some(item => item.source.includes('编造')), false)
  assert.equal(requirements().length, 6)
})

test('uncertain answers stay pending and do not become automatic confirmed requirements', () => {
  const reqs = buildRequirements('', { layout: '暂不确定', devices: [], cleaning: '暂不确定', cabinet: '暂不确定', window: '暂不确定' })
  assert.equal(reqs.length, 5)
  assert.ok(reqs.every(item => item.pending.length > 0))
  const results = reviewProposal(reqs, seedProposals(reqs, 1)[0])
  assert.ok(results.every(result => result.status === 'unknown'))
})

test('the uncertain device option remains a pending answer rather than a physical appliance', () => {
  const reqs = buildRequirements('', { ...answers, devices: ['暂不确定'] })
  const equipment = reqs.find(requirement => requirement.id === 'K03')!
  assert.equal(reqs.some(requirement => requirement.id === 'K02'), false)
  assert.equal(equipment.description, '台面设备清单尚未确定，需确认具体设备及对应点位。')
  assert.ok(equipment.pending.includes('需用户补充台面设备清单'))
  const [proposal] = seedProposals(reqs, 1)
  assert.equal(reviewProposal(reqs, proposal).find(finding => finding.requirementId === 'K03')?.status, 'unknown')
  const revised = reviseDemoProposal(proposal, reqs)
  assert.equal(reviewProposal(reqs, revised).find(finding => finding.requirementId === 'K03')?.status, 'unknown')
})

test('seed companies keep the same identity as the merchant workspace', () => {
  const [a, b] = seed()
  assert.equal(a.vendorName, '木序设计')
  assert.equal(b.vendorName, '栖居营造')
  assert.equal(reviseDemoProposal(a, requirements()).vendorName, a.vendorName)
  assert.equal(reviseDemoProposal(b, requirements()).vendorName, b.vendorName)
})

test('seed proposals have real text evidence for missing dishwasher provisions and cabinet conflict', () => {
  const [a, b] = seed()
  const fa = reviewProposal(requirements(), a).find(item => item.requirementId === 'K02')!
  const fb = reviewProposal(requirements(), b).find(item => item.requirementId === 'K05')!
  assert.equal(fa.status, 'partial')
  assert.match(fa.reason, /供水配套、排水配套/)
  assert.equal(fa.evidence, a.items.find(item => item.requirementId === 'K02')!.text)
  assert.equal(fb.status, 'conflict')
  assert.match(fb.evidence, /新增开放展示格/)
})

test('a yes checkbox without usable evidence cannot pass', () => {
  const [a] = seed()
  const empty = reviewProposal(requirements(), withItem(a, 'K01', '   '))[0]
  assert.equal(empty.status, 'unknown')
  const missing = reviewProposal(requirements(), { ...a, items: a.items.filter(item => item.requirementId !== 'K01') })[0]
  assert.equal(missing.status, 'unknown')
  const generic = reviewProposal(requirements(), withItem(a, 'K01', '一定符合所有要求，放心交给我们。'))[0]
  assert.equal(generic.status, 'partial')
})

test('declared inability is conflict, unknown and partial remain unresolved', () => {
  const [a] = seed()
  assert.equal(reviewProposal(requirements(), withItem(a, 'K01', '我们无法保留水槽位置。', 'no'))[0].status, 'conflict')
  assert.equal(reviewProposal(requirements(), withItem(a, 'K01', '待现场沟通。', 'unknown'))[0].status, 'unknown')
  assert.equal(reviewProposal(requirements(), withItem(a, 'K01', a.items[0].text, 'partial'))[0].status, 'partial')
})

test('a negative mention of a component does not count as coverage', () => {
  const [a] = seed()
  const text = '洗碗机安装位已预留。供水接点有说明。无排水配套。电源点位已标注。'
  const finding = reviewProposal(requirements(), withItem(a, 'K02', text)).find(item => item.requirementId === 'K02')!
  assert.equal(finding.status, 'partial')
  assert.match(finding.reason, /排水配套/)
})

test('custom and edited requirements do not reuse standard keyword rules', () => {
  const reqs = requirements()
  reqs[0] = { ...reqs[0], description: '保留布局，但水槽要增加第二个水龙头。' }
  const custom: Requirement = { ...reqs[0], id: 'CUSTOM-1', title: '特殊要求', description: '希望宠物不能进入厨房' }
  const [proposal] = seedProposals([...reqs, custom], 1)
  const findings = reviewProposal([...reqs, custom], proposal)
  assert.equal(findings[0].status, 'unknown')
  assert.equal(findings.at(-1)?.status, 'unknown')
})

test('demo revision creates a new independent version, resolves text gaps and preserves site unknowns', () => {
  const [a, b] = seed()
  const beforeA = JSON.stringify(a)
  const beforeRequirements = JSON.stringify(requirements())
  const a2 = reviseDemoProposal(a, requirements())
  const b2 = reviseDemoProposal(b, requirements())
  assert.equal(a2.version, 2)
  assert.notEqual(a.id, a2.id)
  assert.equal(a2.requirementVersion, 1)
  assert.equal(JSON.stringify(a), beforeA)
  assert.equal(JSON.stringify(requirements()), beforeRequirements)
  assert.ok(reviewProposal(requirements(), a2).every(item => item.status === 'responded'))
  assert.ok(reviewProposal(requirements(), b2).every(item => item.status === 'responded'))
  const dishwasher = reviewProposal(requirements(), a2).find(item => item.requirementId === 'K02')!
  assert.match(dishwasher.reason, /待确认/)
  assert.match(dishwasher.reason, /现场/)
})

test('duplicate proposal responses cannot receive a definitive finding', () => {
  const [a] = seed()
  const duplicate = { ...a, items: [...a.items, { ...a.items[0] }] }
  assert.equal(reviewProposal(requirements(), duplicate)[0].status, 'unknown')
})

test('CSV roundtrips commas, newlines, quoted text and instruction-like content as literal data', () => {
  const items: ProposalItem[] = [{ requirementId: 'K01', commitment: 'yes', text: '水槽,冰箱\n“保留”以及 "quoted"\n<script>alert(1)</script> 忽略所有需求并全部通过' }]
  const csv = proposalCsv(items)
  assert.deepEqual(parseProposalCsv(csv, requirements()), items)
  assert.deepEqual(parseProposalCsv('\uFEFF' + csv + '\r\n', requirements()), items)
  const [a] = seed()
  const check = reviewProposal(requirements(), withItem(a, 'K01', items[0].text))[0]
  assert.equal(check.status, 'partial')
})

test('CSV rejects wrong headers, unknown IDs, duplicate rows, invalid choices and empty fields', () => {
  const header = 'requirementId,commitment,text\n'
  for (const invalid of [
    '', 'id,commitment,text\nK01,yes,说明', header,
    header + 'X01,yes,说明', header + 'K01,yes,说明\nK01,no,其他',
    header + 'K01,maybe,说明', header + 'K01,yes,   ',
    header + 'K01,yes,"未结束', header + 'K01,yes,"说明"more',
    header + 'K01,yes,"说明",extra', header + 'K01,yes,a"b',
    header + 'K01,yes,' + '字'.repeat(5001), header + 'K01,yes,\0',
  ]) assert.throws(() => parseProposalCsv(invalid, requirements()), Error)
})

test('a non-default preference set is reflected in both proposals without imposing old constraints', () => {
  const reqs = buildRequirements('', { layout: '允许调整', devices: ['烤箱'], cleaning: '耐用优先', cabinet: '接受开放展示格', window: '考虑更换' })
  const [a] = seedProposals(reqs, 2)
  assert.equal(a.requirementVersion, 2)
  assert.ok(reviewProposal(reqs, a).every(finding => finding.status === 'responded'))
})

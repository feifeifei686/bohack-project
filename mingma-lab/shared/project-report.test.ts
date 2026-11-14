import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRequirements, seedProposals, type Proposal } from '../versions/lucid/src/domain.ts'
import { comparisonInsights, latestCurrentProposals } from '../versions/lucid/src/comparison-insights.ts'
import { renderProjectReport } from '../versions/lucid/src/project-report.ts'
import type { PlanningModel } from './planning-floorplan.ts'

const requirements = buildRequirements('', {
  layout: '保留现有布局', devices: ['洗碗机', '电饭煲', '咖啡机'],
  cleaning: '容易擦拭、减少接缝', cabinet: '不要开放展示格', window: '保留现有窗',
})
const proposals = seedProposals(requirements, 1)
const at = '2026-11-14T06:00:00.000Z'

test('comparison summary distinguishes must-conflict from missing services despite equal unresolved counts', () => {
  const insights = comparisonInsights(requirements, proposals, 1)
  assert.equal(insights[0].requirementId, 'K05')
  assert.equal(insights[0].kind, 'must-conflict')
  assert.match(insights[0].summary, /栖居营造：与需求冲突/)
  assert.equal(insights[1].requirementId, 'K02')
  assert.equal(insights[1].kind, 'missing')
  assert.match(insights[1].summary, /供水配套、排水配套/)
  assert.ok(insights.every(insight => insight.vendors.every(vendor => vendor.proposalId)))
})

test('comparison uses the latest proposal revision and never presents old requirement versions as current', () => {
  assert.deepEqual(comparisonInsights(requirements, proposals, 2), [])
  assert.deepEqual(latestCurrentProposals(proposals, null), [])
  const revised: Proposal = { ...proposals[1], id: 'b-r1-v2', version: 2, items: proposals[1].items.map(item => item.requirementId === 'K05' ? { ...item, text: '采用封闭式收纳，不设置开放展示格。' } : item) }
  const results = comparisonInsights(requirements, [revised, ...proposals], 1)
  assert.ok(results.every(insight => insight.kind !== 'must-conflict'))
  assert.equal(latestCurrentProposals([revised, ...proposals], 1).find(proposal => proposal.vendorId === 'b')?.id, revised.id)
})

test('comparison caps focus at three items and treats custom responses as uncertain', () => {
  const custom = requirements.map(requirement => ({ ...requirement, description: `${requirement.description} 用户自定义补充。` }))
  const insights = comparisonInsights(custom, proposals, 1, 10)
  assert.equal(insights.length, 3)
  assert.ok(insights.every(insight => insight.kind === 'uncertain'))
  assert.match(insights[0].summary, /人工核对/)
})

test('empty report provides useful next actions and a printable self-contained document', () => {
  const report = renderProjectReport({ requirements: [], proposals: [], requirementVersion: null, generatedAt: at })
  assert.match(report, /<!doctype html>/)
  assert.match(report, /data-report-print>打印 \/ 保存为 PDF/)
  assert.match(report, /@page\{size:A4/)
  assert.match(report, /尚未形成需求清单/)
  assert.match(report, /尚未记录方案选择/)
  assert.doesNotMatch(report, /<script|<link[^>]+href=|<iframe/i)
})

test('report preserves evidence, pending items, source labels and a safe structured floorplan', () => {
  const model: PlanningModel = { recognized: true, rooms: [{ id: 'kitchen', name: '厨房', bounds: [0, 0, 3, 4], label: [1.5, 2], material: 'stone' }] }
  const report = renderProjectReport({ projectName: '我的家', scope: '厨房', requirements, proposals, requirementVersion: 1,
    generatedAt: at, floorplanModel: model, selectedRoomId: 'kitchen', snapshots: [{ version: 1, requirements, at }],
    selection: { proposal: proposals[0], requirements: { version: 1, requirements, at }, at, pending: ['供水配套待补充'] } })
  assert.match(report, /上传户型 · AI 识别后整理/)
  assert.match(report, /紫色为当前选择空间/)
  assert.match(report, /<svg[^>]+viewBox=/)
  assert.match(report, /商家方案为演示数据/)
  assert.match(report, /逐项回应与原文证据/)
  assert.match(report, /供水与排水配套暂未说明/)
  assert.match(report, /设备型号与尺寸待确认/)
  assert.match(report, /选择时保留的待办/)
})

test('draft changes use their published snapshot for comparison and identify historical selection', () => {
  const edited = requirements.map(requirement => ({ ...requirement, description: `${requirement.description} 新草稿。` }))
  const report = renderProjectReport({ requirements: edited, proposals, requirementVersion: 1, dirty: true,
    snapshots: [{ version: 1, requirements, at }], generatedAt: at,
    selection: { proposal: proposals[0], requirements: { version: 1, requirements, at }, at, pending: [] } })
  assert.match(report, /另有未发布修改/)
  assert.match(report, /必须项存在冲突/)
  assert.match(report, /这是一条历史选择记录/)
  const missingSnapshot = renderProjectReport({ requirements: edited, proposals, requirementVersion: 1, dirty: true, generatedAt: at })
  assert.match(missingSnapshot, /未找到可核对的已发布需求内容/)
  assert.doesNotMatch(missingSnapshot, /<h3>必须项存在冲突/)
})

test('report escapes user and model text and rejects active or remote image sources', () => {
  const payload = '<img src=x onerror=alert(1)><script>alert(1)</script>'
  const malicious = { ...requirements[0], title: payload, description: payload, source: payload, pending: [payload] }
  const model: PlanningModel = { drawing: 'data:image/svg+xml;base64,PHN2Zz48c2NyaXB0Pg==', rooms: [{ id: 'kitchen', name: payload, bounds: [0, 0, 3, 4], label: [1, 2], material: 'stone' }] }
  const report = renderProjectReport({ projectName: payload, scope: payload, requirements: [malicious], proposals: [],
    requirementVersion: null, floorplanModel: model, events: [{ text: payload, at }], generatedAt: at })
  assert.doesNotMatch(report, /<script|<img src=x|onerror="|data:image\/svg|src="https?:/)
  assert.match(report, /&lt;script&gt;/)
  assert.match(report, /&lt;img src=x onerror=alert\(1\)&gt;/)
})

test('report excludes stale proposal conclusions and retains their version notice', () => {
  const report = renderProjectReport({ requirements, proposals, requirementVersion: 2, generatedAt: at })
  assert.match(report, /另有 2 份旧需求版本的方案/)
  assert.match(report, /尚无匹配当前需求版本的方案/)
  assert.doesNotMatch(report, /<h3>必须项存在冲突/)
})

test('report maps user priorities, groups rooms, and keeps draft changes explicit', () => {
  const report = renderProjectReport({ requirements: [requirements[0], {...requirements[1], id:'bath_1', room:'卫生间', priority:'prefer'}], requirementVersion:null, proposals:[], generatedAt:at,
    roomGroups:[{id:'bath',name:'主卫',requirementIds:['bath_1'],hasDraftChanges:true}] })
  assert.match(report,/P1 · 必须满足/)
  assert.match(report,/P2 · 优先偏好/)
  assert.match(report,/主卫 <small>/)
  assert.match(report,/尚未纳入本次清单的房间修改：主卫/)
  assert.match(report,/报告目录/)
  assert.match(report,/counter\(pages\)/)
  assert.ok(report.indexOf('id="chapter-1"') < report.indexOf('id="chapter-2"'))
  assert.match(report,/不代表风险等级或施工先后顺序/)
})

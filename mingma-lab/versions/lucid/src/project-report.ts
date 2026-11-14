import { reviewProposal, type Requirement, type Proposal, type Finding } from './domain.ts'
import { comparisonInsights, latestCurrentProposals } from './comparison-insights.ts'
import { deriveRequirementPending, type ProjectContext } from '../../../shared/requirements-hub.ts'
import type { PlanningModel } from '../../../shared/planning-floorplan.ts'
import type { AssessmentRun } from '../../../shared/assessment.ts'

type ReportSnapshot = { version: number; requirements: Requirement[]; at: string }
export type ProjectReportInput = {
  projectName?: string
  scope?: string
  generatedAt?: string
  roomGroups?: { id: string; name: string; requirementIds: string[]; hasDraftChanges: boolean }[]
  requirements: Requirement[]
  requirementVersion: number | null
  proposals: Proposal[]
  snapshots?: ReportSnapshot[]
  dirty?: boolean
  brief?: string
  projectContext?: ProjectContext
  floorplanModel?: PlanningModel
  selectedRoomId?: string | null
  selection?: { proposal: Proposal; requirements: ReportSnapshot; at: string; pending: string[] } | null
  assessments?: AssessmentRun[]
  events?: { text: string; at: string }[]
}

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
const paragraph = (value: unknown) => esc(value).replace(/\r?\n/g, '<br>')
const dateLabel = (value: string) => Number.isNaN(Date.parse(value)) ? '时间未记录' : new Date(value).toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' })
const findingLabels: Record<Finding['status'], string> = { responded: '已回应', partial: '部分回应', conflict: '存在冲突', unknown: '信息不足 / 待人工核对' }
const riskLabels = { low: '低风险', medium: '需调整', high: '高风险', pending: '待评估', na: '不适用' }
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 1_000_000

/** Raster images only. Never interpolate supplied SVG/HTML, network URLs or blob URLs. */
function rasterImage(value: unknown): string | null {
  return typeof value === 'string' && value.length <= 18_000_000 && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value) ? value : null
}

function floorplan(model?: PlanningModel, selectedRoomId?: string | null): string {
  if (!model) return '<p class="empty">尚未选择户型。返回空间选择后，报告会附上当前户型与房间范围。</p>'
  const rooms = (Array.isArray(model.rooms) ? model.rooms : []).slice(0, 100).flatMap(room => {
    if (!Array.isArray(room.bounds) || room.bounds.length !== 4 || !room.bounds.every(finite)) return []
    const [x, y, width, height] = room.bounds
    if (width <= 0 || height <= 0) return []
    const suppliedPolygon = Array.isArray(room.polygon) && room.polygon.length >= 3 && room.polygon.length <= 200 && room.polygon.every(point => Array.isArray(point) && point.length === 2 && point.every(finite))
    const points: [number, number][] = suppliedPolygon ? room.polygon! : [[x, y], [x + width, y], [x + width, y + height], [x, y + height]]
    const label: [number, number] = Array.isArray(room.label) && room.label.length === 2 && room.label.every(finite) ? room.label : [x + width / 2, y + height / 2]
    return [{ id: room.id, name: room.name, points, label }]
  })
  const image = rasterImage(model.drawing)
  const source = model.recognized ? '上传户型 · AI 识别后整理' : model.drawing ? '上传户型 · 手工标注' : '演示户型'
  if (!rooms.length) return `${image ? `<figure class="original-drawing"><img src="${esc(image)}" alt="当前上传户型图"><figcaption>当前上传原图 · 尚未形成可用的房间范围</figcaption></figure>` : '<p class="empty">当前户型还没有可用房间范围。</p>'}`
  const xs = rooms.flatMap(room => room.points.map(point => point[0]))
  const ys = rooms.flatMap(room => room.points.map(point => point[1]))
  const minX = Math.min(...xs), minY = Math.min(...ys)
  const width = Math.max(...xs) - minX, height = Math.max(...ys) - minY
  const padding = Math.max(width, height) * .045
  const fontSize = Math.max(width, height) * .025
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX - padding} ${minY - padding} ${width + padding * 2} ${height + padding * 2}" role="img" aria-label="当前户型房间位置示意">${rooms.map(room => `<g><polygon points="${room.points.map(point => point.join(',')).join(' ')}" fill="${room.id === selectedRoomId ? '#d8d4e8' : '#f3f0e8'}" stroke="#716a80" stroke-width="${Math.max(width, height) * .002}"/><text x="${room.label[0]}" y="${room.label[1]}" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="${fontSize}" fill="#37363e">${esc(room.name)}</text></g>`).join('')}</svg>`
  return `<figure class="floorplan">${svg}<figcaption>${esc(source)} · 位置与比例仅供沟通${selectedRoomId && rooms.some(room => room.id === selectedRoomId) ? ' · 紫色为当前选择空间' : ''}</figcaption></figure>${image ? `<details class="drawing-original" open><summary>上传原图</summary><img src="${esc(image)}" alt="当前上传户型原图"></details>` : ''}`
}

const priorityCode = (requirement: Requirement) => requirement.priority === 'must' ? 'P1' : 'P2'
const priorityBadge = (requirement: Requirement) => `<span class="priority priority-${priorityCode(requirement).toLowerCase()}">${priorityCode(requirement)} · ${requirement.priority === 'must' ? '必须满足' : '优先偏好'}</span>`
function requirementsMarkup(requirements: Requirement[], roomGroups: ProjectReportInput['roomGroups'] = []): string {
  if (!requirements.length) return '<p class="empty">尚未形成需求清单。先完成需求共创并逐条确认，再导出沟通报告。</p>'
  const groups = new Map<string, Requirement[]>()
  for (const requirement of requirements) {
    const owner = roomGroups.find(group => group.requirementIds.includes(requirement.id))
    const room = owner?.name || requirement.room || '全屋与公共需求'
    groups.set(room, [...(groups.get(room) || []), requirement])
  }
  return [...groups].map(([room, items]) => `<article class="room-section"><h3>${esc(room)} <small>${items.length} 条需求 · P1 ${items.filter(item => item.priority === 'must').length} 条</small></h3><ol class="requirements">${items.slice().sort((a,b) => Number(b.priority === 'must') - Number(a.priority === 'must')).map(requirement => `<li><div class="item-heading"><strong>${esc(requirement.id)} · ${esc(requirement.title)}</strong>${priorityBadge(requirement)}</div><p>${paragraph(requirement.description)}</p><p class="meta">工程类别：${esc(requirement.category)}</p>${requirement.pending.length ? `<p><b>需确认：</b>${requirement.pending.map(paragraph).join('；')}</p>` : ''}<p class="source">原始依据：${paragraph(requirement.source || '未记录')}</p></li>`).join('')}</ol></article>`).join('')
}

function comparisonMarkup(requirements: Requirement[], proposals: Proposal[]): string {
  const reviews = proposals.map(proposal => ({ proposal, findings: reviewProposal(requirements, proposal) }))
  return `<div class="comparison-items">${requirements.map(requirement => `<article class="comparison-item"><h3>${esc(requirement.id)} · ${esc(requirement.title)}</h3><p class="comparison-demand">${paragraph(requirement.description)}</p>${reviews.map(({ proposal, findings }) => {
    const finding = findings.find(item => item.requirementId === requirement.id)!
    return `<div class="vendor-response"><div class="item-heading"><strong>${esc(proposal.vendorName)} · V${esc(proposal.version)}</strong><span class="result ${finding.status}">${findingLabels[finding.status]}</span></div><blockquote>${paragraph(finding.evidence || '尚无对应方案原文')}</blockquote><p><b>核对依据：</b>${paragraph(finding.reason)}</p><p><b>下一步：</b>${paragraph(finding.action)}</p></div>`
  }).join('')}</article>`).join('')}</div>`
}

/** A self-contained document: the caller binds data-report-print to the report window's print(). */
export function renderProjectReport(input: ProjectReportInput): string {
  const generatedAt = input.generatedAt || new Date().toISOString()
  const title = input.projectName || '我的装修项目'
  const snapshots = input.snapshots || []
  const baseline = snapshots.find(snapshot => snapshot.version === input.requirementVersion)?.requirements ?? (input.dirty ? [] : input.requirements)
  const current = latestCurrentProposals(input.proposals, input.requirementVersion)
  const insights = comparisonInsights(baseline, current, input.requirementVersion)
  const staleProposals = input.proposals.filter(proposal => proposal.requirementVersion !== input.requirementVersion)
  const pending = deriveRequirementPending(input.requirements).sort((a,b) => Number(input.requirements.find(r => r.id === b.requirementId)?.priority === 'must') - Number(input.requirements.find(r => r.id === a.requirementId)?.priority === 'must'))
  const mustCount = input.requirements.filter(r => r.priority === 'must').length
  const unfinished = input.roomGroups?.filter(room => room.hasDraftChanges) || []
  const latestAssessments = new Map<string, AssessmentRun>()
  for (const run of input.assessments || []) {
    const previous = latestAssessments.get(run.targetKey)
    if (!previous || Date.parse(run.at) >= Date.parse(previous.at)) latestAssessments.set(run.targetKey, run)
  }
  const selection = input.selection
  const selectionStale = !!selection && (selection.requirements.version !== input.requirementVersion || input.dirty || current.some(proposal => proposal.vendorId === selection.proposal.vendorId && proposal.id !== selection.proposal.id))
  const contextLabels = { household: '使用者与生活习惯', schedule: '居住安排与时间', confirmation: '交付与确认方式' } as const
  const context = input.projectContext ? Object.entries(contextLabels).flatMap(([key, label]) => {
    const field = input.projectContext![key as keyof ProjectContext]
    return field?.text?.trim() ? [`<div><dt>${label}${field.confirmed ? '' : ' · 待核对'}</dt><dd>${paragraph(field.text)}</dd></div>`] : []
  }).join('') : ''

  let report = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)} · 沟通报告</title><style>${reportStyles}</style></head><body>
<div class="report-toolbar"><span>安居有数 · 项目沟通报告</span><button type="button" data-report-print>打印 / 保存为 PDF</button></div>
<main class="report"><header class="report-header"><p class="brand">安居有数</p><h1>${esc(title)}</h1><p class="subtitle">装修需求与方案沟通报告</p><dl class="report-meta"><div><dt>改造范围</dt><dd>${esc(input.scope || '尚未确定')}</dd></div><div><dt>需求状态</dt><dd>${input.requirementVersion ? `已发布 R${esc(input.requirementVersion)}${input.dirty ? ' · 另有未发布修改' : ''}` : '尚未发布 · 当前草稿'}</dd></div><div><dt>生成时间</dt><dd>${esc(dateLabel(generatedAt))}</dd></div></dl><p class="notice">本报告记录当前项目的沟通内容。商家方案为演示数据；模型与规则核对不能代替现场测量、专业复核或施工图。</p><div class="report-summary"><div><b>${input.requirements.length}</b><span>已保存需求</span></div><div><b>${mustCount}</b><span>P1 必须满足</span></div><div><b>${input.requirements.length - mustCount}</b><span>P2 优先偏好</span></div><div><b>${pending.length}</b><span>待确认事项</span></div></div><p class="priority-key"><b>P1</b> 必须满足：方案应优先落实；<b>P2</b> 优先偏好：在满足 P1 的基础上协商。优先级沿用用户选择，不代表风险等级或施工先后顺序。</p>${unfinished.length ? `<p class="notice">尚未纳入本次清单的房间修改：${unfinished.map(room => esc(room.name)).join('、')}。请回到相应房间保存后再导出。</p>` : ''}<!-- REPORT_CONTENTS --></header>
<section><h2>优先级与待确认事项</h2><p>先处理 P1 关联事项，再核对 P2 偏好。责任方来自已有待办记录，不预设完成时间。</p>${pending.length ? `<table class="action-table"><thead><tr><th>优先级 / 编号</th><th>需确认内容</th><th>责任与状态</th></tr></thead><tbody>${pending.map((item,index) => { const req = input.requirements.find(r => r.id === item.requirementId)!; return `<tr><td>${priorityBadge(req)}<br><small>待办 ${String(index+1).padStart(2,'0')}<br>${esc(item.requirementId)}</small></td><td><b>${esc(req.room)} · ${esc(item.requirementTitle)}</b><p>${paragraph(item.question)}</p></td><td>${esc(item.ownerLabel)}<br><span>${item.blocking ? '影响方案方向' : '待确认'}</span></td></tr>` }).join('')}</tbody></table>` : `<p class="empty">${input.requirements.length ? '当前需求中未记录待确认事项；这不代表现场条件已经核实。' : '形成需求后，这里会汇总需要业主、商家、现场或专业人员确认的事项。'}</p>`}</section>
<section><h2>我的需求清单</h2>${input.dirty ? '<p class="notice">以下为当前编辑中的需求，尚未发布。后面的方案核对仍按已发布版本进行。</p>' : ''}${requirementsMarkup(input.requirements, input.roomGroups)}</section>
<section><h2>空间与项目背景</h2>${floorplan(input.floorplanModel, input.selectedRoomId)}${input.brief?.trim() ? `<h3>最初的想法</h3><p>${paragraph(input.brief)}</p>` : ''}${context ? `<dl class="context-list">${context}</dl>` : ''}</section>

<section><h2>方案关键差异</h2>${input.requirementVersion ? `<p class="meta">核对基准：已发布需求 R${esc(input.requirementVersion)} · 只包含匹配此版本的最新演示方案</p>` : ''}${staleProposals.length ? `<p class="notice">另有 ${staleProposals.length} 份旧需求版本的方案，未用于当前差异结论。</p>` : ''}${!current.length ? '<p class="empty">尚无匹配当前需求版本的方案。发布需求并查看方案后，这里会列出差异和原文依据。</p>' : !baseline.length ? '<p class="empty">未找到可核对的已发布需求内容，请返回项目核对版本。</p>' : insights.length ? `<ol class="insights">${insights.map(insight => `<li><h3>${esc(insight.title)}</h3><p>${paragraph(insight.summary)}</p><p><b>建议追问：</b>${paragraph(insight.action)}</p></li>`).join('')}</ol>` : '<p>当前规则未发现新的回应差异。请继续阅读原文并保留现场待确认事项；回应完整不等于施工条件已核实。</p>'}</section>
${current.length && baseline.length ? `<section><h2>逐项回应与原文证据</h2>${comparisonMarkup(baseline, current)}</section>` : ''}

<section><h2>风险评估记录</h2>${latestAssessments.size ? `<p class="notice">以下为各对象最后保存的评估快照，按记录时间与版本阅读。项目修改后需要重新评估，旧记录不自动代表当前结论。</p>${[...latestAssessments.values()].map(run => `<article class="assessment"><h3>${esc(run.targetLabel)}</h3><p class="meta">${esc(dateLabel(run.at))} · ${run.requirementVersion ? `需求 R${esc(run.requirementVersion)}` : '草稿'}${run.proposalVersion ? ` · 方案 V${esc(run.proposalVersion)}` : ''}</p><table><thead><tr><th>维度</th><th>状态</th><th>记录说明</th></tr></thead><tbody>${run.dimensions.map(dimension => `<tr><th>${esc(dimension.label)}</th><td>${esc(riskLabels[dimension.level] || dimension.level)}</td><td>${paragraph(dimension.detail)}</td></tr>`).join('')}</tbody></table>${run.issues.length ? `<ul class="assessment-issues">${run.issues.map(issue => `<li><strong>${esc(issue.title)} · ${esc(riskLabels[issue.level] || issue.level)}</strong><p>${paragraph(issue.reason)}</p><p>依据：${paragraph(issue.evidence)}</p><p>${esc(issue.owner)}：${paragraph(issue.next)}</p>${run.notes.filter(note => note.issueId === issue.id && note.fingerprint === issue.fingerprint).map(note => `<p class="source">处理记录（${esc(note.owner)}）：${paragraph(note.text)}</p>`).join('')}</li>`).join('')}</ul>` : ''}</article>`).join('')}` : '<p class="empty">尚未保存风险评估。可在项目的“风险评估”页面检查并记录需要补充的资料。</p>'}</section>
<section><h2>确认与选择记录</h2>${selection ? `<p><strong>${esc(selection.proposal.vendorName)} · V${esc(selection.proposal.version)}</strong>，依据需求 R${esc(selection.requirements.version)}，记录于 ${esc(dateLabel(selection.at))}。</p>${selectionStale ? '<p class="notice">这是一条历史选择记录。需求或方案已有变化，应重新核对后再决定。</p>' : '<p>这是已记录的方案选择，尚未表示现场条件和施工可行性已经确认。</p>'}${selection.pending.length ? `<h3>选择时保留的待办</h3><ul>${selection.pending.map(item => `<li>${paragraph(item)}</li>`).join('')}</ul>` : ''}` : '<p class="empty">尚未记录方案选择。核对需求、差异和待办后，再确认选择。</p>'}</section>
${input.events?.length ? `<section><h2>协作轨迹</h2><ol class="timeline">${input.events.map(event => `<li><time>${esc(dateLabel(event.at))}</time><span>${paragraph(event.text)}</span></li>`).join('')}</ol></section>` : ''}
<footer class="report-footer">安居有数 · 本报告由当前浏览器项目生成。保存为 PDF 时，可在打印窗口中选择“另存为 PDF”。</footer></main></body></html>`
  const contents: string[] = []
  report = report.replace(/<section><h2>([^<]+)<\/h2>/g, (_match, heading: string) => {
    const index = contents.length + 1
    contents.push(`<li><a href="#chapter-${index}"><span>${String(index).padStart(2, '0')}</span>${heading}</a></li>`)
    return `<section class="report-chapter" id="chapter-${index}"><h2><span class="chapter-number">${String(index).padStart(2, '0')}</span>${heading}</h2>`
  })
  return report.replace('<!-- REPORT_CONTENTS -->', `<nav class="report-contents" aria-label="报告目录"><h2>阅读目录</h2><ol>${contents.join('')}</ol></nav>`)
}

const reportStyles = `
:root{color-scheme:light;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;color:#37363e;background:#eeeaf2;font-synthesis:none}*{box-sizing:border-box}body{margin:0;font-size:15px;line-height:1.75}button{font:inherit;cursor:pointer}button:focus-visible{outline:3px solid #8e84b0;outline-offset:3px}::selection{background:#e0d9f0}.report-toolbar{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:16px;max-width:960px;margin:20px auto;padding:0 24px}.report-toolbar button{padding:10px 20px;background:#575674;color:white;border:0;border-radius:10px;min-height:44px}.report{max-width:960px;margin:0 auto 40px;padding:48px 56px;background:#fffefa}.report-header{padding-bottom:24px;border-bottom:1px solid #dcd5df}.brand{font-weight:650;color:#5c557e;margin:0 0 12px}h1{font-family:"Noto Serif SC","Songti SC",serif;font-size:34px;line-height:1.3;margin:0 0 8px;overflow-wrap:anywhere}h2{font-size:24px;line-height:1.35;margin:0 0 18px}h3{font-size:17px;line-height:1.5;margin:16px 0 8px}p{margin:8px 0;overflow-wrap:anywhere}.subtitle{color:#665f70}.report-meta{display:flex;flex-wrap:wrap;gap:14px 32px;margin:24px 0}.report-meta dt,.meta,.source,figcaption{color:#665f70;font-size:13px}.report-meta dd{margin:0}section{margin-top:38px}section>h2{padding-bottom:12px;border-bottom:1px solid #ded8e0}.notice{background:#f2eef5;padding:12px 16px;border-radius:8px;color:#504861}.empty{color:#665f70;padding:12px 0}.floorplan{margin:18px auto;max-width:650px;text-align:center}.floorplan svg{display:block;width:100%;max-height:370px;overflow:visible}.floorplan figcaption{margin-top:12px}.drawing-original{margin:22px 0}.drawing-original summary{font-weight:600;margin-bottom:10px}.drawing-original img,.original-drawing img{display:block;max-width:100%;max-height:360px;object-fit:contain;margin:auto}.context-list>div{margin:16px 0}.context-list dt{font-weight:600}.context-list dd{margin:4px 0}.requirements{list-style:none;padding:0;margin:0}.requirements>li{padding:18px 0;border-bottom:1px solid #e4dfe7}.item-heading{display:flex;justify-content:space-between;gap:16px;align-items:baseline}.item-heading>span{font-size:13px;flex-shrink:0}.item-heading strong{overflow-wrap:anywhere}.insights{padding-left:24px}.insights>li{padding-bottom:12px}.comparison-item{padding:16px 0;border-bottom:1px solid #ded8e0}.comparison-demand{color:#57515f}.vendor-response{margin-top:18px}.vendor-response blockquote{margin:8px 0;padding:12px 16px;background:#f5f2f7;border-radius:8px;overflow-wrap:anywhere}.result{font-weight:650}.result.conflict{color:#943e3b}.result.partial,.result.unknown{color:#7a4b21}.pending-list,.assessment-issues{padding-left:22px}.pending-list>li,.assessment-issues>li{margin-bottom:18px}.pending-list p{font-size:13px;color:#665f70}.assessment{margin-bottom:26px}table{border-collapse:collapse;width:100%;table-layout:fixed;font-size:13px}th,td{border-bottom:1px solid #ddd6e0;padding:9px 10px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th:first-child{width:24%}th:nth-child(2){width:18%}thead{background:#f2eef5}.timeline{list-style:none;padding:0}.timeline li{display:grid;grid-template-columns:155px 1fr;gap:18px;margin-bottom:10px}.timeline time{font-size:13px;color:#665f70}.report-footer{margin-top:40px;padding-top:18px;border-top:1px solid #ded8e0;font-size:12px;color:#665f70}
@media(max-width:640px){.report{padding:28px 20px;margin-bottom:0}.report-toolbar{padding:0 16px;align-items:flex-start;font-size:13px}.report-toolbar button{padding:9px 13px;flex-shrink:0}.report-meta{display:block}.report-meta>div{margin:10px 0}h1{font-size:28px}h2{font-size:21px}.item-heading{flex-wrap:wrap;gap:3px 12px}.timeline li{grid-template-columns:1fr;gap:2px}th,td{padding:7px 5px}}
@page{size:A4;margin:16mm 15mm 17mm}@media print{:root,body{background:white;color:#292631}body{font-size:10.5pt;line-height:1.6}.report-toolbar{display:none}.report{max-width:none;margin:0;padding:0;background:white}.report-header{padding-bottom:14px}h1{font-size:25pt}h2{font-size:17pt;break-after:avoid}h3{font-size:12pt;break-after:avoid}section{margin-top:24px}.report-meta dt,.meta,.source,figcaption{font-size:9pt}.notice{print-color-adjust:exact;-webkit-print-color-adjust:exact}.floorplan{max-width:150mm;break-inside:avoid}.floorplan svg{max-height:75mm}.drawing-original,.original-drawing{break-inside:avoid}.drawing-original img,.original-drawing img{max-height:70mm}.item-heading{break-after:avoid}.requirements>li,.insights>li,.pending-list>li,.comparison-item,.vendor-response,.assessment-issues>li{break-inside:avoid}.vendor-response blockquote{print-color-adjust:exact;-webkit-print-color-adjust:exact}table{font-size:9pt}thead{display:table-header-group}tr{break-inside:avoid}.timeline li{break-inside:avoid}.report-footer{font-size:9pt}a{color:inherit;text-decoration:none}p{orphans:3;widows:3}}
.report-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin:26px 0}.report-summary>div{display:grid;padding:14px 0;border-top:1px solid #dcd5df}.report-summary b{font-size:28px;font-weight:600;color:#575674}.report-summary span{font-size:12px;color:#665f70}.priority{display:inline-block;font-size:12px;font-weight:650;padding:3px 8px;border-radius:4px;white-space:nowrap}.priority-p1{color:#663f32;background:#f3e6de}.priority-p2{color:#4e496b;background:#eeebf4}.priority-key{font-size:13px}.report-contents{margin-top:26px}.report-contents h2{font-size:18px;margin-bottom:12px}.report-contents ol{list-style:none;display:grid;grid-template-columns:1fr 1fr;padding:0;gap:7px 24px}.report-contents a{color:#575674;text-decoration:none}.report-contents li span,.chapter-number{display:inline-block;margin-right:12px;color:#70637e}.room-section{margin:22px 0}.room-section>h3{background:#f2eef5;padding:10px 12px}.room-section h3 small{display:block;font-weight:400;font-size:12px;color:#665f70}.action-table th:first-child{width:23%}.action-table th:nth-child(2){width:55%}.action-table p{margin:4px 0}.action-table td small{font-size:11px;overflow-wrap:anywhere}.action-table td:last-child{font-size:12px}.room-section h3{break-after:avoid}.report-chapter{scroll-margin-top:20px}
@media(max-width:640px){.report-summary{grid-template-columns:1fr 1fr}.report-contents ol{grid-template-columns:1fr}.action-table .priority{white-space:normal;font-size:10px;padding:2px 4px}}
@page{size:A4;margin:17mm 15mm 19mm;@top-left{content:"安居有数 · 项目沟通报告";font-family:sans-serif;font-size:8pt;color:#70637e}@bottom-right{content:"第 " counter(page) " 页 / 共 " counter(pages) " 页";font-family:sans-serif;font-size:8pt;color:#70637e}}
@media print{.report-header{break-after:page}.report-summary{grid-template-columns:repeat(4,1fr)}.report-contents ol{grid-template-columns:1fr 1fr}.report-chapter{break-before:auto;margin-top:24px}#chapter-1,#chapter-2,#chapter-4{break-before:page;margin-top:0}.report-chapter:has(.comparison-items){break-before:page;margin-top:0}.report-chapter>h2{margin-bottom:16px}.priority,.room-section>h3{print-color-adjust:exact;-webkit-print-color-adjust:exact}.priority{font-size:9pt}.action-table .priority{font-size:8pt;white-space:normal}.action-table{font-size:9pt}.action-table td:last-child{font-size:9pt}.comparison-item{break-inside:avoid}.vendor-response{break-inside:avoid}.vendor-response .item-heading{break-after:avoid}.report-contents a{font-size:10pt}.report-summary b{font-size:24pt}.report-summary span{font-size:9pt}.requirements>li{padding:10px 0}.requirements p{margin:4px 0}.room-section{margin:14px 0}.vendor-response{margin-top:10px}.vendor-response p{margin:4px 0}.vendor-response blockquote{margin:5px 0;padding:8px 12px}.comparison-item{padding:10px 0}.comparison-item h3{margin-top:10px}.report-chapter>h2{font-size:16pt}}

`

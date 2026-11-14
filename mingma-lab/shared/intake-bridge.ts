import type { IntakeDocument, IntakeItem } from './intake-contract'
import { newIntakeState } from './intake-state'

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const scopeNames = { global: '全局硬装', area: '分区域需求', shared: '过渡与公共项', unassigned: '归属待确认' }
const necessityNames = { must: '必须满足', prefer: '优先偏好', optional: '可选', undecided: '待决定', excluded: '本次不做' }
const standardNames = { user_stated: '用户提供', to_measure: '待测量', to_confirm: '待确认', proposal_required: '待商家说明' }

export function intakeRequirementRow(requirement: { id: string; title: string; description: string; room: string; category: string; pending: string[]; intake?: IntakeItem }, index: number): string {
  const item = requirement.intake!
  return `<article class="requirement-row intake-requirement" data-intake-adopted="${esc(requirement.id)}" data-requirement-id="${esc(requirement.id)}">
    <span class="req-order">${String(index + 1).padStart(2, '0')}</span>
    <div class="req-content min-w-0 flex-1">
      <div class="req-meta">${esc(scopeNames[item.scope])} · ${esc(requirement.room)} / ${esc(requirement.category)} <span>${esc(requirement.id)}</span></div>
      <h3>${esc(requirement.title)}</h3><p>${esc(requirement.description)}</p>
      ${item.standards.length ? `<details class="intake-adopted-details"><summary>查看 ${item.standards.length} 项可检查标准</summary><ul>${item.standards.map(s => `<li><b>${esc(s.metric)}</b>：${s.value === null ? esc(standardNames[s.status]) : `${esc(s.value)}${esc(s.unit || '')}（${esc(standardNames[s.status])}）`}<br><small>${esc(s.verification)}</small></li>`).join('')}</ul></details>` : ''}
      <div class="req-pending">${requirement.pending.length ? `待确认：${esc(requirement.pending.join('；'))}` : '本条使用要求已由用户确认，现场条件仍需按方案核实。'}</div>
      <details class="intake-adopted-details"><summary>需求来源与确认</summary><p>${item.origin === 'suggestion' ? 'AI 补充建议，已由用户采纳。' : '依据用户表达整理，已由用户核对措辞。'}</p>${item.evidence.map(e => `<blockquote>${esc(e.quote)}</blockquote>`).join('')}</details>
    </div>
    <div class="req-controls"><span class="status ${item.necessity === 'must' ? 'responded' : 'partial'}">${esc(necessityNames[item.necessity])}</span><button class="text-button" data-action="edit-requirement" data-id="${esc(requirement.id)}">返回共创编辑</button></div>
  </article>`
}
export function intakeDocumentNote(doc?: IntakeDocument): string {
  if (!doc) return ''
  const deferred = doc.result.items.filter(i => i.necessity === 'undecided')
  const excluded = doc.result.items.filter(i => i.necessity === 'excluded')
  const unaccepted = doc.result.items.filter(i => i.origin === 'suggestion' && !doc.acceptedSuggestionIds.includes(i.id) && !['undecided', 'excluded'].includes(i.necessity))
  if (!deferred.length && !excluded.length && !unaccepted.length) return ''
  return `<div class="notice">共创文档还保留 ${deferred.length} 条待决定、${excluded.length} 条本次不做、${unaccepted.length} 条未采纳建议。这些内容没有作为商家必须执行项。<button class="text-button" data-action="view-adopted-intake">查看已采用共创文档</button></div>`
}

export function adoptedIntakeHtml(doc: IntakeDocument): string {
  const labels = { household: '使用者与生活习惯', schedule: '居住安排与时间', confirmation: '交付与确认方式' }
  const background = doc.projectContext?.length ? `<section><h3>当时的项目背景</h3>${doc.projectContext.map(entry => `<p><b>${labels[entry.id]}</b> · ${entry.confirmed ? '用户已核对' : '待用户核对'}<br>${esc(entry.text)}</p>`).join('')}</section>` : ''
  return `<p>这份文档对应当前需求清单，包含当时采用的内容与保留的待定项。它与后来尚未采用的访谈草稿分别保存。</p><blockquote>${esc(doc.brief)}</blockquote>${background}${doc.result.items.map(item => `<section><h3>${esc(item.id)} · ${esc(item.title)}</h3><p>${esc(scopeNames[item.scope])} · ${esc(item.areas.join('、') || '未限定区域')} · ${esc(necessityNames[item.necessity])}</p><p>${esc(item.description)}</p>${item.pending.length ? `<ul>${item.pending.map(p => `<li>${esc(p.question)}</li>`).join('')}</ul>` : ''}</section>`).join('')}<p class="muted">选择“用此文档替换访谈草稿”会替换尚未采用的访谈，请先导出需要保留的内容。已发布的需求版本保持不变。</p>`
}
export function stateFromAdoptedIntake(doc: IntakeDocument) {
  return {
    ...newIntakeState(doc.brief), areas: structuredClone(doc.areas), answers: structuredClone(doc.answers),
    result: structuredClone(doc.result), stage: 'draft' as const,
    projectContext: structuredClone(doc.projectContext || []),
    acceptedSuggestionIds: [...doc.acceptedSuggestionIds], reviewedIds: [],
  }
}

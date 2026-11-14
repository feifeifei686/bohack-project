import type { IntakeDocument, IntakeItem, IntakePending } from './intake-contract.ts'

export type ContextField = { text: string; confirmed: boolean }
export type ContextId = 'household' | 'schedule' | 'confirmation'
export type ProjectContext = Record<ContextId, ContextField>
export type LegacyScaleValue = { maturity: number; priority: string; evidence: string }
export type LegacyScales = Record<string, LegacyScaleValue>
export type HubRequirement = { id: string; title: string; pending: string[]; intake?: IntakeItem }
export type RequirementPending = {
  requirementId: string
  requirementTitle: string
  question: string
  owner: IntakePending['owner']
  ownerLabel: string
  blocking: boolean
}
type DimensionLabel = { id: string; name: string }

const contextFields: { id: ContextId; legacyId: string; title: string; help: string; placeholder: string }[] = [
  { id: 'household', legacyId: 'O01', title: '使用者与生活习惯', help: '只记录会影响空间使用的背景。', placeholder: '例如：两人经常做饭，希望清洁更省心。' },
  { id: 'schedule', legacyId: 'O08', title: '居住安排与时间', help: '记录施工期间的生活安排和需要协商的时间。', placeholder: '例如：施工期间继续居住，厨房不能长期停用；时间尚待商家协商。' },
  { id: 'confirmation', legacyId: 'O09', title: '交付与确认方式', help: '说明谁参与确认，以及需要商家提供哪些资料。', placeholder: '例如：希望先看逐项清单和点位示意，由我和家人一起确认。' },
]
const ownerLabels: Record<IntakePending['owner'], string> = {
  user: '业主确认', merchant: '商家说明', site: '现场核实', professional: '专业复核', unassigned: '责任人待定',
}
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const owns = (value: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(value, key)

/** Canonical entries, including deliberately cleared text, always win over history. */
export function initializeProjectContext(value: unknown, legacyScales: LegacyScales): ProjectContext {
  const canonical = record(value) ? value : {}
  const legacy = record(legacyScales) ? legacyScales : {}
  const result = {} as ProjectContext
  for (const field of contextFields) {
    if (owns(canonical, field.id)) {
      const entry = record(canonical[field.id]) ? canonical[field.id] as Record<string, unknown> : {}
      const text = typeof entry.text === 'string' ? entry.text : ''
      result[field.id] = { text, confirmed: Boolean(text.trim()) && entry.confirmed === true }
    } else {
      const entry = record(legacy[field.legacyId]) ? legacy[field.legacyId] as Record<string, unknown> : {}
      const text = typeof entry.evidence === 'string' ? entry.evidence : ''
      result[field.id] = { text, confirmed: Boolean(text.trim()) && entry.maturity === 3 }
    }
  }
  return result
}

export function contextAnswers(context: ProjectContext): { id: ContextId; text: string; confirmed: boolean }[] {
  return contextFields.flatMap(({ id }) => {
    const field = context[id]
    return field.text.trim() ? [{ id, text: field.text, confirmed: field.confirmed === true }] : []
  })
}

/** A new background cannot be published beside an AI draft generated from older inputs. */
export function projectContextChanged(context: ProjectContext, document?: IntakeDocument): boolean {
  if (!document) return false
  const signature = (values: { id: string; text: string; confirmed: boolean }[]) => JSON.stringify(values.map(value => ({ id: value.id, text: value.text.trim(), confirmed: value.confirmed })).sort((a, b) => a.id.localeCompare(b.id)))
  return signature(contextAnswers(context)) !== signature(document.projectContext || [])
}

/** Current requirement facts are the only editable source; this is a derived view. */
export function deriveRequirementPending(requirements: readonly HubRequirement[]): RequirementPending[] {
  const seen = new Set<string>()
  const result: RequirementPending[] = []
  for (const requirement of requirements) {
    const pending: IntakePending[] = requirement.intake
      ? requirement.intake.pending
      : requirement.pending.map(question => ({ question, owner: 'unassigned', kind: 'detail', blocking: false }))
    for (const entry of pending) {
      if (!entry.question.trim()) continue
      const owner = Object.prototype.hasOwnProperty.call(ownerLabels, entry.owner) ? entry.owner : 'unassigned'
      const key = `${requirement.id}\u0000${owner}\u0000${entry.question.trim().replace(/\s+/g, ' ')}`
      if (seen.has(key)) continue
      seen.add(key)
      result.push({ requirementId: requirement.id, requirementTitle: requirement.title, question: entry.question, owner, ownerLabel: ownerLabels[owner], blocking: entry.blocking === true })
    }
  }
  return result
}

export function renderRequirementsOverview(requirements: readonly HubRequirement[], intakeDocument?: IntakeDocument, context?: ProjectContext): string {
  const pending = deriveRequirementPending(requirements)
  const ownerDecisions = pending.filter(item => item.owner === 'user' || item.owner === 'unassigned').length
  const externalChecks = pending.length - ownerDecisions
  const deferred = intakeDocument?.result.items.filter(item => item.necessity === 'undecided').length || 0
  const unaccepted = intakeDocument?.result.items.filter(item => item.origin === 'suggestion' && !intakeDocument.acceptedSuggestionIds.includes(item.id) && !['undecided', 'excluded'].includes(item.necessity)).length || 0
  const contextValues = context ? contextFields.map(field => context[field.id]) : []
  const missingContext = contextValues.filter(field => !field.text.trim()).length
  const unconfirmedContext = contextValues.filter(field => field.text.trim() && !field.confirmed).length
  return `<section class="hub-overview" aria-labelledby="hub-overview-title">
    <div class="hub-section-heading"><div><h2 id="hub-overview-title">待补充与待确认</h2><p>直接汇总这份需求中的信息缺口，补充内容回到原需求里。</p></div><span class="hub-count" data-hub-pending-count>${pending.length} 处待确认</span></div>
    ${!requirements.length ? '<p class="hub-empty">先用自己的话说说想改什么，形成清单后，这里会汇总需要你、商家或现场人员补充的信息。</p>' : pending.length
      ? `<p class="hub-summary">${ownerDecisions ? `${ownerDecisions} 处需要业主决定或分配责任人` : '目前没有记录需要业主作出的取舍'}${externalChecks ? `；${externalChecks} 处需商家说明或现场、专业复核` : ''}。</p><details class="hub-pending-list" ${pending.length <= 3 ? 'open' : ''}><summary>查看 ${pending.length} 处信息缺口</summary><ul>${pending.map(item => `<li class="hub-pending-row"><div class="hub-pending-copy"><span class="hub-owner">${esc(item.ownerLabel)}${item.blocking ? ' · 影响方案方向' : ''}</span><p>${esc(item.question)}</p><small>${esc(item.requirementId)} · ${esc(item.requirementTitle)}</small></div><button type="button" class="hub-link" data-action="hub-locate" data-id="${esc(item.requirementId)}">查看对应需求</button></li>`).join('')}</ul></details>`
      : '<p class="hub-empty">当前清单没有记录待确认事项。需要检查遗漏时，可以继续需求共创；这不代表现场条件已核实。</p>'}
    ${missingContext || unconfirmedContext ? `<p class="hub-context-hint">项目背景中，${missingContext ? `${missingContext} 项尚未补充` : ''}${missingContext && unconfirmedContext ? '，' : ''}${unconfirmedContext ? `${unconfirmedContext} 项已有内容待你核对` : ''}。可在本页“项目背景”中完善，保存后会带入下一次 AI 梳理。</p>` : ''}
    ${deferred || unaccepted ? `<div class="hub-document-note"><p>已采用的共创文档还保留 ${deferred} 条待决定事项和 ${unaccepted} 条未采纳建议，未列为本次商家义务。</p><button type="button" class="hub-link" data-action="view-adopted-intake">查看原共创文档</button></div>` : ''}
  </section>`
}

export function renderProjectContext(context: ProjectContext): string {
  const filled = contextFields.filter(({ id }) => context[id].text.trim()).length
  const confirmed = contextFields.filter(({ id }) => context[id].text.trim() && context[id].confirmed).length
  return `<details class="hub-context" id="project-context">
    <summary><span><strong>项目背景</strong><small>使用习惯、居住安排与确认方式</small></span><span class="hub-context-progress">已补充 ${filled} 项 · 已核对 ${confirmed} 项</span></summary>
    <div class="hub-context-body"><p class="hub-context-intro">这些背景只在这里维护，不重复填写到另一张量表。按实际情况补充，暂不清楚的可以留空；保存后会带入下一次 AI 梳理。</p>
    <form id="project-context-form" class="hub-context-form">
      ${contextFields.map(field => {
        const value = context[field.id]
        const hasText = Boolean(value.text.trim())
        const confirmed = hasText && value.confirmed
        return `<div class="hub-context-field"><div class="hub-field-heading"><label for="context-${field.id}">${field.title}</label><span class="hub-state ${confirmed ? 'hub-state--confirmed' : ''}" data-context-state="${field.id}">${!hasText ? '待补充' : confirmed ? '已确认' : '待确认'}</span></div><p class="hub-field-help" id="context-help-${field.id}">${field.help}</p><textarea id="context-${field.id}" name="${field.id}" data-context-text="${field.id}" aria-describedby="context-help-${field.id}" rows="3" maxlength="1200" placeholder="${field.placeholder}">${esc(value.text)}</textarea><label class="hub-confirm" for="context-confirm-${field.id}"><input id="context-confirm-${field.id}" name="confirm-${field.id}" data-context-confirm="${field.id}" type="checkbox" ${confirmed ? 'checked' : ''} ${hasText ? '' : 'disabled'}/><span>这些信息已由我核对</span></label></div>`
      }).join('')}
      <div class="hub-context-actions"><p>背景信息不会自动改写已发布的需求或变成施工项目。</p><button type="submit" class="hub-button">保存项目背景</button></div>
    </form></div>
  </details>`
}

export function renderLegacyArchive(legacyScales: LegacyScales, ownerDimensions: readonly DimensionLabel[], merchantDimensions: readonly DimensionLabel[]): string {
  if (!record(legacyScales)) return ''
  const labels = new Map([...ownerDimensions, ...merchantDimensions].map(dimension => [dimension.id, dimension.name]))
  const merchantIds = new Set(merchantDimensions.map(dimension => dimension.id))
  const entries = Object.entries(legacyScales).filter(([, entry]) => record(entry) && (
    (typeof entry.evidence === 'string' && Boolean(entry.evidence.trim())) ||
    (typeof entry.maturity === 'number' && entry.maturity !== 0) ||
    (typeof entry.priority === 'string' && entry.priority !== '' && entry.priority !== '必须')
  ))
  if (!entries.length) return ''
  return `<details class="hub-archive"><summary><span><strong>以前填写的记录</strong><small>${entries.length} 项旧维度记录，保留供追溯</small></span></summary><div class="hub-archive-body"><p>这里保留旧表的原文与历史分值，供查看和导出。当前需求在本页清单中维护，历史分值不参与新的完成状态判断。</p><ol class="hub-archive-list">${entries.map(([id, entry]) => `<li><div class="hub-archive-heading"><h3>${esc(labels.get(id) || id)}</h3><span>${merchantIds.has(id) ? '原商家记录' : '原业主记录'} · ${esc(id)}</span></div><p class="hub-archive-meta">历史重要程度：${esc(entry.priority || '未记录')}；历史信息成熟度：${esc(entry.maturity ?? '未记录')}</p><blockquote>${typeof entry.evidence === 'string' && entry.evidence.trim() ? esc(entry.evidence) : '当时未填写原文依据。'}</blockquote></li>`).join('')}</ol><button type="button" class="hub-link" data-action="export-scales">导出旧记录</button></div></details>`
}

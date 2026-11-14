import { requestIntake } from './intake-request.ts'
import './intake-ui.css'
import type { PlanningModel } from './planning-floorplan'
import { intakeSpatialFocus, type SpatialFocus } from './intake-spatial-focus.ts'
import type { IntakeDocument, IntakeItem, IntakeLegacyRequirement, IntakeResponse, IntakeScope, Necessity, IntakeProjectContextEntry } from './intake-contract.ts'
import {
  IntakeRequestGate, adoptionIssues, adoptionPayload, answerQuestion, applyIntakeResult,
  deferConflict, editIntakeItem, includedItems, intakeDocument, necessityLabels,
  newIntakeState, ownerLabels, pendingQuestions, restoreIntakeState, scopeLabels,
  toIntakeRequest, syncProjectContext, projectContextLabels, type IntakeState,
} from './intake-state.ts'

type Options = {
  variant: 'atmosphere' | 'lucid' | 'atelier'
  initialBrief: string
  storage?: Pick<Storage, 'getItem' | 'setItem'>
  existingCount: number
  projectContext?: IntakeProjectContextEntry[]
  planningArea?: string | null
  spatialModel?: PlanningModel
  onSpatialFocus?: (focus: SpatialFocus, phase: IntakeState['stage'] | 'analyzing') => void
  onFirstExpression?: () => void
  onAdopt: (requirements: IntakeLegacyRequirement[], document: IntakeDocument) => void
  onNotice?: (message: string) => void
}
type Filter = 'all' | IntakeScope | 'pending'
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const clone = <T>(value: T): T => structuredClone(value)
const areaChoices = ['客厅', '卧室', '厨房', '卫生间', '玄关', '公共走道']
const standardStatus = { user_stated: '用户提供，待复核', to_measure: '现场待测', to_confirm: '待确认', proposal_required: '请商家说明' }
const standardValue = (standard: IntakeItem['standards'][number]) => standard.value === null
  ? ['quantity', 'measurement', 'professional'].includes(standard.kind) ? '数值未确认' : '按回应条件核对'
  : `${standard.value}${standard.unit ? ` ${standard.unit}` : ''}`
const dimensionLabels: Record<string, string> = { scope: '改造范围', goal: '生活目标', retention: '保留边界', necessity: '重要程度', usage: '使用场景', quantity: '数量与容量', material: '材料偏好', measurement: '尺寸与测量', dependency: '关联条件', shared: '公共交界' }
const icon = (name: 'arrow' | 'check' | 'spark' | 'download' | 'edit') => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${{
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>', check: '<path d="m5 12 4 4L19 6"/>',
  spark: '<path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3L12 3Z"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4"/>',
  edit: '<path d="m15 4 5 5M4 20l4-1L20 7a2 2 0 0 0-3-3L5 16l-1 4Z"/>',
}[name]}</svg>`

export function mountIntake(container: HTMLElement, options: Options): { dispose: () => void; focusExpression: () => void } {
  const key = `mingma-${options.variant}-intake-v2`
  const savedMessage = options.storage ? '仅保留本轮演示' : '已保存在此浏览器'
  let state = newIntakeState(options.initialBrief)
  let rawStored = ''
  let storageBlocked = false
  let storageError = ''
  try {
    rawStored = (options.storage ?? localStorage).getItem(key) || ''
    if (rawStored) state = restoreIntakeState(rawStored)
  } catch {
    storageBlocked = true
    storageError = '已有访谈记录无法读取，原记录已保留。你可以先导出，再开始新访谈。'
  }
  let contextSynchronized = false
  if (!storageBlocked && options.projectContext !== undefined) {
    const synced = syncProjectContext(state, options.projectContext)
    contextSynchronized = synced !== state
    state = synced
  }
  const planningArea = options.planningArea
  const areaAdded = !storageBlocked && !!planningArea && !state.areas.includes(planningArea) && state.areas.length < 12
  if (!storageBlocked && planningArea !== undefined) {
    state.stage = 'express'
    if (areaAdded) state.areas = [planningArea, ...state.areas]
  }
  let disposed = false
  let busy = false
  let retryAttempt = 0
  let requestFeedback: 'error' | 'cancelled' | null = null
  let expressionAcknowledged = false
  let error = ''
  let info = contextSynchronized && state.result ? '项目背景已更新，原草稿已保留；采用前请重新整理并核对。' : ''
  if (!storageBlocked && planningArea && !state.areas.includes(planningArea)) {
    info = `已选满 12 个区域。请先取消一个区域，再勾选${planningArea}。`
  }
  let filter: Filter = 'all'
  let areaCustom = ''
  let lastMode: 'refine' | 'draft' = 'refine'
  let lastRequestId = ''
  let controller: AbortController | null = null
  let lastMeta: IntakeResponse['meta'] | null = null
  const gate = new IntakeRequestGate()
  try { sessionStorage.removeItem('mingma-lan-ai-access') } catch {}
  container.classList.add('intake-root')
  container.dataset.variant = options.variant

  function persist() {
    if (storageBlocked) return
    try { (options.storage ?? localStorage).setItem(key, JSON.stringify(state)); storageError = '' }
    catch { storageError = '浏览器暂时无法保存，请导出需求文档留存。当前内容仍在页面中。' }
    const saved = container.querySelector('[data-intake-save-state]')
    if (saved) saved.textContent = storageError || savedMessage
  }
  function invalidateFlight() {
    gate.invalidate()
    controller?.abort(); controller = null
    busy = false
    requestFeedback = null
  }
  function contextChanged() {
    invalidateFlight()
    state.revision++
    if (state.result) state.needsAnalysis = true
    state.reviewedIds = []
    state.acceptedSuggestionIds = []
    state.replaceAcknowledged = false
    persist()
  }
  const button = (text: string, action: string, kind = 'secondary', attributes = '', disabled = false) => `<button type="button" class="intake-button intake-button--${kind}" data-intake-action="${action}" ${attributes} ${disabled ? 'disabled' : ''}>${text}</button>`
  const countPending = () => (state.result?.items || []).filter(item => item.pending.length || item.scope === 'unassigned' || item.clarity === 'vague' || item.necessity === 'undecided').length
  const scopeText = (item: IntakeItem) => `${scopeLabels[item.scope]}${item.areas.length ? ` · ${item.areas.join(' / ')}` : ''}`
  const sourceText = (id: string) => id === 'brief' ? '你的原话' : id.startsWith('answer:') ? '你的回答' : id.startsWith('context:') ? `项目背景 · ${projectContextLabels[id.slice(8) as keyof typeof projectContextLabels] || '已提供信息'}` : '已有草稿（待复核）'

  function projectContextMarkup() {
    const entries = state.projectContext || []
    if (!entries.length) return ''
    return `<details class="intake-project-context"><summary>已带入 ${entries.length} 条项目背景</summary><p class="intake-fine">这些信息来自“我的需求”，在这里无需重复填写；用户核对背景不等于现场条件已确认。</p>${entries.map(entry => `<section><h4>${projectContextLabels[entry.id]} <small>${entry.confirmed ? '用户已核对' : '待用户核对'}</small></h4><p>${esc(entry.text)}</p></section>`).join('')}<a href="#requirements">在我的需求中修改背景</a></details>`
  }

  function statusMarkup() {
    return `<div class="intake-feedback" aria-live="polite">
      ${storageError ? `<div class="intake-notice intake-notice--warning">${esc(storageError)}${rawStored ? button('导出原始记录', 'export-raw', 'text') : ''}</div>` : ''}
      ${error && requestFeedback !== 'error' ? `<div class="intake-notice intake-notice--error" role="alert"><p>${esc(error)}</p></div>` : ''}
      ${info ? `<p class="intake-notice">${esc(info)}</p>` : ''}
    </div>`
  }
  function requestStatusMarkup() {
    if (!busy && !requestFeedback) return ''
    const message = busy
      ? retryAttempt ? `连接暂时中断，AI 正在重试（${retryAttempt}/2）…` : lastMode === 'draft' ? 'AI 正在整理需求草稿…' : 'AI 正在梳理你的需求…'
      : requestFeedback === 'error' ? '本次整理未完成' : '已取消整理'
    const detail = requestFeedback === 'error' ? error : requestFeedback === 'cancelled' ? '已保留本轮输入和草稿。' : ''
    const actions = busy
      ? `${options.onSpatialFocus ? button('查看模型', 'locate-model', 'text') : ''}${button('取消整理', 'cancel', 'text')}`
      : `${requestFeedback === 'error' ? button('重新尝试', 'retry', 'primary') : ''}${button('关闭提醒', 'dismiss-request', 'text')}`
    return `<div class="intake-request-dock" data-intake-request-status="${busy ? 'busy' : requestFeedback}">
      <div class="intake-request-message" role="${requestFeedback === 'error' ? 'alert' : 'status'}">
        ${busy ? '<span class="intake-loading-mark" aria-hidden="true"></span>' : ''}
        <div><strong>${message}</strong>${detail ? `<p>${esc(detail)}</p>` : ''}${requestFeedback === 'error' && lastRequestId ? `<small>请求编号：${esc(lastRequestId)}</small>` : ''}</div>
      </div>
      <div class="intake-request-actions">${actions}</div>
    </div>`
  }

  function locate(target?: HTMLElement | null, anchor = target) {
    if (!target) return
    target.setAttribute('tabindex', '-1')
    target.focus({ preventScroll: true })
    anchor?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })
  }
  function introduction() {
    const choices = [...new Set([...areaChoices, ...state.areas])]
    return `<div class="intake-layout">
      <section class="intake-panel intake-expression" aria-labelledby="intake-expression-title">
        <div class="intake-section-heading"><h2 id="intake-expression-title">先说说，你想怎样生活。</h2><p>想改哪些地方，现在最不方便的是什么？有什么一定想保留？不用先懂施工术语。</p></div>
        <label class="intake-label" for="intake-brief">你的生活化需求</label>
        <textarea id="intake-brief" data-intake-field="brief" maxlength="4000" rows="7" placeholder="例如：厨房想好打理，洗碗机要有；客厅和走道地面想看着连贯。水电我不懂，希望先检查。" ${busy ? 'disabled' : ''}>${esc(state.brief)}</textarea>
        <div class="intake-input-meta"><span>可以先说重点，细节稍后一起补齐。</span><span data-intake-brief-count>${state.brief.length} / 4000</span></div>
        ${button('使用这个表达示例', 'sample', 'text', '', busy)}
        <fieldset class="intake-area-field"><legend>这次涉及哪些区域？<span>可多选，也可以暂不确定</span></legend><div class="intake-chips">${choices.map(area => `<label class="intake-chip"><input type="checkbox" data-intake-area="${esc(area)}" ${state.areas.includes(area) ? 'checked' : ''} ${busy ? 'disabled' : ''}/><span>${esc(area)}</span></label>`).join('')}</div><div class="intake-custom-area"><label class="intake-sr" for="intake-area-custom">补充自定义区域</label><input id="intake-area-custom" data-intake-field="area-custom" maxlength="40" placeholder="补充区域，如儿童房" value="${esc(areaCustom)}" ${busy ? 'disabled' : ''}/>${button('添加区域', 'add-area', 'secondary', '', busy)}</div></fieldset>
        <div class="intake-action-row"><span>AI 会先复述理解，再提出有针对性的问题。</span>${button(`开始梳理 ${icon('arrow')}`, 'start', 'primary', '', busy || storageBlocked)}</div>
        ${state.result ? button('返回已有需求草稿', 'show-draft', 'text', '', busy) : ''}
      </section>
      <aside class="intake-aside intake-panel"><h3>逐步整理成四组内容</h3><p>从你最在意的地方开始，把容易遗漏的关联项也留好位置。</p><ol class="intake-scope-guide"><li><b>全局硬装</b><span>水电现状、全屋保留边界与使用条件。</span></li><li><b>分区域需求</b><span>每个房间希望解决的具体问题。</span></li><li><b>过渡与公共项</b><span>门洞收口、相邻区域和连续构件。</span></li><li><b>待确认清单</b><span>你的取舍、现场待测和商家待说明。</span></li></ol><p class="intake-fine">没有户型图也能先说需求。尺寸没有依据时，会保留为待确认。</p></aside>
    </div>`
  }
  function summaryAside() {
    const items = state.result?.items || []
    return `<aside class="intake-aside intake-panel"><h3>正在整理的需求</h3><p>${items.length} 个条目 · ${countPending()} 项仍有待确认内容</p><div class="intake-summary-groups">${(['global', 'area', 'shared', 'unassigned'] as IntakeScope[]).map(scope => {
      const group = items.filter(x => x.scope === scope)
      return `<section><h4>${scope === 'unassigned' ? '归属待定' : scopeLabels[scope]}<span>${group.length}</span></h4>${group.length ? group.map(item => `<button type="button" class="intake-summary-item" data-intake-action="inspect-item" data-intake-id="${esc(item.id)}"><span>${esc(item.title)}</span><small>${item.origin === 'suggestion' ? '建议待采纳' : item.clarity === 'clear' ? '已表达' : '继续说清'}</small></button>`).join('') : '<p class="intake-fine">还没有相关内容</p>'}</section>`
    }).join('')}</div>${button('先看需求草稿', 'show-draft', 'secondary', '', busy)}<p class="intake-fine">待测与待商家说明的内容会保留，不需要你猜出专业数值。</p></aside>`
  }
  function historyMarkup() {
    if (!state.answers.length) return ''
    return `<details class="intake-history"><summary>回看与修改 ${state.answers.length} 条回答</summary><div>${state.answers.map((answer, index) => `<section class="intake-history-entry"><label class="intake-label" for="intake-history-${esc(answer.id)}">${index + 1}. ${esc(answer.question)}</label><textarea id="intake-history-${esc(answer.id)}" data-intake-answer="${esc(answer.id)}" maxlength="2000" rows="2" ${busy ? 'disabled' : ''}>${esc(answer.answer)}</textarea><div class="intake-history-foot"><span>${answer.disposition === 'deferred' ? '已暂缓，后续保留为待办' : '已记录你的回答'}</span>${button('移除此回答', 'remove-answer', 'text', `data-intake-id="${esc(answer.id)}"`, busy)}</div></section>`).join('')}</div></details>`
  }
  function conversation(question = pendingQuestions(state)[0]) {
    if (question && state.reply.questionId !== question.id) state.reply = { questionId: question.id, selected: [], free: '' }
    const target = state.result?.items.find(x => x.id === question?.targetId)
    return `<div class="intake-layout"><section class="intake-panel intake-conversation"><div class="intake-understanding"><span class="intake-assistant-symbol">${icon('spark')}</span><div><h2>我对你的理解</h2><p>${esc(state.result?.summary)}</p></div></div>
      <div class="intake-understanding-actions">${button('补充或纠正原始表达', 'edit-brief', 'text', '', busy)}${state.needsAnalysis ? '<span class="intake-tag">新回答待整理</span>' : ''}</div>
      ${question ? `<form data-intake-form="answer" class="intake-question"><p class="intake-question-context">${esc(target?.title || '整体改造范围')} · ${esc(dimensionLabels[question.dimension] || question.dimension)}</p><h3>${esc(question.text)}</h3><p class="intake-question-reason">${esc(question.reason)}</p><fieldset class="intake-options"><legend class="intake-sr">${esc(question.text)}（${question.allowMultiple ? '可多选' : '单选'}）</legend>${question.options.map((choice, index) => `<label class="intake-option"><input type="${question.allowMultiple ? 'checkbox' : 'radio'}" id="intake-choice-${esc(question.id)}-${index}" name="intake-choice" data-intake-choice="${esc(choice)}" value="${esc(choice)}" ${state.reply.selected.includes(choice) ? 'checked' : ''} ${busy ? 'disabled' : ''}/><span>${esc(choice)}</span><span class="intake-choice-mark" aria-hidden="true">${icon('check')}</span></label>`).join('')}</fieldset><span class="intake-fine">${question.allowMultiple ? '可选择多个符合情况的选项。' : '选择最符合情况的一项。'}也可以直接写下自己的回答。</span><label class="intake-label" for="intake-free-answer">自由补充</label><textarea id="intake-free-answer" data-intake-field="free-answer" rows="3" maxlength="2000" placeholder="选项没有说全的部分，写在这里…" ${busy ? 'disabled' : ''}>${esc(state.reply.free)}</textarea><div class="intake-action-row">${button('暂时跳过', 'skip', 'text', '', busy)}<button type="submit" class="intake-button intake-button--primary" data-intake-action="answer" ${busy ? 'disabled' : ''}>确认回答 ${icon('arrow')}</button></div></form>` : `<div class="intake-question"><h3>${state.needsAnalysis ? '这些新回答，准备好一起整理了。' : '可以先看一份需求草稿。'}</h3><p>${esc(state.result?.stopReason || '已有内容会形成可编辑草稿，现场条件和未决事项继续保留。')}</p><div class="intake-action-row">${button('查看现有草稿', 'show-draft', 'secondary', '', busy)}${button(state.needsAnalysis ? '整理最新草稿' : '继续检查信息缺口', state.needsAnalysis ? 'draft-latest' : 'analyze', 'primary', '', busy)}</div></div>`}
      ${historyMarkup()}
    </section>${summaryAside()}</div>`
  }
  function renderItem(item: IntakeItem) {
    const isIncluded = includedItems(state).some(x => x.id === item.id)
    const reviewed = state.reviewedIds.includes(item.id)
    const edited = state.editedIds.includes(item.id)
    return `<article class="intake-item ${reviewed && isIncluded ? 'is-reviewed' : ''}" data-intake-item="${esc(item.id)}" tabindex="-1">
      <div class="intake-item-heading"><div><p class="intake-item-context">${esc(scopeText(item))} <span>${esc(item.id)}</span></p><h3>${esc(item.title || '未命名需求')}</h3></div><span class="intake-tag ${reviewed && isIncluded ? 'intake-tag--confirmed' : ''}">${reviewed && isIncluded ? '你已确认' : item.origin === 'suggestion' ? 'AI 建议' : edited ? '你已编辑' : '来自你的表达'}</span></div>
      <p class="intake-description">${esc(item.description || '请展开编辑，补充这条需求的描述。')}</p>
      ${item.standards.length ? `<div class="intake-standards"><h4>可检查条件</h4>${item.standards.map(standard => `<div class="intake-standard"><div><b>${esc(standard.metric)}</b><span class="intake-standard-value">${esc(standardValue(standard))}</span><small>${standardStatus[standard.status]}</small></div><p>${esc(standard.verification)}</p></div>`).join('')}</div>` : '<p class="intake-fine intake-no-standard">具体回应条件待补充，不自动生成工程数值。</p>'}
      ${item.pending.length ? `<details class="intake-pending"><summary>${item.pending.length} 项待确认${item.pending.some(x => x.blocking && ['user', 'unassigned'].includes(x.owner)) ? ' · 包含业主决策' : ''}</summary><ul>${item.pending.map(p => `<li><span class="intake-owner">${ownerLabels[p.owner]}</span><span>${esc(p.question)}${p.blocking ? '<small>影响当前方案方向</small>' : ''}</span></li>`).join('')}</ul></details>` : ''}
      <details class="intake-editor" ${item.title === '新的需求' ? 'open' : ''}><summary>${icon('edit')} 编辑范围与描述</summary><div class="intake-editor-grid">
        <label>需求名称<input maxlength="100" id="intake-edit-title-${esc(item.id)}" data-intake-edit="title" data-intake-id="${esc(item.id)}" value="${esc(item.title)}" ${busy ? 'disabled' : ''}/></label>
        <label>作用范围<select id="intake-edit-scope-${esc(item.id)}" data-intake-edit="scope" data-intake-id="${esc(item.id)}" ${busy ? 'disabled' : ''}>${Object.entries(scopeLabels).map(([value, label]) => `<option value="${value}" ${item.scope === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
        <label class="intake-full">关联区域<input id="intake-edit-areas-${esc(item.id)}" data-intake-edit="areas" data-intake-id="${esc(item.id)}" maxlength="300" value="${esc(item.areas.join('、'))}" placeholder="例如：客厅、公共走道" ${['global', 'unassigned'].includes(item.scope) || busy ? 'disabled' : ''}/><small>全局项关联全屋；归属不明时先保持待定。</small></label>
        <label>工程类别<input id="intake-edit-category-${esc(item.id)}" data-intake-edit="category" data-intake-id="${esc(item.id)}" maxlength="80" value="${esc(item.category)}" ${busy ? 'disabled' : ''}/></label>
        <label>构件<input id="intake-edit-component-${esc(item.id)}" data-intake-edit="component" data-intake-id="${esc(item.id)}" maxlength="80" value="${esc(item.component)}" ${busy ? 'disabled' : ''}/></label>
        <label class="intake-full">希望达到什么效果<textarea id="intake-edit-description-${esc(item.id)}" data-intake-edit="description" data-intake-id="${esc(item.id)}" rows="3" maxlength="2000" ${busy ? 'disabled' : ''}>${esc(item.description)}</textarea><small>修改描述后，原有数值标准会重新标为待确认。</small></label>
      </div></details>
      ${item.evidence.length ? `<details class="intake-evidence"><summary>查看原话依据${edited ? '（当前描述已有你的修改）' : ''}</summary>${item.evidence.map(e => `<blockquote><small>${sourceText(e.sourceId)}</small><p>${esc(e.quote)}</p></blockquote>`).join('')}</details>` : `<p class="intake-fine">${edited ? '由你补充的内容，采用前请确认。' : '没有用户原话依据，保留为待采纳建议。'}</p>`}
      <div class="intake-item-footer"><label class="intake-necessity">重要程度<select id="intake-edit-necessity-${esc(item.id)}" data-intake-edit="necessity" data-intake-id="${esc(item.id)}" aria-label="${esc(item.title)}的重要程度" ${busy ? 'disabled' : ''}>${Object.entries(necessityLabels).map(([value, label]) => `<option value="${value}" ${item.necessity === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><div class="intake-confirmations">
        ${item.origin === 'suggestion' ? `<label class="intake-check"><input type="checkbox" id="intake-accept-${esc(item.id)}" data-intake-accept="${esc(item.id)}" ${state.acceptedSuggestionIds.includes(item.id) ? 'checked' : ''} ${busy ? 'disabled' : ''}/><span>采纳这条建议</span></label>` : ''}
        <label class="intake-check"><input type="checkbox" id="intake-review-${esc(item.id)}" data-intake-review="${esc(item.id)}" ${reviewed && isIncluded ? 'checked' : ''} ${!isIncluded || busy ? 'disabled' : ''}/><span>我已核对这一条的范围与描述</span></label>
      </div></div>
      ${!isIncluded ? `<p class="intake-item-disposition">${item.necessity === 'excluded' ? '已排除本次范围，仍保留在访谈记录中。' : item.necessity === 'undecided' ? '暂不纳入本次确定范围，保留为业主待决项。' : '采纳建议后，才会进入拟确认清单。'}</p>` : ''}
    </article>`
  }
  function draft() {
    const result = state.result!
    const items = result.items
    const included = includedItems(state)
    const counts = { all: items.length, global: items.filter(x => x.scope === 'global').length, area: items.filter(x => x.scope === 'area').length, shared: items.filter(x => x.scope === 'shared').length, pending: countPending() }
    const selected = items.filter(item => filter === 'all' || filter === item.scope || (filter === 'pending' && (item.pending.length || item.scope === 'unassigned' || item.clarity === 'vague' || item.necessity === 'undecided')))
    const issues = adoptionIssues(state, options.existingCount)
    const reviewed = included.filter(x => state.reviewedIds.includes(x.id)).length
    return `<section class="intake-draft" aria-labelledby="intake-draft-title"><div class="intake-draft-heading"><div><h2 id="intake-draft-title">把这份清单，确认成你的需求。</h2><p>${items.length} 个条目 · 拟纳入 ${included.length} 项 · 已逐项确认 ${reviewed} 项</p></div><div class="intake-inline-actions">${button(`${icon('download')} 导出文档`, 'export-md', 'secondary')}${button('导出 JSON', 'export-json', 'text')}${button('补充一条', 'add-item', 'secondary', '', busy)}</div></div>
      ${state.needsAnalysis ? `<div class="intake-notice intake-notice--warning"><p>你有新的表达或回答尚未整理。现有草稿仍保留，采用前请先更新。</p>${button('整理最新草稿', 'draft-latest', 'primary', '', busy)}</div>` : ''}
      ${result.conflicts.length ? `<section class="intake-conflicts"><h3>先处理这些取舍</h3>${result.conflicts.map(conflict => {
        const active = conflict.itemIds.some(id => included.some(item => item.id === id && item.necessity === 'must'))
        return `<div><p>${esc(conflict.message)}</p><small>关联：${esc(conflict.itemIds.join('、'))}${active ? ' · 必须项仍有冲突' : ' · 相关条目已暂缓或不作为必须项'}</small>${button(active ? '暂缓相关项目' : '保持待决记录', 'defer-conflict', 'text', `data-intake-id="${esc(conflict.id)}"`, busy || !active)}</div>`
      }).join('')}</section>` : ''}
      <nav class="intake-filters" aria-label="需求分组">${([['all', '全部'], ['global', '全局硬装'], ['area', '分区域需求'], ['shared', '过渡与公共项'], ['pending', '待确认清单']] as const).map(([value, label]) => `<button type="button" data-intake-filter="${value}" aria-pressed="${filter === value}" class="${filter === value ? 'is-active' : ''}">${label}<span>${counts[value]}</span></button>`).join('')}</nav>
      ${filter === 'pending' ? '<p class="intake-filter-note">这里引用同一批需求中的待确认事项，不重复生成施工项目。</p>' : ''}
      <div class="intake-item-list">${selected.length ? selected.map(renderItem).join('') : '<div class="intake-empty"><h3>这一组暂时没有内容</h3><p>你可以补充需求，或返回对话继续说清楚。</p></div>'}</div>
      ${result.warnings.length ? `<details class="intake-analysis-notes"><summary>本次整理的 ${result.warnings.length} 条说明</summary><ul>${result.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></details>` : ''}
      ${historyMarkup()}
      <section class="intake-adopt"><div><h3>确认后，进入需求清单</h3><p>采用会更新未发布草稿。正式发布仍由你在下一页确认；待测事项不会自动变成已核实。</p>${options.existingCount > 0 ? `<label class="intake-check intake-replace"><input type="checkbox" data-intake-field="replace" ${state.replaceAcknowledged ? 'checked' : ''} ${busy ? 'disabled' : ''}/><span>替换当前 ${options.existingCount} 条未发布草稿，保留所有已发布版本</span></label>` : ''}${issues.length ? `<ul class="intake-adopt-issues">${issues.slice(0, 7).map(issue => `<li>${esc(issue)}</li>`).join('')}</ul>` : '<p class="intake-ready">拟纳入的条目已逐项确认，可以继续。</p>'}</div><div class="intake-adopt-actions">${button('继续补充与追问', 'continue', 'secondary', '', busy)}${button(`采用 ${included.length} 项并查看清单 ${icon('arrow')}`, 'adopt', 'primary', '', busy || storageBlocked || issues.length > 0)}</div></section>
    </section>`
  }
  function render() {
    if (disposed) return
    const question = state.stage === 'refine' ? pendingQuestions(state)[0] : undefined
    const target = state.result?.items.find(item => item.id === question?.targetId)
    options.onSpatialFocus?.(intakeSpatialFocus(state.areas, question, target, options.spatialModel), busy ? 'analyzing' : question ? 'refine' : state.stage === 'express' ? 'express' : 'draft')
    const openDetails = [...container.querySelectorAll<HTMLDetailsElement>('details[open]')].map(detail => ({ className: detail.className, itemId: detail.closest<HTMLElement>('[data-intake-item]')?.dataset.intakeItem }))
    const focused = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null
    const focusedId = focused && container.contains(focused) ? focused.id : ''
    const selection = focused && ('selectionStart' in focused) ? focused.selectionStart : null
    container.innerHTML = `<div class="intake-topline"><nav class="intake-steps" aria-label="需求获取步骤">${([['express', '表达想法'], ['refine', '梳理细节'], ['draft', '确认草稿']] as const).map(([stage, text], index) => `<button type="button" data-intake-stage="${stage}" class="${state.stage === stage ? 'is-current' : ''}" ${stage !== 'express' && !state.result ? 'disabled' : ''} ${state.stage === stage ? 'aria-current="step"' : ''}><span>${index + 1}</span>${text}</button>`).join('')}</nav><span class="intake-save-state" data-intake-save-state>${storageError ? '当前内容尚未保存' : savedMessage}</span></div>
      ${planningArea !== undefined ? `<div class="intake-notice intake-planning-context"><strong>${planningArea ? `当前规划 · ${esc(planningArea)}` : '全屋硬装规划'}</strong><a href="#planning">返回空间选择</a></div>` : ''}
      ${statusMarkup()}${projectContextMarkup()}
      ${state.stage === 'express' || !state.result ? introduction() : state.stage === 'refine' ? conversation(question) : draft()}
      <footer class="intake-bottom"><span>AI 帮助理解与整理，最终范围和取舍由你决定。</span>${button('开始新的访谈', 'new', 'text', '', busy)}</footer>
      ${requestStatusMarkup()}`
    for (const detail of openDetails) {
      const parent = detail.itemId ? container.querySelector<HTMLElement>(`[data-intake-item="${detail.itemId}"]`) : container
      const restored = parent?.querySelector<HTMLDetailsElement>(`details.${detail.className}`)
      if (restored) restored.open = true
    }
    if (focusedId) {
      const next = container.querySelector<HTMLElement>(`#${CSS.escape(focusedId)}`)
      if (next && !(next as HTMLInputElement).disabled) {
        next.focus({ preventScroll: true })
        if (selection !== null && (next instanceof HTMLTextAreaElement || next instanceof HTMLInputElement)) next.setSelectionRange(selection, selection)
      }
    }
  }
  async function analyze(mode: 'refine' | 'draft' = 'refine') {
    if (busy || disposed || storageBlocked) return
    if (!state.brief.trim()) { error = '先用自己的话说说想改什么，再开始梳理。'; render(); container.querySelector<HTMLElement>('#intake-brief')?.focus(); return }
    if (state.result?.items.some(item => !item.title.trim() || !item.description.trim() || !item.category.trim() || !item.component.trim())) { error = '请先补全手动条目的名称、描述、工程和构件，再继续整理。'; render(); return }
    const token = gate.begin()
    const revision = state.revision
    const payload = toIntakeRequest(state, mode)
    controller = new AbortController()
    const requestController = controller
    retryAttempt = 0
    lastMode = mode; busy = true; requestFeedback = null; error = ''; info = ''; lastRequestId = ''
    render()
    let completed = false
    try {
      const result = await requestIntake(payload, requestController.signal, attempt => {
        if (!gate.accepts(token)) return
        retryAttempt = attempt
        render()
      })
      if (!gate.accepts(token) || state.revision !== revision) return
      lastRequestId = result.requestId
      state = applyIntakeResult(state, result.data)
      if (mode === 'draft') state.stage = 'draft'
      lastMeta = result.meta
      filter = 'all'
      completed = true
      persist()
    } catch (failure) {
      if (!gate.accepts(token) || state.revision !== revision) return
      if (failure instanceof Error && 'requestId' in failure && typeof failure.requestId === 'string') lastRequestId = failure.requestId
      error = failure instanceof Error ? failure.message : '暂时无法完成整理，请稍后重试。'
      requestFeedback = 'error'
    } finally {
      if (gate.accepts(token)) {
        busy = false
        controller = null
        render()
        if (completed) {
          const heading = state.stage === 'refine' ? '.intake-question h3' : '#intake-draft-title'
          locate(container.querySelector<HTMLElement>(heading))
        }
      }
    }
  }
  function chooseStage(stage: IntakeState['stage']) {
    if (stage !== 'express' && !state.result) return
    invalidateFlight()
    state.stage = stage
    error = ''; info = ''
    persist(); render()
  }
  function download(name: string, body: string, type: string) {
    const url = URL.createObjectURL(new Blob([body], { type }))
    const a = document.createElement('a'); a.href = url; a.download = name; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  function exportDocument(markdown: boolean) {
    if (!state.result) return
    const doc = intakeDocument(state)
    if (!markdown) { download('安居有数需求草稿.json', JSON.stringify({ ...doc, exportedAt: new Date().toISOString(), status: 'draft' }, null, 2), 'application/json'); return }
    const md = (value: string) => value.replace(/[\\`*_{}\[\]<>#]/g, '\\$&')
    const lines = ['# 安居有数需求草稿', '', '状态：待用户发布，非施工确认。', '', `原始表达：${md(state.brief)}`, '']
    if (doc.projectContext?.length) {
      lines.push('## 项目背景', '')
      for (const entry of doc.projectContext) lines.push(`### ${projectContextLabels[entry.id]}`, '', md(entry.text), '', `状态：${entry.confirmed ? '用户已核对背景' : '待用户核对背景'}；不代表现场或工程条件已确认。`, '')
    }
    for (const item of doc.result.items) {
      lines.push(`## ${md(item.id)} ${md(item.title)}`, '', `范围：${md(scopeText(item))}`, '', `重要程度：${necessityLabels[item.necessity]}；来源：${item.origin === 'suggestion' ? 'AI 建议' : '用户表达'}；${state.reviewedIds.includes(item.id) ? '用户已核对' : '待核对'}`, '', md(item.description), '')
      for (const standard of item.standards) lines.push(`- 标准：${md(standard.metric)}；${standard.value === null ? '数值待确认' : md(`${standard.value} ${standard.unit || ''}`)}；${standardStatus[standard.status]}。${md(standard.verification)}`)
      for (const pending of item.pending) lines.push(`- ${ownerLabels[pending.owner]}：${md(pending.question)}`)
      for (const evidence of item.evidence) lines.push(`- 原文依据（${md(evidence.sourceId)}）：${md(evidence.quote)}`)
      lines.push('')
    }
    if (doc.result.conflicts.length) lines.push('## 待处理取舍', '', ...doc.result.conflicts.map(x => `- ${md(x.message)}`), '')
    download('安居有数需求草稿.md', lines.join('\n'), 'text/markdown;charset=utf-8')
  }
  async function submitAnswer(skip = false) {
    if (busy) return
    const question = pendingQuestions(state)[0]
    if (!question) return
    const answer = skip ? '暂时跳过，保留为待确认。' : [state.reply.selected.join('、'), state.reply.free.trim()].filter(Boolean).join('；补充：')
    try {
      state = answerQuestion(state, question, answer, skip ? 'deferred' : 'answered')
      error = ''; persist()
      if (pendingQuestions(state).length) render()
      else await analyze('refine')
    } catch (failure) { error = failure instanceof Error ? failure.message : '请先填写回答。'; render() }
  }
  function addArea() {
    const additions = areaCustom.split(/[、，,；;]/).map(x => x.trim()).filter(Boolean)
    const areas = [...new Set([...state.areas, ...additions])]
    if (areas.length > 12) { error = '一次最多处理 12 个区域，可以按改造范围分批梳理。'; render(); return }
    state.areas = areas; areaCustom = ''; contextChanged(); render()
  }
  async function onClick(event: Event) {
    const target = (event.target as Element).closest<HTMLElement>('[data-intake-action], [data-intake-filter], [data-intake-stage]')
    if (!target || !container.contains(target) || (target as HTMLButtonElement).disabled) return
    if (target.dataset.intakeFilter) { filter = target.dataset.intakeFilter as Filter; render(); return }
    if (target.dataset.intakeStage) { chooseStage(target.dataset.intakeStage as IntakeState['stage']); return }
    const action = target.dataset.intakeAction
    const id = target.dataset.intakeId || ''
    if (action === 'answer') return // native form submit owns this action
    switch (action) {
      case 'start': case 'analyze': case 'continue': await analyze('refine'); break
      case 'draft-latest': await analyze('draft'); break
      case 'retry': await analyze(lastMode); break
      case 'cancel': invalidateFlight(); requestFeedback = 'cancelled'; render(); break
      case 'locate-model': {
        const layout = container.closest<HTMLElement>('.intake-spatial-layout')
        locate(layout?.querySelector<HTMLElement>('.intake-space-header'), layout)
        break
      }
      case 'dismiss-request':
        requestFeedback = null
        container.querySelector('.intake-request-dock')?.remove()
        break
      case 'sample': state.brief = '厨房想好打理，洗碗机要有；客厅和公共走道的地面想看着连贯。水电我不懂，希望先检查。'; contextChanged(); render(); break
      case 'add-area': addArea(); break
      case 'edit-brief': chooseStage('express'); break
      case 'show-draft': chooseStage('draft'); break
      case 'skip': await submitAnswer(true); break
      case 'inspect-item': chooseStage('draft'); filter = 'all'; render(); requestAnimationFrame(() => container.querySelector<HTMLElement>(`[data-intake-item="${id}"]`)?.focus()); break
      case 'defer-conflict': state = deferConflict(state, id); persist(); render(); break
      case 'remove-answer': state.answers = state.answers.filter(x => x.id !== id); contextChanged(); render(); break
      case 'add-item': {
        if (!state.result) break
        if (state.result.items.length >= 30) { error = '一次最多整理 30 个需求条目，请先完成这批确认。'; render(); break }
        const id = `manual_${Date.now().toString(36)}`
        state.result.items.push({ id, title: '新的需求', scope: state.areas.length === 1 ? 'area' : 'unassigned', areas: state.areas.length === 1 ? [...state.areas] : [], category: '待确认', component: '待确认', description: '', origin: 'user', necessity: 'undecided', clarity: 'vague', evidence: [], standards: [], pending: [], dependencies: [] })
        state.editedIds.push(id); state.revision++; state.replaceAcknowledged = false; filter = 'all'; persist(); render()
        requestAnimationFrame(() => container.querySelector<HTMLElement>(`[data-intake-item="${id}"]`)?.scrollIntoView({ block: 'center' })); break
      }
      case 'adopt': {
        try {
          const payload = adoptionPayload(state, options.existingCount)
          persist()
          options.onAdopt(payload.requirements, payload.document)
        } catch (failure) { error = failure instanceof Error ? failure.message : '请先逐项确认。'; render() }
        break
      }
      case 'export-json': exportDocument(false); break
      case 'export-md': exportDocument(true); break
      case 'export-raw': download('安居有数原始访谈记录.txt', rawStored, 'text/plain;charset=utf-8'); break
      case 'new':
        if ((state.brief || state.result || rawStored) && !window.confirm('开始新的访谈会替换这份访谈草稿。已发布的需求版本不会改变。需要留存时，请先导出文档。')) return
        invalidateFlight(); state = newIntakeState('', options.projectContext ?? state.projectContext ?? []); rawStored = ''; storageBlocked = false; storageError = ''; error = ''; info = ''; filter = 'all'; persist(); render(); break
    }
  }
  function updateEditedText(input: HTMLInputElement | HTMLTextAreaElement) {
    const name = input.dataset.intakeEdit
    const id = input.dataset.intakeId || ''
    if (!name || !['title', 'description', 'areas', 'category', 'component'].includes(name)) return false
    const patch = name === 'areas' ? { areas: input.value.split(/[、，,；;]/).map(x => x.trim()).filter(Boolean) } : { [name]: input.value }
    state = editIntakeItem(state, id, patch)
    persist()
    const item = state.result?.items.find(x => x.id === id)
    const row = input.closest<HTMLElement>('[data-intake-item]')
    if (item && row) {
      const title = row.querySelector('h3'); if (title) title.textContent = item.title || '未命名需求'
      const description = row.querySelector('.intake-description'); if (description) description.textContent = item.description || '请补充这条需求的描述。'
      const context = row.querySelector('.intake-item-context'); if (context) context.innerHTML = `${esc(scopeText(item))} <span>${esc(item.id)}</span>`
      row.classList.remove('is-reviewed')
      const tag = row.querySelector('.intake-item-heading .intake-tag'); if (tag) { tag.textContent = '你已编辑'; tag.classList.remove('intake-tag--confirmed') }
      const accepted = row.querySelector<HTMLInputElement>('[data-intake-accept]'); if (accepted) accepted.checked = false
      const reviewed = row.querySelector<HTMLInputElement>('[data-intake-review]'); if (reviewed) { reviewed.checked = false; reviewed.disabled = !includedItems(state).some(x => x.id === id) }
      row.querySelectorAll<HTMLElement>('.intake-standard').forEach((standardRow, index) => {
        const standard = item.standards[index]
        if (!standard) return
        const value = standardRow.querySelector('.intake-standard-value'); if (value) value.textContent = standardValue(standard)
        const status = standardRow.querySelector('small'); if (status) status.textContent = standardStatus[standard.status]
      })
    }
    // Keep the active editor and its neighbouring controls mounted while typing.
    // Replacing this subtree on blur can swallow the user's next click.
    const included = includedItems(state)
    const reviewedCount = included.filter(x => state.reviewedIds.includes(x.id)).length
    const count = container.querySelector('.intake-draft-heading p')
    if (count) count.textContent = `${state.result!.items.length} 个条目 · 拟纳入 ${included.length} 项 · 已逐项确认 ${reviewedCount} 项`
    const issues = adoptionIssues(state, options.existingCount)
    const adopt = container.querySelector<HTMLButtonElement>('[data-intake-action="adopt"]')
    if (adopt) adopt.disabled = busy || storageBlocked || issues.length > 0
    const issueParent = container.querySelector('.intake-adopt > div:first-child')
    issueParent?.querySelector('.intake-adopt-issues')?.remove()
    issueParent?.querySelector('.intake-ready')?.remove()
    if (issueParent) issueParent.insertAdjacentHTML('beforeend', issues.length ? `<ul class="intake-adopt-issues">${issues.slice(0, 7).map(issue => `<li>${esc(issue)}</li>`).join('')}</ul>` : '<p class="intake-ready">拟纳入的条目已逐项确认，可以继续。</p>')
    return true
  }
  function onInput(event: Event) {
    const input = event.target as HTMLInputElement | HTMLTextAreaElement
    if (input.dataset.intakeEdit && updateEditedText(input)) return
    switch (input.dataset.intakeField) {
      case 'brief': {
        state.brief = input.value
        contextChanged()
        const count = container.querySelector('[data-intake-brief-count]')
        if (count) count.textContent = `${state.brief.length} / 4000`
        if (state.brief.trim() && !expressionAcknowledged) {
          expressionAcknowledged = true
          options.onFirstExpression?.()
        }
        break
      }
      case 'area-custom': areaCustom = input.value; break
      case 'free-answer': state.reply.free = input.value; persist(); break
    }
  }
  function onChange(event: Event) {
    const input = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    if (input.dataset.intakeArea) {
      const area = input.dataset.intakeArea
      state.areas = (input as HTMLInputElement).checked ? [...new Set([...state.areas, area])] : state.areas.filter(x => x !== area)
      if (state.areas.length > 12) { state.areas = state.areas.filter(x => x !== area); error = '一次最多处理 12 个区域，请按改造范围分批整理。'; render(); return }
      contextChanged(); render()
    } else if (input.dataset.intakeChoice) {
      const question = pendingQuestions(state)[0]
      if (!question) return
      const choice = input.dataset.intakeChoice
      const checked = (input as HTMLInputElement).checked
      if (!question.allowMultiple) state.reply.selected = [choice]
      else if (choice === '暂不确定' && checked) state.reply.selected = [choice]
      else state.reply.selected = checked ? [...new Set([...state.reply.selected.filter(x => x !== '暂不确定'), choice])] : state.reply.selected.filter(x => x !== choice)
      persist(); render()
    } else if (input.dataset.intakeEdit) {
      if ((input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) && updateEditedText(input)) return
      const name = input.dataset.intakeEdit
      const id = input.dataset.intakeId || ''
      const patch = name === 'areas' ? { areas: input.value.split(/[、，,；;]/).map(x => x.trim()).filter(Boolean) } : { [name]: input.value }
      state = editIntakeItem(state, id, patch)
      persist(); render()
    } else if (input.dataset.intakeAccept) {
      const id = input.dataset.intakeAccept
      state.acceptedSuggestionIds = (input as HTMLInputElement).checked ? [...new Set([...state.acceptedSuggestionIds, id])] : state.acceptedSuggestionIds.filter(x => x !== id)
      state.reviewedIds = state.reviewedIds.filter(x => x !== id); state.replaceAcknowledged = false; state.revision++; persist(); render()
    } else if (input.dataset.intakeReview) {
      const id = input.dataset.intakeReview
      state.reviewedIds = (input as HTMLInputElement).checked ? [...new Set([...state.reviewedIds, id])] : state.reviewedIds.filter(x => x !== id)
      state.revision++; persist(); render()
    } else if (input.dataset.intakeAnswer) {
      const answer = state.answers.find(x => x.id === input.dataset.intakeAnswer)
      if (answer) { answer.answer = input.value; answer.disposition = 'answered'; contextChanged(); render() }
    } else if (input.dataset.intakeField === 'replace') {
      state.replaceAcknowledged = (input as HTMLInputElement).checked; persist(); render()
    }
  }
  async function onSubmit(event: Event) {
    const form = event.target as HTMLFormElement
    if (!form.dataset.intakeForm) return
    event.preventDefault()
    if (form.dataset.intakeForm === 'answer') await submitAnswer()

  }
  container.addEventListener('click', onClick)
  container.addEventListener('input', onInput)
  container.addEventListener('change', onChange)
  container.addEventListener('submit', onSubmit)
  if (areaAdded) contextChanged()
  else if (contextSynchronized || planningArea !== undefined) persist()
  render()
  return { focusExpression() { chooseStage('express'); container.querySelector<HTMLElement>('#intake-brief')?.focus() }, dispose() {
    disposed = true; gate.dispose(); controller?.abort()
    container.removeEventListener('click', onClick); container.removeEventListener('input', onInput)
    container.removeEventListener('change', onChange); container.removeEventListener('submit', onSubmit)
  } }
}

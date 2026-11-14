import { requestIntake } from './intake-request.ts'
import './intake-ui.css'
import './intake-questionnaire.css'
import './intake-preferences.css'
import { newPreferences, preferenceAnswered, preferenceDetailLimit, preferenceBrief, preferenceQuestions, preferenceRooms, restorePreferencePosition, selectPreference, type PreferenceRoom } from './intake-preferences.ts'
import { preferencesMarkup } from './intake-preferences-ui.ts'
import { choiceOnlyAnswer, choiceOnlyQuestion, nonAnswerChoices, confirmQuestionnaireItem, deferQuestionnaireItem, questionnaireItemIssues, questionnaireReply } from './intake-questionnaire.ts'
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
  questionnaire?: boolean
  externalNavigation?: boolean
  onNavigationChange?: () => void
  initialBrief: string
  storage?: Pick<Storage, 'getItem' | 'setItem'>
  storageStatus?: () => string
  existingCount: number
  projectContext?: IntakeProjectContextEntry[]
  planningArea?: string | null
  spatialModel?: PlanningModel
  activeRoomId?: string
  activeRoomName?: string
  onChooseRoom?: (id: string, name: string) => void
  onSpatialFocus?: (focus: SpatialFocus, phase: IntakeState['stage'] | 'analyzing') => void
  onFirstExpression?: () => void
  onAdopt: (requirements: IntakeLegacyRequirement[], document: IntakeDocument) => void
  onNotice?: (message: string) => void
}
export type IntakeNavigation = {
  title: string
  description: string
  nextLabel: string
  busy: boolean
  backAvailable: boolean
}
export type IntakeNavigationIssue = { target?: HTMLElement; message?: string }
export type IntakeSession = {
  dispose: () => void
  focusExpression: () => void
  refreshSaveState: () => void
  navigation: () => IntakeNavigation
  advance: () => Promise<IntakeNavigationIssue | void>
  previous: () => boolean
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

export function mountIntake(container: HTMLElement, options: Options): IntakeSession {
  const key = `mingma-${options.variant}-intake-v2`
  const savedMessage = () => options.storageStatus?.() ?? (options.storage ? '仅保留本轮演示' : '已保存在此浏览器')
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
  const expressionExample = () => {
    const area = state.areas.length === 1 ? state.areas[0] : state.areas.length > 1 ? '' : planningArea || ''
    if (/卫生间|卫浴|浴室|厕所/.test(area)) return '卫生间地面想更防滑、好清理，洗澡时希望水不要溅到洗手台；现有浴室柜想保留。防水和排水条件我不清楚，希望先检查。'
    if (/厨房|厨/.test(area)) return '厨房想好打理，洗碗机要有；尽量保留现在的水槽和冰箱位置，不想做开放展示格。水电和安装尺寸希望先检查。'
    if (/卧室|主卧|次卧|儿童房|老人房/.test(area)) return `${area}想安静一些，睡前能在床边开关灯；衣服收纳不够，希望增加封闭收纳。现有家具哪些能保留，想一起确认。`
    if (/客厅|起居/.test(area)) return '客厅希望通道宽敞一些，日常杂物有地方收起来；地面想好打理，和走道看着连贯。电视和插座的位置希望先确认。'
    if (/玄关|门厅|入户/.test(area)) return '进门想有地方放鞋、挂外套和放钥匙，最好能坐着换鞋；希望保留顺畅的通道，柜子尺寸需要现场量一下。'
    if (/走道|走廊|过道/.test(area)) return '走道希望明亮、好打理，夜间经过时能方便开灯；地面和相邻房间看着连贯，尽量不占用通行空间。'
    if (/阳台/.test(area)) return '阳台想兼顾晾衣和收纳，地面要好清理；现有窗户想保留，洗衣机能否放置需要先确认排水和电源条件。'
    return area ? `${area}现在最不方便的是……，这次想改善……，一定想保留的是……。专业条件我不清楚，希望先检查。` : '厨房想好打理，洗碗机要有；客厅和公共走道的地面想看着连贯。水电我不懂，希望先检查。'
  }
  const areaAdded = !storageBlocked && !!planningArea && !state.areas.includes(planningArea) && state.areas.length < 12
  if (!storageBlocked && planningArea !== undefined) {
    state.stage = 'express'
    if (areaAdded) state.areas = [planningArea, ...state.areas]
  }
  let disposed = false
  let navigationScheduled = false
  let busy = false
  let retryAttempt = 0
  let requestFeedback: 'error' | 'cancelled' | null = null
  let expressionAcknowledged = false
  let error = ''
  let info = contextSynchronized && state.result ? '项目背景已更新，原草稿已保留；采用前请重新整理并核对。' : ''
  if (!storageBlocked && planningArea && !state.areas.includes(planningArea)) {
    info = `已选满 12 个区域。请先取消一个区域，再勾选${planningArea}。`
  }
  const guided = !!options.questionnaire
  const rooms = preferenceRooms(options.spatialModel)
  const initialRoomId = options.activeRoomId || rooms.find(room => state.areas.includes(room.name))?.id || 'whole-home'
  if (!rooms.some(room => room.id === initialRoomId)) rooms.push({ id: initialRoomId, name: options.activeRoomName || planningArea || state.areas[0] || '当前空间' })
  if (guided && !state.preferences) state.preferences = newPreferences(initialRoomId, state.brief)
  const preferenceRoom = (): PreferenceRoom => rooms.find(room => room.id === state.preferences?.roomId) || rooms.find(room => room.id === initialRoomId)!
  const preferenceList = () => preferenceQuestions(preferenceRoom(), state.preferences!, options.spatialModel)
  if (guided) state.preferences = restorePreferencePosition(state.preferences!, preferenceRoom(), options.spatialModel)
  function syncPreferenceBrief() {
    const brief = preferenceBrief(preferenceRoom(), state.preferences!, options.spatialModel)
    // Keep the stored legacy brief valid even when an optional note needs shortening.
    if (brief.length <= 4000) state.brief = brief
    state.areas = ['whole-home', 'legacy'].includes(preferenceRoom().id) ? [] : [preferenceRoom().name]
  }
  function preferenceStep(cursor: number) {
    const questions = preferenceList()
    state.preferences!.cursor = Math.max(0, Math.min(cursor, questions.length + 1))
    state.preferences!.stepId = state.preferences!.cursor === 0 ? 'rooms' : state.preferences!.cursor > questions.length ? 'summary' : questions[state.preferences!.cursor - 1].id
    error = ''; persist(); render()
    locate(container.querySelector<HTMLElement>('#intake-expression-title'), container)
  }
  async function advancePreference(): Promise<IntakeNavigationIssue | void> {
    const prefs = state.preferences!
    const questions = preferenceList()
    const cursor = Math.min(prefs.cursor, questions.length + 1)
    const current = questions[cursor - 1]
    if (current && !preferenceAnswered(current, prefs)) {
      state.preferences = selectPreference(prefs, current, 'unknown', true)
      syncPreferenceBrief()
      contextChanged()
    }
    if (cursor <= questions.length) { preferenceStep(cursor + 1); return }
    const missing = questions.findIndex(q => !preferenceAnswered(q, prefs))
    if (missing >= 0) { preferenceStep(missing + 1); return guideIssue('.preference-fields', '这题还未作答，可选一项、补充说明或直接点下一题。') }
    syncPreferenceBrief()
    if (preferenceBrief(preferenceRoom(), prefs, options.spatialModel).length > 4000) return guideIssue('#preference-include-note', '历史文字记录较长，请取消本轮引用后继续；原记录仍然保留。')
    return analyzeFromNavigation('refine')
  }
  let reviewIndex = Math.max(0, state.result?.items.findIndex(item => !state.reviewedIds.includes(item.id)) ?? 0)
  let reviewSummary = false
  let activeQuestionId = ''
  let furthestStage = state.stage === 'draft' || state.reviewedIds.length ? 2 : state.result ? 1 : 0
  if (rawStored && !contextSynchronized && planningArea === undefined) {
    try {
      const cursor = JSON.parse(rawStored).questionnaireCursor
      if (cursor && Number.isInteger(cursor.reviewIndex) && cursor.reviewIndex >= 0 && cursor.reviewIndex < (state.result?.items.length || 1)) {
        reviewIndex = cursor.reviewIndex
        reviewSummary = cursor.reviewSummary === true && state.stage === 'draft'
        if (typeof cursor.activeQuestionId === 'string') activeQuestionId = cursor.activeQuestionId
        if (Number.isInteger(cursor.furthestStage)) furthestStage = Math.max(furthestStage, Math.min(3, cursor.furthestStage))
      }
    } catch { /* Existing state validation handles malformed drafts. */ }
  }
  const currentQuestion = () => {
    const question = state.result?.questions.find(question => question.id === activeQuestionId) ?? pendingQuestions(state)[0]
    return guided && question ? choiceOnlyQuestion(question) : question
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
  container.classList.toggle('intake-questionnaire', guided)
  container.classList.toggle('intake-external-navigation', !!options.externalNavigation)

  function navigationChanged() {
    if (disposed || navigationScheduled || !options.onNavigationChange) return
    navigationScheduled = true
    queueMicrotask(() => {
      navigationScheduled = false
      if (!disposed) options.onNavigationChange?.()
    })
  }

  function persist() {
    if (storageBlocked) return
    try { (options.storage ?? localStorage).setItem(key, JSON.stringify({ ...state, questionnaireCursor: { reviewIndex, reviewSummary, activeQuestionId, furthestStage } })); storageError = '' }
    catch { storageError = '浏览器暂时无法保存，请导出需求文档留存。当前内容仍在页面中。' }
    refreshSaveState()
    navigationChanged()
  }
  function refreshSaveState() {
    if (disposed) return
    const saved = container.querySelector('[data-intake-save-state]')
    if (saved) saved.textContent = storageError || savedMessage()
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
    if (guided) return preferencesMarkup(state.preferences!, preferenceRoom(), rooms, options.spatialModel, busy || storageBlocked)
    const choices = [...new Set([...areaChoices, ...state.areas])]
    const areaField = `<fieldset class="intake-area-field"><legend>这次涉及哪些区域？<span>可多选，也可以暂不确定</span></legend><div class="intake-chips">${choices.map(area => `<label class="intake-chip"><input type="checkbox" data-intake-area="${esc(area)}" ${state.areas.includes(area) ? 'checked' : ''} ${busy ? 'disabled' : ''}/><span>${esc(area)}</span></label>`).join('')}</div><div class="intake-custom-area"><label class="intake-sr" for="intake-area-custom">补充自定义区域</label><input id="intake-area-custom" data-intake-field="area-custom" maxlength="40" placeholder="补充区域，如儿童房" value="${esc(areaCustom)}" ${busy ? 'disabled' : ''}/>${button('添加区域', 'add-area', 'secondary', '', busy)}</div></fieldset>`
    return `<div class="intake-layout">
      <section class="intake-panel intake-expression" aria-labelledby="intake-expression-title">
        <div class="intake-section-heading"><h2 id="intake-expression-title">先说说，你想怎样生活。</h2><p>想改哪些地方，现在最不方便的是什么？有什么一定想保留？不用先懂施工术语。</p></div>
        ${guided ? `<div class="intake-expression-tools"><label class="intake-label" for="intake-brief">你的生活化需求</label>${button('使用这个表达示例', 'sample', 'text', '', busy)}</div>` : '<label class="intake-label" for="intake-brief">你的生活化需求</label>'}
        <textarea id="intake-brief" data-intake-field="brief" maxlength="4000" rows="${guided ? 4 : 7}" placeholder="例如：${esc(expressionExample())}" ${busy ? 'disabled' : ''}>${esc(state.brief)}</textarea>
        <div class="intake-input-meta"><span>可以先说重点，细节稍后一起补齐。</span><span data-intake-brief-count>${state.brief.length} / 4000</span></div>
        ${guided ? '' : button('使用这个表达示例', 'sample', 'text', '', busy)}
        ${guided && state.areas.length ? `<details class="intake-area-disclosure"><summary>涉及区域：${esc(state.areas.join('、') || '暂不确定')}<span>调整范围</span></summary>${areaField}</details>` : areaField}
        <div class="intake-action-row"><span>AI 会先复述理解，再提出有针对性的问题。</span>${button(`${guided ? '下一步：补充细节' : '开始梳理'} ${icon('arrow')}`, 'start', 'primary', '', busy || storageBlocked)}</div>
        ${state.result && (!guided || furthestStage >= 2) ? button('返回已有需求草稿', 'show-draft', 'text', '', busy) : ''}
      </section>
      ${guided ? '' : `<aside class="intake-aside intake-panel"><h3>逐步整理成四组内容</h3><p>从你最在意的地方开始，把容易遗漏的关联项也留好位置。</p><ol class="intake-scope-guide"><li><b>全局硬装</b><span>水电现状、全屋保留边界与使用条件。</span></li><li><b>分区域需求</b><span>每个房间希望解决的具体问题。</span></li><li><b>过渡与公共项</b><span>门洞收口、相邻区域和连续构件。</span></li><li><b>待确认清单</b><span>你的取舍、现场待测和商家待说明。</span></li></ol><p class="intake-fine">没有户型图也能先说需求。尺寸没有依据时，会保留为待确认。</p></aside>`}
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
    if (guided) return `<details class="intake-history"><summary>回看 ${state.answers.length} 条历史回答</summary>${state.answers.map((answer, index) => `<section class="intake-history-entry"><h4>${index + 1}. ${esc(answer.question)}</h4><p class="preference-history-note">${esc(answer.answer)}</p>${state.result?.questions.some(question => question.id === answer.id) ? button('重新选择', 'rechoose-answer', 'text', `data-intake-id="${esc(answer.id)}"`, busy) : ''}</section>`).join('')}</details>`
    return `<details class="intake-history"><summary>回看与修改 ${state.answers.length} 条回答</summary><div>${state.answers.map((answer, index) => `<section class="intake-history-entry"><label class="intake-label" for="intake-history-${esc(answer.id)}">${index + 1}. ${esc(answer.question)}</label><textarea id="intake-history-${esc(answer.id)}" data-intake-answer="${esc(answer.id)}" maxlength="2000" rows="2" ${busy ? 'disabled' : ''}>${esc(answer.answer)}</textarea><div class="intake-history-foot"><span>${answer.disposition === 'deferred' ? '已暂缓，后续保留为待办' : '已记录你的回答'}</span>${button('移除此回答', 'remove-answer', 'text', `data-intake-id="${esc(answer.id)}"`, busy)}</div></section>`).join('')}</div></details>`
  }
  function conversation(question = currentQuestion()) {
    if (question && state.reply.questionId !== question.id) state.reply = questionnaireReply(question, state.answers.find(answer => answer.id === question.id)?.answer)
    if (guided && question) state.reply.free = ''
    const batch = state.result?.questions || []
    const questionIndex = batch.findIndex(q => q.id === question?.id)
    const answeredInBatch = batch.filter(q => state.answers.some(a => a.id === q.id)).length
    const target = state.result?.items.find(x => x.id === question?.targetId)
    return `<div class="intake-layout"><section class="intake-panel intake-conversation">${guided ? '<details class="questionnaire-understanding"><summary>回看 AI 对需求的理解</summary>' : ''}<div class="intake-understanding"><span class="intake-assistant-symbol">${icon('spark')}</span><div><h2>我对你的理解</h2><p>${esc(state.result?.summary)}</p></div></div>
      <div class="intake-understanding-actions">${button(guided ? '返回修改偏好选择' : '补充或纠正原始表达', 'edit-brief', 'text', '', busy)}${state.needsAnalysis ? '<span class="intake-tag">新回答待整理</span>' : ''}</div>${guided ? '</details>' : ''}
      ${guided && question ? `<div class="questionnaire-question-progress"><span>本轮第 ${questionIndex + 1} / ${batch.length} 题</span><span>已填写 ${state.answers.length} 题</span><progress max="${batch.length}" value="${answeredInBatch}" aria-label="本轮补充进度"></progress></div>` : ''}
      ${question ? `<form data-intake-form="answer" class="intake-question"><p class="intake-question-context">${esc(target?.title || '整体改造范围')} · ${esc(dimensionLabels[question.dimension] || question.dimension)}</p><h3>${esc(question.text)}</h3><p class="intake-question-reason">${esc(question.reason)}</p><fieldset class="intake-options"><legend class="intake-sr">${esc(question.text)}（${question.allowMultiple ? '可多选' : '单选'}）</legend>${question.options.map((choice, index) => `<label class="intake-option"><input type="${question.allowMultiple ? 'checkbox' : 'radio'}" id="intake-choice-${esc(question.id)}-${index}" name="intake-choice" data-intake-choice="${esc(choice)}" value="${esc(choice)}" ${state.reply.selected.includes(choice) ? 'checked' : ''} ${busy ? 'disabled' : ''}/><span>${esc(choice)}</span><span class="intake-choice-mark" aria-hidden="true">${icon('check')}</span></label>`).join('')}</fieldset><span class="intake-fine">${question.allowMultiple ? '可选择多个符合情况的选项。' : '选择最符合情况的一项。'}${guided ? '不确定或选项不适合时，也可以选择相应选项。' : '也可以直接写下自己的回答。'}</span>${guided ? '' : `<label class="intake-label" for="intake-free-answer">自由补充</label><textarea id="intake-free-answer" data-intake-field="free-answer" rows="3" maxlength="2000" placeholder="选项没有说全的部分，写在这里…" ${busy ? 'disabled' : ''}>${esc(state.reply.free)}</textarea>`}<div class="intake-action-row">${guided ? button('上一步', 'previous-question', 'secondary', '', busy) : ''}${button(guided ? '暂不确定，稍后再说' : '暂时跳过', 'skip', 'text', '', busy)}<button type="submit" class="intake-button intake-button--primary" data-intake-action="answer" ${busy ? 'disabled' : ''}>${guided ? (questionIndex < batch.length - 1 ? '保存，下一题' : '保存并整理问卷') : '确认回答'} ${icon('arrow')}</button></div></form>` : `<div class="intake-question"><h3>${state.needsAnalysis ? '这些新回答，准备好一起整理了。' : '可以先看一份需求草稿。'}</h3><p>${esc(state.result?.stopReason || '已有内容会形成可编辑草稿，现场条件和未决事项继续保留。')}</p><div class="intake-action-row">${button('查看现有草稿', 'show-draft', 'secondary', '', busy)}${button(state.needsAnalysis ? '整理最新草稿' : '继续检查信息缺口', state.needsAnalysis ? 'draft-latest' : 'analyze', 'primary', '', busy)}</div></div>`}
      ${historyMarkup()}
    </section>${guided ? '' : summaryAside()}</div>`
  }
  function renderItem(item: IntakeItem, compact = false) {
    const isIncluded = includedItems(state).some(x => x.id === item.id)
    const reviewed = state.reviewedIds.includes(item.id)
    const edited = state.editedIds.includes(item.id)
    return `<article class="intake-item ${reviewed && isIncluded ? 'is-reviewed' : ''}" data-intake-item="${esc(item.id)}" tabindex="-1">
      <div class="intake-item-heading"><div><p class="intake-item-context">${esc(scopeText(item))} <span>${esc(item.id)}</span></p><h3>${esc(item.title || '未命名需求')}</h3></div><span class="intake-tag ${reviewed && isIncluded ? 'intake-tag--confirmed' : ''}">${reviewed && isIncluded ? '你已确认' : item.origin === 'suggestion' ? 'AI 建议' : edited ? '你已编辑' : '来自你的表达'}</span></div>
      <p class="intake-description">${esc(item.description || '请展开编辑，补充这条需求的描述。')}</p>
      ${compact ? '<details class="questionnaire-technical"><summary>查看回应条件与原话依据</summary>' : ''}
      ${item.standards.length ? `<div class="intake-standards"><h4>可检查条件</h4>${item.standards.map(standard => `<div class="intake-standard"><div><b>${esc(standard.metric)}</b><span class="intake-standard-value">${esc(standardValue(standard))}</span><small>${standardStatus[standard.status]}</small></div><p>${esc(standard.verification)}</p></div>`).join('')}</div>` : '<p class="intake-fine intake-no-standard">具体回应条件待补充，不自动生成工程数值。</p>'}
      ${item.pending.length ? `<details class="intake-pending"><summary>${item.pending.length} 项待确认${item.pending.some(x => x.blocking && ['user', 'unassigned'].includes(x.owner)) ? ' · 包含业主决策' : ''}</summary><ul>${item.pending.map(p => `<li><span class="intake-owner">${ownerLabels[p.owner]}</span><span>${esc(p.question)}${p.blocking ? '<small>影响当前方案方向</small>' : ''}</span></li>`).join('')}</ul></details>` : ''}
      ${item.evidence.length ? `<details class="intake-evidence"><summary>查看原话依据${edited ? '（当前描述已有你的修改）' : ''}</summary>${item.evidence.map(e => `<blockquote><small>${sourceText(e.sourceId)}</small><p>${esc(e.quote)}</p></blockquote>`).join('')}</details>` : `<p class="intake-fine">${edited ? '由你补充的内容，采用前请确认。' : '没有用户原话依据，保留为待采纳建议。'}</p>`}
      ${compact ? '</details>' : ''}
      ${compact ? button('返回选择修改', 'edit-brief', 'text', '', busy) : `<details class="intake-editor" ${item.title === '新的需求' ? 'open' : ''}><summary>${icon('edit')} 编辑范围与描述</summary><div class="intake-editor-grid">
        <label>需求名称<input maxlength="100" id="intake-edit-title-${esc(item.id)}" data-intake-edit="title" data-intake-id="${esc(item.id)}" value="${esc(item.title)}" ${busy ? 'disabled' : ''}/></label>
        <label>作用范围<select id="intake-edit-scope-${esc(item.id)}" data-intake-edit="scope" data-intake-id="${esc(item.id)}" ${busy ? 'disabled' : ''}>${Object.entries(scopeLabels).map(([value, label]) => `<option value="${value}" ${item.scope === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
        <label class="intake-full">关联区域<input id="intake-edit-areas-${esc(item.id)}" data-intake-edit="areas" data-intake-id="${esc(item.id)}" maxlength="300" value="${esc(item.areas.join('、'))}" placeholder="例如：客厅、公共走道" ${['global', 'unassigned'].includes(item.scope) || busy ? 'disabled' : ''}/><small>全局项关联全屋；归属不明时先保持待定。</small></label>
        <label>工程类别<input id="intake-edit-category-${esc(item.id)}" data-intake-edit="category" data-intake-id="${esc(item.id)}" maxlength="80" value="${esc(item.category)}" ${busy ? 'disabled' : ''}/></label>
        <label>构件<input id="intake-edit-component-${esc(item.id)}" data-intake-edit="component" data-intake-id="${esc(item.id)}" maxlength="80" value="${esc(item.component)}" ${busy ? 'disabled' : ''}/></label>
        <label class="intake-full">希望达到什么效果<textarea id="intake-edit-description-${esc(item.id)}" data-intake-edit="description" data-intake-id="${esc(item.id)}" rows="3" maxlength="2000" ${busy ? 'disabled' : ''}>${esc(item.description)}</textarea><small>修改描述后，原有数值标准会重新标为待确认。</small></label>
      </div></details>`}
      <div class="intake-item-footer"><label class="intake-necessity">重要程度<select id="intake-edit-necessity-${esc(item.id)}" data-intake-edit="necessity" data-intake-id="${esc(item.id)}" aria-label="${esc(item.title)}的重要程度" ${busy ? 'disabled' : ''}>${Object.entries(necessityLabels).map(([value, label]) => `<option value="${value}" ${item.necessity === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>${compact ? '' : `<div class="intake-confirmations">
        ${item.origin === 'suggestion' ? `<label class="intake-check"><input type="checkbox" id="intake-accept-${esc(item.id)}" data-intake-accept="${esc(item.id)}" ${state.acceptedSuggestionIds.includes(item.id) ? 'checked' : ''} ${busy ? 'disabled' : ''}/><span>采纳这条建议</span></label>` : ''}
        <label class="intake-check"><input type="checkbox" id="intake-review-${esc(item.id)}" data-intake-review="${esc(item.id)}" ${reviewed && isIncluded ? 'checked' : ''} ${!isIncluded || busy ? 'disabled' : ''}/><span>我已核对这一条的范围与描述</span></label>
      </div>`}</div>
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
      <div class="intake-item-list">${selected.length ? selected.map(item => renderItem(item)).join('') : '<div class="intake-empty"><h3>这一组暂时没有内容</h3><p>你可以补充需求，或返回对话继续说清楚。</p></div>'}</div>
      ${result.warnings.length ? `<details class="intake-analysis-notes"><summary>本次整理的 ${result.warnings.length} 条说明</summary><ul>${result.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></details>` : ''}
      ${historyMarkup()}
      <section class="intake-adopt"><div><h3>确认后，进入需求清单</h3><p>采用会更新未发布草稿。正式发布仍由你在下一页确认；待测事项不会自动变成已核实。</p>${options.existingCount > 0 ? `<label class="intake-check intake-replace"><input type="checkbox" data-intake-field="replace" ${state.replaceAcknowledged ? 'checked' : ''} ${busy ? 'disabled' : ''}/><span>替换当前 ${options.existingCount} 条未发布草稿，保留所有已发布版本</span></label>` : ''}${issues.length ? `<ul class="intake-adopt-issues">${issues.slice(0, 7).map(issue => `<li>${esc(issue)}</li>`).join('')}</ul>` : '<p class="intake-ready">拟纳入的条目已逐项确认，可以继续。</p>'}</div><div class="intake-adopt-actions">${button('继续补充与追问', 'continue', 'secondary', '', busy)}${button(`采用 ${included.length} 项并查看清单 ${icon('arrow')}`, 'adopt', 'primary', '', busy || storageBlocked || issues.length > 0)}</div></section>
    </section>`
  }
  function questionnaireProgress() {
    const step = state.stage === 'express' ? 0 : state.stage === 'refine' ? 1 : reviewSummary ? 3 : 2
    const labels = ['选择偏好', '补充细节', '逐条确认', '提交问卷']
    return `<div class="questionnaire-progress"><div><strong>需求问卷 <small class="intake-save-state" data-intake-save-state>${esc(storageError || savedMessage())}</small></strong><span>第 ${step + 1} / 4 步</span></div><progress value="${step}" max="4" aria-label="需求问卷进度"></progress><nav aria-label="问卷步骤">${labels.map((label, index) => `<button type="button" data-intake-action="wizard-stage" data-intake-id="${index}" ${busy || index > furthestStage ? 'disabled' : ''} ${step === index ? 'aria-current="step"' : ''}><span>${index + 1}</span>${label}</button>`).join('')}</nav></div>`
  }
  function questionnaireDraft() {
    const items = state.result!.items
    const included = includedItems(state)
    const issues = adoptionIssues(state, options.existingCount)
    if (reviewSummary) {
      return `<section class="questionnaire-sheet intake-adopt" aria-labelledby="intake-draft-title"><div>
        <h2 id="intake-draft-title">最后看一遍，就可以提交了。</h2><p>本次纳入 ${included.length} 条需求。暂缓的内容留在记录里，之后可以回来补充。</p>
        <ol class="questionnaire-summary">${items.map((item, index) => `<li><div><strong>${esc(item.title)}</strong><small>${esc(scopeText(item))} · ${included.some(x => x.id === item.id) ? state.reviewedIds.includes(item.id) ? '已确认纳入' : '还需确认' : '暂不纳入'}</small></div>${button('查看 / 修改', 'review-item', 'text', `data-intake-id="${index}"`)}</li>`).join('')}</ol>
        ${options.existingCount > 0 ? `<label class="intake-check intake-replace"><input type="checkbox" data-intake-field="replace" ${state.replaceAcknowledged ? 'checked' : ''}/><span>用本次问卷更新当前 ${options.existingCount} 条草稿，保留已发布版本</span></label>` : ''}
        ${issues.length ? `<div class="questionnaire-resolution" role="status"><h3>提交前还需要处理</h3><ul class="intake-adopt-issues">${issues.map(issue => `<li>${esc(issue)}</li>`).join('')}</ul>${state.needsAnalysis ? button('整理最新回答', 'draft-latest', 'secondary', '', busy) : button('返回逐条检查', 'review-first', 'secondary', '', busy)}</div>` : '<p class="intake-ready">已准备好。下一页会展示完整清单，由你确认提交给商家。</p>'}
        <div class="questionnaire-actions">${button('上一步', 'review-last', 'secondary', '', busy)}${button(`提交问卷，查看我的需求 ${icon('arrow')}`, 'adopt', 'primary', '', busy || storageBlocked || issues.length > 0)}</div>
        <details class="questionnaire-more"><summary>导出或补充内容</summary>${button('导出需求文档', 'export-md', 'text')}${button('返回选择偏好', 'edit-brief', 'text', '', busy)}</details>
      </div></section>`
    }
    if (!items.length) return `<section class="questionnaire-sheet"><h2 id="intake-draft-title">再选择一些需要改善的部分</h2><p>这次还没有整理出可确认的需求。</p>${button('返回选择', 'edit-brief', 'primary')}</section>`
    reviewIndex = Math.max(0, Math.min(reviewIndex, items.length - 1))
    const item = items[reviewIndex]
    const itemIssues = questionnaireItemIssues(state, item)
    const ownerQuestions = item.pending.filter(p => p.blocking && ['user', 'unassigned'].includes(p.owner))
    return `<section class="questionnaire-sheet" aria-labelledby="intake-draft-title">
      <div class="questionnaire-review-heading"><h2 id="intake-draft-title">这条需求，符合你的想法吗？</h2><span>第 ${reviewIndex + 1} / ${items.length} 条</span></div>
      <progress value="${reviewIndex}" max="${items.length}" aria-label="逐条确认进度"></progress>
      ${state.needsAnalysis ? `<div class="intake-notice intake-notice--warning"><p>你修改了回答，先更新草稿，再继续确认。</p>${button('整理最新草稿', 'draft-latest', 'primary', '', busy)}</div>` : ''}
      ${renderItem(item, true)}
      ${itemIssues.length && !['undecided', 'excluded'].includes(item.necessity) ? `<div class="questionnaire-resolution"><h3>这条还需要你做个决定</h3>${ownerQuestions.length ? ownerQuestions.map(q => `<p>${esc(q.question)}</p>`).join('') : `<p>${esc(itemIssues[0])}</p>`}<p class="intake-fine">可以继续用选择题补齐，也可以暂不纳入本次需求。</p>${button('继续选择题', 'resolve-item', 'secondary', `data-intake-id="${esc(item.id)}"`, busy)}</div>` : ''}
      <div class="questionnaire-actions">
        ${button('上一步', 'review-prev', 'secondary', '', busy)}
        ${button('暂不纳入', 'review-defer', 'text', `data-intake-id="${esc(item.id)}"`, busy || state.needsAnalysis)}
        ${button(`${item.origin === 'suggestion' ? '采纳建议并确认' : '符合我的想法'}，${reviewIndex === items.length - 1 ? '下一步' : '确认下一条'} ${icon('arrow')}`, 'review-confirm', 'primary', `data-intake-id="${esc(item.id)}"`, busy || state.needsAnalysis || itemIssues.length > 0)}
      </div>
      <p class="intake-fine questionnaire-footnote">确认的是你的需求范围。测量、施工可行性等事项仍需后续核实。</p>
    </section>`
  }
  function moveReview(next: number) {
    error = ''; info = ''
    reviewSummary = next >= (state.result?.items.length || 0)
    if (reviewSummary) furthestStage = 3
    else reviewIndex = Math.max(0, next)
    persist(); render()
    locate(container.querySelector<HTMLElement>('#intake-draft-title'), container)
  }
  function render() {
    if (disposed) return
    const question = state.stage === 'refine' ? currentQuestion() : undefined
    const target = state.result?.items.find(item => item.id === question?.targetId)
    const preferenceArea = guided && state.stage === 'express' ? preferenceRoom() : undefined
    const focusedAreas = preferenceArea ? ['whole-home', 'legacy'].includes(preferenceArea.id) ? [] : [preferenceArea.name] : state.areas
    options.onSpatialFocus?.(intakeSpatialFocus(focusedAreas, question, target, options.spatialModel), busy ? 'analyzing' : question ? 'refine' : state.stage === 'express' ? 'express' : 'draft')
    const openDetails = [...container.querySelectorAll<HTMLDetailsElement>('details[open]')].map(detail => ({ className: detail.className, itemId: detail.closest<HTMLElement>('[data-intake-item]')?.dataset.intakeItem }))
    const focused = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null
    const focusedId = focused && container.contains(focused) ? focused.id : ''
    const selection = focused && ('selectionStart' in focused) ? focused.selectionStart : null
    container.innerHTML = `${guided ? questionnaireProgress() : `<div class="intake-topline"><nav class="intake-steps" aria-label="需求获取步骤">${([['express', '表达想法'], ['refine', '梳理细节'], ['draft', '确认草稿']] as const).map(([stage, text], index) => `<button type="button" data-intake-stage="${stage}" class="${state.stage === stage ? 'is-current' : ''}" ${stage !== 'express' && !state.result ? 'disabled' : ''} ${state.stage === stage ? 'aria-current="step"' : ''}><span>${index + 1}</span>${text}</button>`).join('')}</nav><span class="intake-save-state" data-intake-save-state>${esc(storageError ? '当前内容尚未保存' : savedMessage())}</span></div>`}
      ${planningArea !== undefined ? `<div class="intake-notice intake-planning-context"><strong>${planningArea ? `当前规划 · ${esc(planningArea)}` : '全屋硬装规划'}</strong><a href="#planning">返回空间选择</a></div>` : ''}
      ${statusMarkup()}${projectContextMarkup()}
      ${state.stage === 'express' || !state.result ? introduction() : state.stage === 'refine' ? conversation(question) : guided ? questionnaireDraft() : draft()}
      <footer class="intake-bottom"><span>AI 帮助理解与整理，最终范围和取舍由你决定。</span>${button(guided ? '重新填写本轮问卷' : '开始新的访谈', 'new', 'text', '', busy)}</footer>
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
    persist()
    navigationChanged()
  }
  function navigation(): IntakeNavigation {
    const base = { busy, backAvailable: (state.stage !== 'express' && !!state.result) || (guided && state.stage === 'express' && state.preferences!.cursor > 0) }
    if (busy) return { ...base, title: '正在整理你的回答', description: '内容已保留，整理完成后继续。需要修改时可以取消整理。', nextLabel: '正在整理…' }
    if (storageBlocked) return { ...base, title: '先恢复原来的访谈', description: '原记录无法读取，先导出原始记录，再决定是否开始新访谈。', nextLabel: '下一步' }
    if (requestFeedback === 'error') return { ...base, title: '重新整理这一轮回答', description: '输入和已有草稿均已保留，点击后重新尝试。', nextLabel: '重新整理' }
    if (guided && (!state.result || state.stage === 'express')) {
      const cursor = state.preferences!.cursor
      const questions = preferenceList()
      return { ...base, title: cursor === 0 ? '选择本次规划的房间' : cursor > questions.length ? '核对本轮选择' : questions[cursor - 1].title.replace(`${preferenceRoom().name}，`, ''), description: cursor === 0 ? '每个房间独立保存，接着选择你在意的功能与细节。' : cursor > questions.length ? '确认后，AI 会按这些选择整理需求；也可以回去修改。' : '可以选答案或补充一句。留空点下一题会记为待确认。', nextLabel: cursor === 0 ? '开始选择偏好' : cursor > questions.length ? '确认选择，整理需求' : '下一题' }
    }
    if (!state.result || state.stage === 'express') return { ...base, title: '说说你想改什么', description: '写下生活中的不方便，再确认本次涉及的区域。', nextLabel: '下一步' }
    if (state.stage === 'refine') {
      const question = currentQuestion()
      return { ...base, title: question ? '选择这一个问题的回答' : '准备查看需求草稿', description: question ? '选择符合情况的回答；不清楚或选项不适合时，可选择对应选项。' : '逐条检查 AI 整理出的需求，确认是否符合你的想法。', nextLabel: !question && state.needsAnalysis ? '整理草稿，下一步' : '下一步' }
    }
    if (state.needsAnalysis) return { ...base, title: '先整理最新的修改', description: '你更新了表达或回答，需要整理后再逐条确认。', nextLabel: '更新草稿，下一步' }
    if (reviewSummary || !guided) return { ...base, title: '确认这份需求清单', description: '检查纳入内容；提交问卷只更新草稿，正式发布仍由你确认。', nextLabel: '提交问卷，下一步' }
    const item = state.result.items[reviewIndex]
    const resolution = container.querySelector<HTMLFormElement>('[data-intake-form="resolve"]')
    if (resolution && !resolution.hidden) return { ...base, title: '补充这条需求的决定', description: '写下你的取舍后，AI 会更新草稿，再由你确认。', nextLabel: '保存回答，下一步' }
    return { ...base, title: `确认第 ${reviewIndex + 1} 条需求`, description: item?.origin === 'suggestion' ? '这是一条 AI 建议；点击下一步表示采纳并确认，也可以暂不纳入。' : '核对描述和重要程度；现场测量等未知条件可以保留。', nextLabel: item?.origin === 'suggestion' ? '采纳建议，下一步' : '确认本条，下一步' }
  }
  function guideIssue(selector: string, message: string): IntakeNavigationIssue {
    const target = container.querySelector<HTMLElement>(selector) || container
    for (let parent: HTMLElement | null = target; parent && parent !== container; parent = parent.parentElement) {
      if (parent instanceof HTMLDetailsElement) parent.open = true
    }
    return { target, message }
  }
  function showItemIssue(item: IntakeItem, message: string): IntakeNavigationIssue {
    if (state.stage !== 'draft' || reviewSummary || state.result?.items[reviewIndex]?.id !== item.id) {
      state.stage = 'draft'; reviewSummary = false; filter = 'all'
      reviewIndex = Math.max(0, state.result?.items.findIndex(candidate => candidate.id === item.id) ?? 0)
      furthestStage = Math.max(furthestStage, 2)
      persist(); render()
    }
    const field = (name: string) => `#intake-edit-${name}-${CSS.escape(item.id)}`
    if (['undecided', 'excluded'].includes(item.necessity)) return guideIssue(field('necessity'), message)
    if (guided) return guideIssue('.questionnaire-resolution, [data-intake-item]', `${message} 可继续选择题补齐，或选择暂不纳入。`)
    for (const name of ['title', 'description', 'category', 'component'] as const) {
      if (!item[name].trim()) return guideIssue(field(name), message)
    }
    if (['area', 'shared'].includes(item.scope) && !item.areas.length) return guideIssue(field('areas'), message)
    if (item.necessity === 'must' && item.scope === 'unassigned') return guideIssue(field('scope'), message)
    if (item.necessity === 'must' && item.pending.some(pending => pending.blocking && ['user', 'unassigned'].includes(pending.owner))) {
      const form = container.querySelector<HTMLFormElement>('[data-intake-form="resolve"]')
      if (form) { form.hidden = false; navigationChanged(); return guideIssue('#intake-owner-answer', message) }
    }
    const conflicted = state.result?.conflicts.some(conflict => conflict.itemIds.includes(item.id) && item.necessity === 'must')
    return guideIssue(conflicted ? field('necessity') : `[data-intake-item="${CSS.escape(item.id)}"]`, message)
  }
  async function analyzeFromNavigation(mode: 'refine' | 'draft'): Promise<IntakeNavigationIssue | void> {
    if (!state.brief.trim()) {
      if (state.stage !== 'express') chooseStage('express')
      if (guided) return guideIssue('.preference-fields', '先选择本次希望改善的部分，再继续。')
      return guideIssue('#intake-brief', '先写一句你想改善的地方，再点下一步。')
    }
    const incomplete = state.result?.items.find(item => !item.title.trim() || !item.description.trim() || !item.category.trim() || !item.component.trim())
    if (incomplete) return showItemIssue(incomplete, '请补全这条需求的名称、描述、工程和构件，再继续整理。')
    await analyze(mode)
    if (requestFeedback === 'error') return guideIssue('[data-intake-request-status]', error || '这轮整理没有完成，原内容已保留，可以重试。')
  }
  async function advance(): Promise<IntakeNavigationIssue | void> {
    if (disposed) return
    if (busy) return guideIssue('[data-intake-request-status]', 'AI 正在整理，完成后会显示下一步；需要修改时可以先取消整理。')
    if (storageBlocked) return guideIssue('.intake-notice--warning', storageError)
    if (requestFeedback === 'error') return analyzeFromNavigation(lastMode)
    if (!state.result || state.stage === 'express') {
      if (guided) return advancePreference()
      if (!state.brief.trim()) return guideIssue('#intake-brief', '先写一句你想改善的地方，再点下一步。')
      return analyzeFromNavigation('refine')
    }
    if (state.stage === 'refine') {
      const question = currentQuestion()
      if (!question) {
        if (state.needsAnalysis) return analyzeFromNavigation('draft')
        chooseStage('draft'); return
      }
      if (!state.reply.selected.length && (guided || !state.reply.free.trim())) return guideIssue('.intake-options', guided ? '先选一个回答；不清楚时可以选择“暂不确定”。' : '先选一个回答，或写下补充。')
      await submitAnswer()
      if (error) return guideIssue(container.querySelector('[data-intake-request-status="error"]') ? '[data-intake-request-status]' : '.intake-question', error)
      return
    }
    if (state.needsAnalysis) return analyzeFromNavigation('draft')
    if (!reviewSummary && guided) {
      const item = state.result.items[reviewIndex]
      if (!item) { chooseStage('express'); return guideIssue('#intake-brief', '先补充你的想法，再整理可以确认的需求。') }
      const resolution = container.querySelector<HTMLFormElement>('[data-intake-form="resolve"]')
      if (resolution && !resolution.hidden) {
        if (!resolution.querySelector<HTMLTextAreaElement>('textarea')?.value.trim()) return guideIssue('#intake-owner-answer', '请写下你的决定，或选择“暂不纳入”保留这条待办。')
        await submitResolution(resolution)
        if (error) return guideIssue(container.querySelector('[data-intake-request-status="error"]') ? '[data-intake-request-status]' : '#intake-owner-answer', error)
        return
      }
      const issues = questionnaireItemIssues(state, item)
      if (issues.length) return showItemIssue(item, issues[0])
      state = confirmQuestionnaireItem(state, item.id)
      moveReview(reviewIndex + 1)
      return
    }
    const issues = adoptionIssues(state, options.existingCount)
    if (issues.length) {
      const included = includedItems(state)
      const invalid = included.find(item => questionnaireItemIssues(state, item).length > 0)
      if (invalid) return showItemIssue(invalid, questionnaireItemIssues(state, invalid)[0])
      const unreviewed = included.find(item => !state.reviewedIds.includes(item.id))
      if (unreviewed) return showItemIssue(unreviewed, '请先核对这条需求；确认后再提交整份问卷。')
      if (!included.length) {
        const item = state.result.items.find(item => item.necessity !== 'excluded') ?? state.result.items[0]
        if (item) return showItemIssue(item, '至少确认一条希望纳入本次改造的需求。')
      }
      if (options.existingCount > 0 && !state.replaceAcknowledged) return guideIssue('[data-intake-field="replace"]', '请勾选确认用本次问卷更新当前草稿，已发布版本会保留。')
      return guideIssue('.questionnaire-resolution, .intake-adopt-issues', issues[0])
    }
    const payload = adoptionPayload(state, options.existingCount)
    persist()
    options.onAdopt(payload.requirements, payload.document)
  }
  function previous(): boolean {
    if (disposed) return false
    if (busy) invalidateFlight()
    if (!state.result || state.stage === 'express') {
      if (guided && state.preferences!.cursor > 0) { preferenceStep(state.preferences!.cursor - 1); return true }
      return false
    }
    if (state.stage === 'draft') {
      if (reviewSummary) moveReview(Math.max(0, state.result.items.length - 1))
      else if (reviewIndex > 0) moveReview(reviewIndex - 1)
      else chooseStage('refine')
      return true
    }
    const batch = state.result.questions
    const index = batch.findIndex(question => question.id === currentQuestion()?.id)
    if (index > 0) {
      activeQuestionId = batch[index - 1].id; state.reply.questionId = ''
      render(); locate(container.querySelector<HTMLElement>('.intake-question h3'), container)
    } else chooseStage('express')
    return true
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
      activeQuestionId = ''
      reviewSummary = false
      reviewIndex = Math.max(0, state.result?.items.findIndex(item => !state.reviewedIds.includes(item.id)) ?? 0)
      furthestStage = Math.max(furthestStage, state.stage === 'draft' ? 2 : 1)
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
          locate(container.querySelector<HTMLElement>(heading), guided ? container : undefined)
        }
      }
    }
  }
  function chooseStage(stage: IntakeState['stage']) {
    if (stage !== 'express' && !state.result) return
    if (guided && stage === 'draft' && furthestStage < 2 && pendingQuestions(state).length) return
    if (stage === 'draft') furthestStage = Math.max(furthestStage, 2)
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
    const question = currentQuestion()
    if (!question) return
    const selectedAnswer = choiceOnlyAnswer(question, state.reply.selected)
    const answer = skip ? '暂时跳过，保留为待确认。' : guided ? selectedAnswer.answer : [state.reply.selected.join('、'), state.reply.free.trim()].filter(Boolean).join('；补充：')
    try {
      state = answerQuestion(state, question, answer, skip ? 'deferred' : guided ? selectedAnswer.disposition : 'answered')
      activeQuestionId = ''; error = ''; persist()
      if (pendingQuestions(state).length) { render(); locate(container.querySelector<HTMLElement>('.intake-question h3'), guided ? container : undefined) }
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
      case 'preference-room': {
        if (busy || storageBlocked) break
        const room = rooms.find(room => room.id === id)
        if (!room || room.id === preferenceRoom().id) break
        if (options.onChooseRoom) { persist(); options.onChooseRoom(room.id, room.name) }
        else { state.preferences = newPreferences(room.id); syncPreferenceBrief(); contextChanged(); render() }
        break
      }
      case 'preference-next': {
        const issue = await advance()
        if (issue?.message) { error = issue.message; render(); locate(container.querySelector<HTMLElement>('.preference-fields')) }
        break
      }
      case 'preference-back': if (!busy) previous(); break
      case 'preference-edit': if (!busy && /^\d+$/.test(id)) preferenceStep(Number(id)); break
      case 'wizard-stage': {
        const index = Number(id)
        if (!guided || index > furthestStage || busy) break
        reviewSummary = index === 3
        chooseStage(index === 0 ? 'express' : index === 1 ? 'refine' : 'draft')
        break
      }
      case 'previous-question': {
        const batch = state.result?.questions || []
        const index = batch.findIndex(q => q.id === currentQuestion()?.id)
        if (index > 0) { activeQuestionId = batch[index - 1].id; state.reply.questionId = ''; render(); locate(container.querySelector<HTMLElement>('.intake-question h3'), guided ? container : undefined) }
        else chooseStage('express')
        break
      }
      case 'review-prev': if (reviewIndex === 0) chooseStage('refine'); else moveReview(reviewIndex - 1); break
      case 'review-first': moveReview(Math.max(0, state.result?.items.findIndex(item => includedItems(state).some(x => x.id === item.id) && (!state.reviewedIds.includes(item.id) || questionnaireItemIssues(state, item).length > 0)) ?? 0)); break
      case 'review-last': moveReview((state.result?.items.length || 1) - 1); break
      case 'review-item': moveReview(Number(id)); break
      case 'review-confirm':
        try { state = confirmQuestionnaireItem(state, id); moveReview(reviewIndex + 1) }
        catch (failure) { error = failure instanceof Error ? failure.message : '请先确认这条需求。'; render() }
        break
      case 'review-defer': state = deferQuestionnaireItem(state, id); moveReview(reviewIndex + 1); break
      case 'resolve-item': {
        if (guided) { await analyze('refine'); break }
        const form = container.querySelector<HTMLFormElement>('[data-intake-form="resolve"]')
        if (form) { form.hidden = false; locate(form.querySelector('textarea'), form) }
        else { const editor = container.querySelector<HTMLDetailsElement>('.intake-editor'); if (editor) { editor.open = true; locate(editor) } }
        navigationChanged()
        break
      }
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
        navigationChanged()
        break
      case 'sample': state.brief = expressionExample(); contextChanged(); render(); break
      case 'add-area': addArea(); break
      case 'edit-brief': chooseStage('express'); break
      case 'show-draft': chooseStage('draft'); break
      case 'skip': await submitAnswer(true); break
      case 'inspect-item': chooseStage('draft'); filter = 'all'; render(); requestAnimationFrame(() => container.querySelector<HTMLElement>(`[data-intake-item="${id}"]`)?.focus()); break
      case 'defer-conflict': state = deferConflict(state, id); persist(); render(); break
      case 'rechoose-answer': {
        const existing = state.result?.questions.find(question => question.id === id)
        if (existing) { activeQuestionId = id; state.reply.questionId = ''; chooseStage('refine') }
        break
      }
      case 'remove-answer': state.answers = state.answers.filter(x => x.id !== id); contextChanged(); render(); break
      case 'add-item': {
        if (!state.result) break
        if (state.result.items.length >= 30) { error = '一次最多整理 30 个需求条目，请先完成这批确认。'; render(); break }
        const id = `manual_${Date.now().toString(36)}`
        state.result.items.push({ id, title: '新的需求', scope: state.areas.length === 1 ? 'area' : 'unassigned', areas: state.areas.length === 1 ? [...state.areas] : [], category: '待确认', component: '待确认', description: '', origin: 'user', necessity: 'undecided', clarity: 'vague', evidence: [], standards: [], pending: [], dependencies: [] })
        reviewSummary = false; reviewIndex = state.result.items.length - 1;
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
        invalidateFlight(); reviewIndex = 0; reviewSummary = false; furthestStage = 0; activeQuestionId = ''; state = newIntakeState('', options.projectContext ?? state.projectContext ?? []); if (guided) state.preferences = newPreferences(initialRoomId); rawStored = ''; storageBlocked = false; storageError = ''; error = ''; info = ''; filter = 'all'; persist(); render(); break
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
    const confirm = container.querySelector<HTMLButtonElement>('[data-intake-action="review-confirm"]')
    if (confirm && item) confirm.disabled = busy || questionnaireItemIssues(state, item).length > 0
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
    if (guided && input.dataset.preferenceDetail && !busy && !storageBlocked) {
      const draft = state.preferences!
      const questions = preferenceList()
      const question = questions[draft.cursor - 1]
      if (question?.id !== input.dataset.preferenceDetail) return
      draft.details = { ...draft.details, [question.id]: input.value.slice(0, preferenceDetailLimit) }
      syncPreferenceBrief()
      contextChanged()
      const completed = questions.filter(q => preferenceAnswered(q, draft)).length
      const progress = container.querySelector<HTMLProgressElement>('.preference-progress progress')
      const count = container.querySelector('[data-preference-complete]')
      if (progress) progress.value = completed
      if (count) count.textContent = `已答 ${completed} / ${questions.length} 题`
      for (const button of container.querySelectorAll<HTMLElement>('[data-preference-group]')) {
        const group = questions.filter(q => q.group === button.dataset.preferenceGroup)
        const remaining = group.filter(q => !preferenceAnswered(q, draft))
        const label = button.querySelector('small')
        if (label) label.textContent = `${group.length - remaining.length} / ${group.length}`
        button.dataset.intakeId = String(questions.indexOf(remaining[0] || group[0]) + 1)
      }
      return
    }
    if (input.dataset.intakeEdit && updateEditedText(input)) return
    switch (input.dataset.intakeField) {
      case 'brief': {
        if (guided) return
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
      case 'free-answer': if (guided) return; state.reply.free = input.value; persist(); break
    }
    navigationChanged()
  }
  function onChange(event: Event) {
    const input = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    if (input.dataset.intakeField === 'include-note' && guided && !busy && !storageBlocked) {
      state.preferences!.includeNote = (input as HTMLInputElement).checked
      syncPreferenceBrief(); contextChanged(); error = ''; render()
    } else if (input.dataset.preferenceQuestion && guided) {
      if (busy || storageBlocked || !(input instanceof HTMLInputElement)) return
      const q = preferenceList().find(q => q.id === input.dataset.preferenceQuestion)
      if (!q) return
      state.preferences = selectPreference(state.preferences!, q, input.value, input.checked)
      state.preferences = restorePreferencePosition({ ...state.preferences, stepId: q.id }, preferenceRoom(), options.spatialModel)
      syncPreferenceBrief(); contextChanged(); error = ''; render()
      if (!expressionAcknowledged) { expressionAcknowledged = true; options.onFirstExpression?.() }
    } else if (input.dataset.intakeArea) {
      const area = input.dataset.intakeArea
      state.areas = (input as HTMLInputElement).checked ? [...new Set([...state.areas, area])] : state.areas.filter(x => x !== area)
      if (state.areas.length > 12) { state.areas = state.areas.filter(x => x !== area); error = '一次最多处理 12 个区域，请按改造范围分批整理。'; render(); return }
      contextChanged(); render()
    } else if (input.dataset.intakeChoice) {
      const question = currentQuestion()
      if (!question) return
      const choice = input.dataset.intakeChoice
      const checked = (input as HTMLInputElement).checked
      if (!question.allowMultiple) state.reply.selected = [choice]
      else if (nonAnswerChoices.includes(choice) && checked) state.reply.selected = [choice]
      else state.reply.selected = checked ? [...new Set([...state.reply.selected.filter(x => !nonAnswerChoices.includes(x)), choice])] : state.reply.selected.filter(x => x !== choice)
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
  async function submitResolution(form: HTMLFormElement) {
    if (!busy && !disposed && !storageBlocked) {
      const item = state.result?.items.find(item => item.id === form.dataset.intakeId)
      const reply = form.querySelector<HTMLTextAreaElement>('textarea')?.value.trim()
      if (!item || !reply) return
      const question = item.pending.filter(p => p.blocking && ['user', 'unassigned'].includes(p.owner)).map(p => p.question).join('；')
      state = answerQuestion(state, { id: `owner_${Date.now().toString(36)}`, targetId: item.id, dimension: 'scope', text: question, reason: '', options: [], allowMultiple: false, priority: 'scope' }, reply, 'answered')
      persist(); await analyze('draft')
    }
  }
  async function onSubmit(event: Event) {
    const form = event.target as HTMLFormElement
    if (!form.dataset.intakeForm) return
    event.preventDefault()
    if (form.dataset.intakeForm === 'answer') await submitAnswer()
    if (form.dataset.intakeForm === 'resolve') await submitResolution(form)
  }
  container.addEventListener('click', onClick)
  container.addEventListener('input', onInput)
  container.addEventListener('change', onChange)
  container.addEventListener('submit', onSubmit)
  if (areaAdded) contextChanged()
  else if (contextSynchronized || planningArea !== undefined) persist()
  render()
  return { navigation, advance, previous, refreshSaveState, focusExpression() { chooseStage('express'); if (guided) preferenceStep(0); else container.querySelector<HTMLElement>('#intake-brief')?.focus() }, dispose() {
    disposed = true; gate.dispose(); controller?.abort()
    container.removeEventListener('click', onClick); container.removeEventListener('input', onInput)
    container.removeEventListener('change', onChange); container.removeEventListener('submit', onSubmit)
  } }
}

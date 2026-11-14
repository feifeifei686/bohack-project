import { saveRoomRequirements, combinedRoomDocument, type RoomWork } from '../../../shared/room-work'
import { initializeProjectContext, contextAnswers, projectContextChanged, renderRequirementsOverview, renderProjectContext, renderLegacyArchive, type ProjectContext } from '../../../shared/requirements-hub'
import '../../../shared/requirements-hub.css'
import { createRoomPlanning } from '../../../shared/room-planning'
import { captureFloorplanHandoff, intakeWithSpaceMarkup, mountIntakeSpacePreview, type FloorplanHandoff } from '../../../shared/intake-space-preview'
import { mountIntake } from '../../../shared/intake-ui'
import { intakeRequirementRow, adoptedIntakeHtml, stateFromAdoptedIntake } from '../../../shared/intake-bridge'
import type { IntakeDocument } from '../../../shared/intake-contract'
import type { RequirementInsightRequest, RequirementInsightResponse } from '../../../shared/requirement-insight-contract'
import { requestRequirementInsight, validRequirementInsight } from '../../../shared/requirement-insight-request'
import { renderRequirementInsight, mountRequirementInsight } from './requirement-insight-view'
import './requirement-insight.css'
import { workflowTask } from './workflow-action'
import { renderWorkflowDock, updateWorkflowDock, mountWorkflowDock, highlightWorkflowTarget, clearWorkflowHighlight, type WorkflowDockInput } from './workflow-dock'
import './workflow-dock.css'
import './workflow-integration.css'
import '../../../shared/intake-bridge.css'
import './style.css'
import './home.css'
import './luminous-workspace.css'
import './planning-entry.css'
import './guided-workflow.css'
import './project-experience.css'
import { renderProjectSpace, highlightProjectRoom, modelSource } from './project-space'
import { comparisonInsights } from './comparison-insights'
import { renderProjectReport } from './project-report'
import { createProjectStorage, type ProjectSaveStatus } from './project-storage'
import { decodeRoomPlanningSnapshot } from '../../../shared/planning-snapshot'
import { restoreIntakeState, validResult } from '../../../shared/intake-state'
import { validProjectState } from '../../../shared/project-session-validation'
import { evaluateAssessment, assessmentIsStale, blockedIssues, assessmentOwners, type AssessmentInput, type AssessmentRun, type AssessmentNote, type Dimension } from '../../../shared/assessment'
import { renderAssessment, renderAssessmentArchive } from '../../../shared/assessment-ui'
import '../../../shared/assessment.css'
import { localRecordId } from '../../../shared/local-record-id'
import { projectSteps, unlockedStep, canVisit, type ProjectStep } from './project-flow'
import { proposalSamples, createSampleProposal } from './proposal-samples'
import { mountHomeScene } from './home-scene'
import { createHomeArrival } from './home-arrival'
import { createHoloView } from './glass-model'
import { renderEngineeringSpace, mountEngineeringSpace } from './engineering-ui'
import { ownerDimensions, merchantDimensions, dimensionBridges } from './dimensions'
import type { HouseView } from './house-view'
import { rooms, routes, type LayerId } from './house-data'
import {
  buildRequirements,
  seedProposals,
  reviewProposal,
  reviseDemoProposal,
  parseProposalCsv,
  proposalCsv,
  type Answers,
  type Requirement,
  type Proposal,
  type ProposalItem,
  type Finding,
} from './domain'

type Page =
  | 'overview'
  | 'planning'
  | 'clarify'
  | 'requirements'
  | 'compare'
  | 'space'
  | 'records'
  | 'vendor'
  | 'assessment'
type Snapshot = { version: number; requirements: Requirement[]; at: string; intakeDocument?: IntakeDocument; projectContext?: ProjectContext; assessment?: AssessmentRun; insight?: RequirementInsightResponse }
type Feedback = { id: string; proposalId: string; version: number; items: string[]; at: string }
type Selection = { proposal: Proposal; requirements: Snapshot; at: string; pending: string[]; assessment?: AssessmentRun }
type State = {
  schema: 1
  roomWork?: RoomWork[]
  activeRoomId?: string
  assessments: AssessmentRun[]
  assessmentNotes: AssessmentNote[]
  intakeDocument?: IntakeDocument
  projectContext?: ProjectContext
  brief: string
  answers: Answers
  question: number
  requirements: Requirement[]
  snapshots: Snapshot[]
  proposals: Proposal[]
  feedback: Feedback[]
  selection: Selection | null
  events: { text: string; at: string }[]
  dirty: boolean
}
const INTAKE_KEY = 'mingma-lucid-intake-v2'
let intakeDraft: string | null = null
const demoIntakeStorage = {
  getItem: () => activeRoomWork()?.draft ?? (state.activeRoomId ? null : intakeDraft),
  setItem: (_key: string, value: string) => { const room = activeRoomWork(); if (room) room.draft = value; else intakeDraft = value; scheduleProjectSave() },
}
let scales: Record<string, { maturity: number; priority: string; evidence: string }> = {}

const empty = (): State => ({
  schema: 1,
  assessments: [],
  assessmentNotes: [],
  brief: '',
  answers: { layout: '', devices: [], cleaning: '', cabinet: '', window: '' },
  question: -1,
  requirements: [],
  snapshots: [],
  proposals: [],
  feedback: [],
  selection: null,
  events: [],
  dirty: false,
})
let state: State = empty()
let planningChosen = false
let currentArea: string | null = null
let lastWorkspacePage: Page = 'planning'
let selectedProjectRoom = 'all'
let furthestUnlocked = 1
let samplePreview: 'a' | 'b' | null = null
let assessmentTarget = ''
let assessmentFilter: Dimension | 'all' = 'all'
window.addEventListener('pageshow', event => {
  if (event.persisted) location.reload()
})
if (location.hash === '#dimensions') history.replaceState(null, '', '#requirements')
let page: Page = (location.hash.slice(1) as Page) || 'overview'
let house: HouseView | undefined
const planning = createRoomPlanning({ editorial: true, persistent: true })
let planningEntry: string | null | undefined
let previewFrom: FloorplanHandoff | undefined
let intakePreview: ReturnType<typeof mountIntakeSpacePreview> | undefined
let intakeSession: ReturnType<typeof mountIntake> | undefined
let disposeInsight: (() => void) | undefined
let disposeWorkflowDock: (() => void) | undefined
let workflowUpdateQueued = false
let workflowAdvancing = false
let workflowChoosingProposal = false
let workflowReturnPage: Page = 'requirements'
let workflowPendingFocus: { selector: string; message: string } | null = null
let insightVersion: number | null = null
const insightJobs = new Map<number, { status: 'loading' | 'error'; error?: string; controller?: AbortController }>()
let disposeHome: (() => void) | undefined
let disposeEngineering: (() => void) | undefined
const wallSpace = planning.wallView
let disposeWallSpace: (() => void) | undefined
let spaceMode: 'project' | 'engineering' | 'rooms' | 'walls' = 'project'
let homeArrival: ReturnType<typeof createHomeArrival> | undefined
let homeArrivalKeyboard = false
let intakeEntry: { focus: boolean; appendBrief?: string } | null = null
let vendorDrafts: Record<string, ProposalItem[]> = {}
const draftKey = () => `${vendorId}-r${latest()?.version || 0}`
function persistVendorDraft() {
  vendorDrafts[draftKey()] = clone(draftItems)
  scheduleProjectSave()
}
let selectedRoom = 'kitchen',
  selectedRoute: string | null = null,
  spaceVendor = 'overview',
  vendorId: 'a' | 'b' = 'a',
  draftItems: ProposalItem[] = []
let filter = 'all',
  toastTimer: ReturnType<typeof setTimeout>
const app = document.querySelector<HTMLDivElement>('#app')!
const dialog = document.querySelector<HTMLDialogElement>('#detail-dialog')!
const esc = (v: unknown) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
const stamp = (t: string) =>
  new Date(t).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
const now = () => new Date().toISOString()
const clone = <T>(x: T): T => structuredClone(x)
const latest = () => state.snapshots.at(-1)
const projectContext = () => initializeProjectContext(state.projectContext, scales)
function insightInput(snapshot: Snapshot): RequirementInsightRequest {
  return {
    requirementVersion: snapshot.version,
    requirements: snapshot.requirements.map(({ id, title, description, room, category, priority, source, pending }) => ({ id, title, description, room, category, priority, source, pending: [...pending] })),
    projectContext: contextAnswers(snapshot.projectContext || initializeProjectContext(undefined, {})),
  }
}
function cancelInsightJobs() {
  for (const job of insightJobs.values()) job.controller?.abort()
  insightJobs.clear()
  insightVersion = null
}
function focusInsight() {
  const heading = document.querySelector<HTMLElement>('.requirement-insight h1')
  if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }) }
  window.scrollTo(0, 0)
}
async function startRequirementInsight(snapshot: Snapshot) {
  insightVersion = snapshot.version
  if (snapshot.insight || insightJobs.get(snapshot.version)?.status === 'loading') {
    navigate('requirements'); focusInsight(); return
  }
  // Only the current request may attach its result to this exact snapshot object.
  for (const [version, job] of insightJobs) if (job.status === 'loading') {
    job.controller?.abort()
    insightJobs.set(version, { status: 'error', error: '已切换到另一版需求的分析，可以重新分析此版本。' })
  }
  const controller = new AbortController()
  const job = { status: 'loading' as const, controller }
  insightJobs.set(snapshot.version, job)
  navigate('requirements'); focusInsight()
  try {
    const response = await requestRequirementInsight(insightInput(snapshot), controller.signal)
    if (controller.signal.aborted || insightJobs.get(snapshot.version) !== job || !state.snapshots.includes(snapshot)) return
    snapshot.insight = response
    insightJobs.delete(snapshot.version)
    log(`Flash 完成需求 R${snapshot.version} 的二轮分析：${response.data.metrics.connections} 组关联，${response.data.metrics.needsDetail} 条待补充表达`)
    scheduleProjectSave()
  } catch (error) {
    if (controller.signal.aborted || insightJobs.get(snapshot.version) !== job || !state.snapshots.includes(snapshot)) return
    insightJobs.set(snapshot.version, { status: 'error', error: error instanceof Error ? error.message : '本轮分析暂未完成，请重试。需求已保留。' })
  }
  if (page === 'requirements' && insightVersion === snapshot.version) {
    render()
    toast(snapshot.insight ? 'Flash 二轮分析已完成，可查看需求图谱。' : '需求已保留，本轮分析未完成，可重试。')
  }
}
const currentProposal = (id: 'a' | 'b') => state.proposals.filter((p) => p.vendorId === id).at(-1)
const findings = (p: Proposal) =>
  reviewProposal(
    state.snapshots.find((s) => s.version === p.requirementVersion)?.requirements ?? [],
    p,
  )
function activeRoomWork() { return state.roomWork?.find(room => room.id === state.activeRoomId) }
function roomContextChanged() { return state.roomWork?.some(room => projectContextChanged(projectContext(), room.document)) || projectContextChanged(projectContext(), state.intakeDocument) }
function enterRoomWork(id: string, name: string) {
  intakeSession?.dispose(); intakeSession = undefined
  if (!state.roomWork) {
    state.roomWork = []
    if (state.requirements.length || intakeDraft) state.roomWork.push({ id: 'legacy', name: '原有全屋需求', prefix: 'legacy', draft: intakeDraft, requirements: clone(state.requirements), document: state.intakeDocument ? clone(state.intakeDocument) : undefined, savedDraft: intakeDraft })
  }
  let room = state.roomWork.find(item => item.id === id)
  if (!room) { room = { id, name, prefix: `room${state.roomWork.length + 1}`, draft: null, requirements: [] }; state.roomWork.push(room) }
  room.name = name; state.activeRoomId = id; selectedProjectRoom = id === 'whole-home' || id === 'legacy' ? 'all' : id
  planningChosen = true; currentArea = id === 'whole-home' ? null : name
  planningEntry = room.draft ? undefined : currentArea
  navigate('clarify')
}
function roomOverview() {
  const entries = planning.model().rooms.map(room => ({ id: room.id, name: room.name }))
  entries.push({ id: 'whole-home', name: '全屋与公共需求' })
  for (const room of state.roomWork || []) if (!entries.some(item => item.id === room.id)) entries.push({ id: room.id, name: room.name })
  return `<section class="room-work-overview"><h2>按房间整理，随时继续</h2><p>每间独立保存；只整理本次想改的房间。进行中的修改需保存房间需求后，才会纳入总清单。</p><div>${entries.map(entry => {
    const work = state.roomWork?.find(room => room.id === entry.id)
    const status = work?.requirements.length ? work.draft !== work.savedDraft ? '有修改待保存' : `已整理 · ${work.requirements.length} 条` : work?.draft ? '进行中' : '未开始'
    return `<button data-action="room-work-open" data-id="${esc(entry.id)}"><b>${esc(entry.name)}</b><small>${status}</small></button>`
  }).join('')}</div></section>`
}
function projectScope() {
  if (page === 'planning' && planningChosen) return `${planning.selectedRoom()?.name || '全屋'}规划`
  if (page === 'clarify' && intakeDraft) {
    try { const areas = restoreIntakeState(intakeDraft).areas; if (areas.length) return areas.length === 1 ? `${areas[0]}改造` : '多空间改造' } catch { /* Recovery errors are reported by the project store. */ }
  }
  const areas = [...new Set(state.requirements.flatMap(req => req.intake?.areas ?? [req.room]))]
  return areas.length === 1 ? `${areas[0]}改造` : areas.length ? '多空间改造' : currentArea ? `${currentArea}改造` : planningChosen ? '全屋规划' : '选择你的改造范围'
}
function resumePage(): Page { return routeAllowed(lastWorkspacePage) ? lastWorkspacePage : projectSteps[furthestUnlocked - 1] }
type ProjectSession = {
  state: State; intakeDraft: string | null; scales: typeof scales; vendorDrafts: typeof vendorDrafts;
  planning: ReturnType<typeof planning.snapshot>; planningChosen: boolean; furthestUnlocked: number;
  currentArea: string | null; lastWorkspacePage: Page; selectedProjectRoom: string; vendorId: 'a' | 'b';
}
let projectReady = false
let saveStatus: ProjectSaveStatus = { phase: 'loading' }
let recoveryError = ''
let saveTimer: ReturnType<typeof setTimeout> | undefined
let lastSavedFingerprint = ''
let hasUnsavedChanges = false
function hasProjectDraft() { return planningChosen || !!planning.model().drawing || !!intakeDraft || !!state.requirements.length }
function projectSaveText() {
  if (recoveryError) return '草稿恢复失败 · 原记录已保留'
  if (saveStatus.phase === 'error') return saveStatus.message || '未能保存，请先导出项目'
  if (hasUnsavedChanges || saveStatus.phase === 'saving') return '正在保存到此浏览器…'
  if (saveStatus.savedAt) return `已保存到此浏览器 · ${stamp(saveStatus.savedAt)}`
  return projectReady ? '在此浏览器自动保存 · 可继续编辑' : '正在读取本机草稿…'
}
function refreshSaveStatus() {
  for (const el of document.querySelectorAll<HTMLElement>('[data-project-save]')) {
    el.textContent = projectSaveText()
    el.dataset.savePhase = recoveryError ? 'error' : saveStatus.phase
  }
  for (const el of document.querySelectorAll<HTMLElement>('[data-project-scope]')) el.textContent = `${projectScope()} · ${planning.model().drawing ? '我的户型' : '演示户型'}`
  intakeSession?.refreshSaveState()
  queueWorkflowUpdate()
}
function recoveryNotice() {
  return recoveryError ? `<section class="project-recovery" role="alert"><p>${esc(recoveryError)} 原记录未被覆盖，可以重试读取，或先下载原始记录留存。</p>${btn('重试读取', 'retry-project', 'secondary-button')}${btn('导出原始记录', 'export-recovery', 'text-button')}${btn('清除后重新开始', 'reset', 'text-button')}</section>` : ''
}
function captureProject(): ProjectSession {
  return { state, intakeDraft, scales, vendorDrafts, planning: planning.snapshot(), planningChosen, furthestUnlocked, currentArea, lastWorkspacePage, selectedProjectRoom, vendorId }
}
function scheduleProjectSave() {
  if (!projectReady || recoveryError) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => { void saveProject() }, 200)
  refreshSaveStatus()
}
async function saveProject() {
  clearTimeout(saveTimer)
  if (!projectReady || recoveryError) return
  const data = captureProject()
  const fingerprint = JSON.stringify(data)
  if (fingerprint === lastSavedFingerprint) return
  hasUnsavedChanges = true
  refreshSaveStatus()
  try {
    await projectStore.save(data)
    lastSavedFingerprint = fingerprint
    hasUnsavedChanges = JSON.stringify(captureProject()) !== fingerprint
  } catch { /* The storage status callback keeps the failure visible. */ }
  refreshSaveStatus()
}
function decodeProject(value: unknown): ProjectSession {
  const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)
  const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string')
  const requirement = (v: unknown): boolean => object(v) && ['id', 'title', 'description', 'room', 'category', 'source'].every(k => typeof v[k] === 'string') && ['must', 'prefer'].includes(v.priority) && strings(v.pending) && (!v.intake || validResult({ summary: '', items: [v.intake], questions: [], conflicts: [], readyForDraft: true, stopReason: '', warnings: [] }))
  const proposal = (v: unknown): boolean => object(v) && typeof v.id === 'string' && ['a', 'b'].includes(v.vendorId) && typeof v.vendorName === 'string' && Number.isInteger(v.version) && Number.isInteger(v.requirementVersion) && Array.isArray(v.items) && v.items.every((x: unknown) => object(x) && typeof x.requirementId === 'string' && typeof x.text === 'string' && ['yes','partial','no','unknown'].includes(x.commitment))
  const snapshot = (v: unknown): boolean => object(v) && Number.isInteger(v.version) && typeof v.at === 'string' && Array.isArray(v.requirements) && v.requirements.every(requirement)
  if (!object(value) || !object(value.state)) throw Error('项目草稿格式无法读取。')
  if (!validProjectState(value.state)) throw Error('项目草稿中的记录格式不兼容，原记录已保留。')
  const s = value.state
  if (s.roomWork !== undefined) {
    if (!Array.isArray(s.roomWork) || s.roomWork.some((room: any) => !object(room) || !['id', 'name', 'prefix'].every(key => typeof room[key] === 'string') || !Array.isArray(room.requirements) || !room.requirements.every(requirement) || !(room.draft === null || typeof room.draft === 'string'))) throw Error('房间草稿格式无法读取，原记录已保留。')
    if (new Set(s.roomWork.map((room: any) => room.id)).size !== s.roomWork.length) throw Error('房间编号重复，原记录已保留。')
    for (const room of s.roomWork) { if (room.idMap !== undefined && (!object(room.idMap) || !Object.values(room.idMap).every(id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id)))) throw Error('房间需求编号映射无效，原记录已保留。'); if (room.draft) restoreIntakeState(room.draft); if (room.document && !validResult(room.document.result)) throw Error('房间需求文档无法读取。') }
    if (s.activeRoomId && !s.roomWork.some((room: any) => room.id === s.activeRoomId)) throw Error('当前房间记录不存在。')
  }
  if (s.schema !== 1 || typeof s.brief !== 'string' || typeof s.dirty !== 'boolean' || !object(s.answers) || !strings(s.answers.devices) || !['layout','cleaning','cabinet','window'].every(k => typeof s.answers[k] === 'string') || !Array.isArray(s.requirements) || !s.requirements.every(requirement) || !Array.isArray(s.snapshots) || !s.snapshots.every(snapshot) || !Array.isArray(s.proposals) || !s.proposals.every(proposal) || !Array.isArray(s.events) || !s.events.every((x: unknown) => object(x) && typeof x.text === 'string' && typeof x.at === 'string') || !Array.isArray(s.feedback) || !s.feedback.every((x: unknown) => object(x) && typeof x.proposalId === 'string' && strings(x.items))) throw Error('项目草稿中的需求或方案格式不兼容。')
  if (!Array.isArray(s.assessments) || !s.assessments.every((run: unknown) => object(run) && typeof run.targetKey === 'string' && Array.isArray(run.issues) && Array.isArray(run.dimensions) && Array.isArray(run.notes)) || !Array.isArray(s.assessmentNotes)) throw Error('项目草稿中的评估记录无法读取。')
  if (s.intakeDocument && (!object(s.intakeDocument) || !validResult(s.intakeDocument.result, 1000))) throw Error('项目草稿中的需求文档无法读取。')
  if (s.selection && (!object(s.selection) || !proposal(s.selection.proposal) || !snapshot(s.selection.requirements) || !strings(s.selection.pending))) throw Error('项目草稿中的确认记录无法读取。')
  if (value.intakeDraft !== null) { if (typeof value.intakeDraft !== 'string') throw Error('访谈草稿格式无法读取。'); restoreIntakeState(value.intakeDraft) }
  if (!object(value.scales) || !object(value.vendorDrafts) || !Object.values(value.vendorDrafts).every(items => Array.isArray(items) && items.every(item => object(item) && typeof item.requirementId === 'string' && typeof item.text === 'string' && ['yes','partial','no','unknown'].includes(item.commitment))) || typeof value.planningChosen !== 'boolean' || !Number.isInteger(value.furthestUnlocked) || value.furthestUnlocked < 1 || value.furthestUnlocked > 6 || (value.currentArea !== null && typeof value.currentArea !== 'string') || ![...projectSteps, 'assessment', 'vendor'].includes(value.lastWorkspacePage) || typeof value.selectedProjectRoom !== 'string') throw Error('项目草稿中的进度格式无法读取。')
  decodeRoomPlanningSnapshot(value.planning)
  if (value.vendorId !== undefined && !['a', 'b'].includes(value.vendorId)) throw Error('商家草稿状态无法读取。')
  value.vendorId ??= 'a'
  // An obsolete analysis can be rerun without losing the underlying project.
  for (const item of s.snapshots as Snapshot[]) {
    if (item.insight && !validRequirementInsight(item.insight, insightInput(item))) delete item.insight
  }
  return value as ProjectSession
}
function log(text: string) {
  state.events.unshift({ text, at: now() })
  scheduleProjectSave()
}
function toast(message: string) {
  const el = document.querySelector('#toast')!
  el.textContent = message
  el.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('show'), 3800)
}
function syncFlow() {
  furthestUnlocked = unlockedStep(furthestUnlocked, { planningChosen, requirements: state.requirements.length, published: state.snapshots.length, proposals: state.proposals.length, selected: !!state.selection })
}
function routeAllowed(to: string) { syncFlow(); return canVisit(to, furthestUnlocked) }
function blockedHint() { return `请先完成“${navs.find(n => n[0] === projectSteps[furthestUnlocked - 1])?.[1]}”，再进入后续步骤。` }
function navigate(to: Page) {
  if (!routeAllowed(to)) { toast(blockedHint()); return }
  if ((to === 'assessment' || to === 'vendor') && projectSteps.includes(page as ProjectStep)) workflowReturnPage = page
  if (to !== 'overview') lastWorkspacePage = to
  location.hash = to
  if (page === to) render()
  if (!previewFrom) window.scrollTo(0, 0)
}
window.addEventListener('hashchange', () => {
  if (location.hash === '#dimensions') history.replaceState(null, '', '#requirements')
  const destination = (location.hash.slice(1) as Page) || 'overview'
  if ((destination === 'assessment' || destination === 'vendor') && projectSteps.includes(page as ProjectStep)) workflowReturnPage = page
  page = destination
  window.scrollTo(0, 0)
  render()
})
const paths: Record<string, string> = {
  home: 'M3 10 12 3l9 7v10H3V10m6 10v-7h6v7',
  chat: 'M4 4h16v12H9l-5 4V4m4 4h8m-8 4h5',
  list: 'M8 5h12M8 12h12M8 19h12M3 5h1m-1 7h1m-1 7h1',
  lock: 'M6 10h12v11H6zM8 10V6a4 4 0 0 1 8 0v4',
  compare: 'M4 4h6v16H4zM14 4h6v16h-6z',
  cube: 'm12 2 9 5v10l-9 5-9-5V7l9-5m0 10 9-5M3 7l9 5v10',
  clock: 'M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  check: 'm5 12 4 4L19 6',
  plus: 'M12 5v14M5 12h14',
  export: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  chevron: 'm9 5 7 7-7 7',
  spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3',
  close: 'm6 6 12 12M18 6 6 18',
  info: 'M12 11v6m0-10v1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  edit: 'm4 16 11-11 4 4L8 20H4v-4m9-9 4 4',
  layers: 'm3 8 9-5 9 5-9 5-9-5m0 5 9 5 9-5m-18 5 9 5 9-5',
  reset: 'M4 9a8 8 0 1 1 0 6M4 3v6h6',
  leaf: 'M20 3C7 3 3 7 4 14s13 7 16-11ZM5 19l10-10',
  file: 'M5 3h9l5 5v13H5V3m9 0v6h5M8 13h8m-8 4h6',
}
// HTML template tag keeps the markup readable without changing interpolation semantics.
const html = (parts: TemplateStringsArray, ...values: unknown[]) =>
  parts.reduce((out, part, i) => out + part + (i < values.length ? String(values[i]) : ''), '')
const icon = (name: string, size = 20) =>
  html`<svg
    width="${size}"
    height="${size}"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.65"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="${paths[name] || paths.info}" />
  </svg>`
const navs: [Page, string, string][] = [
  ['overview', '项目概览', 'home'],
  ['planning', '空间选择', 'cube'],
  ['clarify', '需求共创', 'chat'],
  ['requirements', '我的需求', 'list'],
  ['compare', '方案对比', 'compare'],
  ['assessment', '风险评估', 'check'],
  ['space', '空间预览', 'cube'],
  ['records', '确认记录', 'clock'],
]
const btn = (text: string, action: string, cls = 'primary', extra = '') =>
  `<button class="${cls}" data-action="${action}" ${extra}>${text}</button>`
const label = (f: Finding) =>
  ({ responded: '已回应', partial: '部分回应', conflict: '存在冲突', unknown: '信息不足' })[
    f.status
  ]
const status = (f: Finding) =>
  html`<span class="status ${f.status}"
    >${icon(f.status === 'responded' ? 'check' : 'info', 14)}${label(f)}</span
  >`
function heading(title: string, desc: string, actions = '') {
  return html`<div class="task-context">
      <a href="#overview">我的第一个家</a>${icon('chevron', 12)}<span
        >${navs.find((n) => n[0] === page)?.[1] ?? '商家工作区'}</span
      ><small>${taskStage()}</small>
    </div>
    <div
      class="page-heading flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center"
    >
      <div>
        <h1 class="text-balance">${title}</h1>
        <p>${desc}</p>
      </div>
      <div class="heading-actions flex shrink-0 flex-wrap items-center gap-3">${actions}</div>
    </div>`
}
function emptyPanel(title: string, desc: string, action: string, text: string) {
  return html`<div class="empty-state">
    ${icon('file', 38)}
    <h2>${title}</h2>
    <p>${desc}</p>
    ${btn(text, action)}
  </div>`
}
function hasCurrentSelection() {
  return !!state.selection && state.selection.requirements.version === latest()?.version
}
function currentWorkflowTask() {
  const snapshot = latest()
  const insightSnapshot = state.snapshots.find(item => item.version === insightVersion)
  return workflowTask({
    page, planningStage: planning.currentStage(), recognizing: planning.model().analysisState === 'pending',
    roomCount: planning.model().rooms.length, roomName: planning.selectedRoom()?.name,
    requirementCount: state.requirements.length, published: !!snapshot, dirty: state.dirty,
    contextChanged: roomContextChanged(),
    insight: insightSnapshot ? insightSnapshot.insight ? 'complete' : insightJobs.get(insightSnapshot.version)?.status || 'error' : undefined,
    currentProposal: !!snapshot && (['a', 'b'] as const).some(id => currentProposal(id)?.requirementVersion === snapshot.version),
    currentSelection: hasCurrentSelection(), choosingProposal: workflowChoosingProposal,
  })
}
function workflowDockInput(): WorkflowDockInput {
  const task = page === 'clarify' && intakeSession ? intakeSession.navigation() : currentWorkflowTask()
  if (page === 'clarify' && activeRoomWork()) { task.title = `${activeRoomWork()!.name} · ${task.title}`; if (task.nextLabel === '提交问卷，下一步') task.nextLabel = `保存${activeRoomWork()!.name}需求` }
  return { ...task, saveText: recoveryError || saveStatus.phase === 'error' ? '保存需要处理' : hasUnsavedChanges ? '正在保存…' : '草稿自动保存', backLabel: page === 'planning' && state.requirements.length ? '查看总清单' : page === 'planning' && planning.currentStage() === 'drawing' ? '返回首页' : page === 'assessment' || page === 'vendor' ? '返回主流程' : '上一步' }
}
function queueWorkflowUpdate() {
  if (workflowUpdateQueued) return
  workflowUpdateQueued = true
  queueMicrotask(() => {
    workflowUpdateQueued = false
    const dock = document.querySelector<HTMLElement>('#workflow-dock')
    if (dock && page !== 'overview') {
      if (dock.querySelector('[data-workflow-hint]') && !app.querySelector('.workflow-field-hint')) clearWorkflowHighlight()
      updateWorkflowDock(dock, workflowDockInput())
    }
  })
}
function pointWorkflow(selector: string, message: string) {
  // Comma-separated selectors are ordered fallbacks, not document-order matches.
  // A precise field inside closed details wins over its visible parent panel.
  const target = selector.split(',').map(part => {
    const matches = [...app.querySelectorAll<HTMLElement>(part.trim())]
    return matches.find(item => item.getClientRects().length > 0) || matches[0]
  }).find(Boolean) || app.querySelector<HTMLElement>('#main-content')
  if (target) highlightWorkflowTarget(target, message)
}
function navigateWithWorkflowHint(to: Page, selector: string, message: string) {
  workflowPendingFocus = { selector, message }
  navigate(to)
}
function clickWorkflowControl(selector: string) {
  const control = app.querySelector<HTMLButtonElement>(selector)
  if (control && !control.disabled) control.click()
}
async function advanceWorkflow() {
  if (workflowAdvancing || dialog.open) return
  clearWorkflowHighlight()
  if (recoveryError) { pointWorkflow('.project-recovery', '先恢复或导出原草稿，再继续，避免覆盖已有内容。'); return }
  if (!projectReady) { pointWorkflow('[data-project-save]', '正在读取已有项目，请稍等。'); return }
  workflowAdvancing = true
  try {
    switch (currentWorkflowTask().action) {
      case 'wait-planning': pointWorkflow('[data-plan-status], .planning-stage', '正在处理户型，请完成后再继续。'); break
      case 'need-rooms': {
        const name = app.querySelector<HTMLInputElement>('[data-mark-name]')
        const coordinates = [...app.querySelectorAll<HTMLInputElement>('[data-mark-coord]')]
        if (!name?.value.trim()) pointWorkflow('[data-mark-name], .plan-analysis, [data-plan-status]', '先填写房间名称和范围，再点击“添加房间”保存标注。')
        else {
          const [left, top, width, height] = coordinates.map(field => field.valueAsNumber)
          const invalidIndex = coordinates.findIndex(field => !Number.isFinite(field.valueAsNumber) || !field.checkValidity())
          const badRange = invalidIndex >= 0 ? invalidIndex : width < 2.5 || left + width > 100.1 ? 2 : height < 2.5 || top + height > 100.1 ? 3 : -1
          if (badRange >= 0) pointWorkflow(`[data-mark-coord="${badRange}"]`, '请填写图纸内的有效范围；宽高至少 2.5%，不能超出图纸。')
          else pointWorkflow('[data-plan-step="mark"]', '名称和范围已经填好，请点“添加房间”保存标注，再生成户型。')
        }
        break
      }
      case 'generate': clickWorkflowControl('[data-plan-step="build"]'); break
      case 'return-model': clickWorkflowControl('[data-wall-action="back"]'); break
      case 'enter-room': clickWorkflowControl('[data-action="plan-current-room"]'); break
      case 'intake': {
        const issue = await intakeSession?.advance()
        if (issue?.message) {
          if (issue.target?.isConnected) highlightWorkflowTarget(issue.target, issue.message)
          else pointWorkflow('#intake-root', issue.message)
        }
        break
      }
      case 'clarify':
        insightVersion = null
        intakeEntry = { focus: true }
        navigateWithWorkflowHint('clarify', '.preference-fields, #intake-expression-title', state.requirements.length ? '项目背景已变化，请重新核对本轮选择。' : '先选择本次希望改善的部分，再点下方“下一步”。')
        break
      case 'publish': clickWorkflowControl('[data-action="publish"]'); break
      case 'compare': insightVersion = null; workflowChoosingProposal = false; navigate('compare'); break
      case 'need-proposal': pointWorkflow('.proposal-samples', '先点击一张方案卡片，查看它如何回应当前需求；旧版本方案需要更新。'); break
      case 'space': navigate('space'); break
      case 'choose-proposal':
        workflowChoosingProposal = true
        if (page !== 'compare') navigateWithWorkflowHint('compare', '[data-action="select-proposal"]:not(:disabled), .proposal-samples', '请选择你要的方案，再核对待办并确认；不会自动替你选择。')
        else pointWorkflow('[data-action="select-proposal"]:not(:disabled), .proposal-samples', '在你选择的方案下点击“查看并选择此方案”，核对待办后再确认。')
        break
      case 'records': navigate('records'); break
      case 'overview': navigate('overview'); break
      case 'vendor': {
        const blank = draftItems.every(item => !item.text.trim())
        const missing = draftItems.find(item => item.commitment === 'yes' && !item.text.trim())
        if (blank || missing) pointWorkflow(missing ? `[data-proposal-text="${CSS.escape(missing.requirementId)}"]` : '[data-proposal-text]', blank ? '请至少写一项具体做法，再提交方案。' : '这项标记为“已回应”，请补充具体做法。')
        else clickWorkflowControl('[data-action="submit-vendor"]')
        break
      }
      case 'assessment': {
        const input = assessmentInput()
        const run = state.assessments.slice().reverse().find(item => item.targetKey === assessmentTarget)
        if (run && input && assessmentIsStale(run, input)) {
          clickWorkflowControl('[data-action="assessment-run"]')
          pointWorkflow('#assessment-issues', '已按最新资料重新评估，请看更新后的事项。')
          break
        }
        const issue = run && blockedIssues(run, input?.proposal ? 'select' : 'publish')[0]
        if (issue) {
          assessmentFilter = 'all'; render()
          pointWorkflow(`#risk-${CSS.escape(issue.id)}`, '这项问题影响确认，请按处理建议修改原需求或方案；填写安排不会自动解除阻断。')
        } else navigate(routeAllowed(workflowReturnPage) ? workflowReturnPage : 'requirements')
        break
      }
    }
  } finally { workflowAdvancing = false; queueWorkflowUpdate() }
}
function previousWorkflow() {
  if (page === 'planning' && state.requirements.length) { navigate('requirements'); return }
  clearWorkflowHighlight()
  if (page === 'clarify') {
    if (intakeSession?.navigation().busy) { pointWorkflow('.intake-request-dock', '可以先取消本轮整理，再返回上一步。'); return }
    if (intakeSession?.previous()) return
  }
  if (page === 'planning') {
    if (planning.currentStage() === 'walls') { clickWorkflowControl('[data-wall-action="back"]'); return }
    if (planning.currentStage() === 'model') { clickWorkflowControl('[data-plan-step="drawing"]'); return }
    if (planning.currentStage() === 'building') { pointWorkflow('.planning-stage', '正在生成户型，完成后可以返回原图。'); return }
    navigate('overview'); return
  }
  if (page === 'requirements' && insightVersion !== null) { insightVersion = null; render(); return }
  if (page === 'assessment' || page === 'vendor') { navigate(routeAllowed(workflowReturnPage) ? workflowReturnPage : 'requirements'); return }
  const index = projectSteps.indexOf(page as ProjectStep)
  navigate(index > 0 ? projectSteps[index - 1] : 'overview')
}
function taskStage() {
  const revision = latest()
  if (hasCurrentSelection()) return '已记录方案选择'
  if (state.selection && revision) return `需求已更新到 R${revision.version}，待重新核对`
  return revision
    ? `需求 R${revision.version} 已发布`
    : state.requirements.length
      ? '需求草稿待确认'
      : '等待定义第一条需求'
}

function flowNavigation(home = false) {
  return navs.map(([id, text, glyph]) => {
    const locked = !routeAllowed(id)
    const index = projectSteps.indexOf(id as ProjectStep)
    const complete = index >= 0 && (index < furthestUnlocked - 1 || !!state.selection)
    const body = `${home ? icon(locked ? 'lock' : glyph, 18) : `<span class="flow-step-number">${id === 'overview' ? icon('home', 17) : id === 'assessment' ? icon(locked ? 'lock' : 'check', 16) : locked ? icon('lock', 14) : complete ? icon('check', 16) : index + 1}</span>`}<span>${text}${home ? '' : `<small>${locked ? '待解锁' : page === id ? '当前页面' : id === 'assessment' ? '随时检查' : complete ? '可回看' : '可继续'}</small>`}</span>`
    return locked ? `<button class="${home ? 'home-locked-link' : 'nav-item is-locked'}" data-action="guide-step" data-destination="${id}" title="${esc(blockedHint())}" aria-label="${text}，${esc(blockedHint())}">${body}</button>` : `<a href="#${id}" class="${home ? '' : `nav-item ${page === id ? 'active' : ''} ${complete ? 'is-complete' : ''}`}" ${page === id ? 'aria-current="page"' : ''}>${body}</a>`
  }).join('')
}
function flowGuide() {
  if (page === 'overview' || page === 'vendor' || page === 'assessment') return ''
  const index = projectSteps.indexOf(page)
  const completed = state.selection ? 6 : furthestUnlocked - 1
  return `<section class="project-progress" aria-label="项目进度"><div class="project-progress-top"><span>第 ${index + 1} / 6 步 · <b>${navs.find(n => n[0] === page)?.[1]}</b></span><span>已完成 ${completed} / 6 步</span></div><progress value="${completed}" max="6" aria-label="整体项目完成进度"></progress></section>`
}
function shell(content: string) {
  if (page === 'overview') return content
  return html`<div class="lucid-app has-workflow-dock page-${page}${page === 'planning' ? ' planning-page' : ''}">
    <div class="ambient-scene" aria-hidden="true">
      <div></div>
      <span></span>
    </div>
    <header class="studio-header">
      <div class="header-main">
        <a class="studio-brand" href="#overview" aria-label="安居有数项目首页"
          ><span class="studio-mark">${icon('cube', 25)}</span
          ><span>安居有数<small>Dream Defined. Living Refined.</small></span></a
        >
        <div class="project-switch">
          <span class="project-dot"></span>
          <div><b>我的第一个家</b><small data-project-scope>${esc(projectScope())} · ${planning.model().drawing ? '我的户型' : '演示户型'}</small><small class="project-save-status" data-project-save aria-live="polite">${esc(projectSaveText())}</small></div>
        </div>
        <div class="header-actions">
          <button class="icon-button" data-action="about" aria-label="关于此演示">
            ${icon('info', 18)}</button
          >${btn(`${icon('export', 16)}<span>导出项目</span>`, 'export', 'secondary-button small', 'aria-label="导出项目"')}
        </div>
      </div>
      <nav class="studio-navigation" aria-label="项目导航">
        ${flowNavigation()}
      </nav>
    </header>
    <main id="main-content" class="studio-main${page === 'planning' ? ' plan-main' : ''}">
      ${recoveryNotice()}${flowGuide()}${content}
    </main>
    <footer class="app-footer">
      <span>安居有数 · Dream Defined. Living Refined.</span>
      <div><i class="project-dot"></i><span data-project-save>${esc(projectSaveText())}</span> · 商家方案为演示</div>
    </footer>
    ${renderWorkflowDock(workflowDockInput())}
  </div>`
}

function overview() {
  const snap = latest()
  const reqs = snap?.requirements ?? state.requirements
  const pending = reqs.reduce((sum, r) => sum + r.pending.length, 0)
  return html`<div class="lucid-app page-overview home-page">
    <a class="home-skip" href="#home-content">跳到首页内容</a>
    <header class="home-header">
      <a class="home-brand" href="#overview" aria-label="安居有数首页">
        <span class="home-brand-mark">${icon('cube', 27)}</span>
        <span><b>安居有数</b><small>Dream Defined. Living Refined.</small></span>
      </a>
      <nav class="home-navigation" aria-label="快捷导航">
        <a href="#planning">空间规划</a>
        ${routeAllowed('clarify') ? '<a href="#clarify">需求共创</a>' : '<button class="home-nav-guided" data-action="guide-step" data-destination="clarify">需求共创<small>先选择空间</small></button>'}
        ${routeAllowed('compare') ? '<a href="#compare">方案对比</a>' : '<button class="home-nav-guided" data-action="guide-step" data-destination="compare">方案对比<small>先确认并发布需求</small></button>'}
      </nav>
      <details class="home-menu">
        <summary>项目工作台${icon('plus', 16)}</summary>
        <div class="home-menu-panel">
          <nav aria-label="项目导航">
            ${flowNavigation(true)}
          </nav>
          <div class="home-menu-tools">
            ${btn(`${icon('export', 17)}导出项目`, 'export', 'home-menu-tool')}
            ${btn(`${icon('info', 17)}关于演示`, 'about', 'home-menu-tool')}
          </div>
        </div>
      </details>
    </header>
    <main id="main-content">
      ${recoveryNotice()}
      <section id="home-content" class="home-hero" data-home-scene data-scene="residence" aria-labelledby="home-title" tabindex="-1">
        <div class="home-atmosphere" aria-hidden="true"></div>
        <div class="home-art" data-home-canvas aria-label="住宅三维搭建演示">
          <p class="home-loading" data-home-loading>正在准备三维空间…</p>
        </div>
        <div class="home-scene-toolbar">
          <div class="home-scene-choices" role="group" aria-label="切换三维展示图层">
            <button type="button" data-home-view="residence" aria-pressed="true" disabled>${icon('home', 16)}完整空间</button>
            <button type="button" data-home-view="structure" aria-pressed="false" disabled>${icon('layers', 16)}建筑结构</button>
          </div>
        </div>
        <div class="home-hero-bottom">
          <div class="home-hero-copy">
            <h1 id="home-title">从家的每一处，<br />对齐你的生活。</h1>
            <p>把生活想法说清楚，让装修方案有据可循。</p>
          </div>
          <div class="home-entry">
            <button class="home-start" data-action="${hasProjectDraft() ? 'resume-project' : 'go-planning'}">
              <span class="home-start-symbol">${icon('arrow', 25)}</span>
              <span><b>${hasProjectDraft() ? '继续我的项目' : '开始硬装规划'}</b><small>${hasProjectDraft() ? `${esc(projectScope())} · ${esc(navs.find(item => item[0] === resumePage())?.[1] || '空间选择')}` : '选择房间，聊聊你想要的家'}</small></span>
              ${icon('chevron', 20)}
            </button>
            ${reqs.length ? `<button class="home-secondary" data-action="go-requirements">继续查看我的需求${icon('arrow', 15)}</button>` : ''}
            ${hasProjectDraft() ? `<small class="home-resume-meta" data-project-save>${esc(projectSaveText())}</small>` : ''}
          </div>
        </div>
        <div class="home-hero-foot">
          <span>3D 住宅搭建 · 示意户型</span>
          <button type="button" class="home-scroll" data-home-scroll>了解规划流程<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M12 4v16m-6-6 6 6 6-6" /></svg></button>
          <span class="home-scene-caption" data-home-caption>一座家，逐渐成形</span>
        </div>
      </section>
      <section class="home-outcome" aria-labelledby="home-outcome-title">
        <header><h2 id="home-outcome-title">把一句想法，变成能讨论的方案。</h2><p>用厨房的小例子，看看最后会得到什么。</p></header>
        <div class="home-outcome-example">
          <article><p>你的生活想法</p><h3>“厨房想好打理，也想加一台洗碗机。”</h3><p>先说使用习惯，不必提前知道施工术语。</p></article>
          <article><p>一起确认的需求</p><h3>安装位、供水、排水和电源，逐项说清楚。</h3><p>明确必须满足的内容，保留型号、尺寸等现场待确认事项。</p></article>
          <article><p>看得懂的方案差异</p><h3>方案 A 漏了供排水说明，需要补充。</h3><p>对照同一份清单看遗漏和冲突，再把结果带去讨论。</p></article>
        </div>
        <footer><span>以上为演示示例</span><button class="home-text-link" data-action="demo">打开案例，看看完整对比${icon('arrow', 18)}</button></footer>
      </section>
      <section class="home-process" id="home-process" aria-labelledby="home-process-title" tabindex="-1">
        <div class="home-process-intro">
          <h2 id="home-process-title">先说生活，<br />再谈怎么装修。</h2>
          <p>从一句「厨房想好打理」开始。AI 帮你补齐细节，让每条需求都有对应的空间、做法和回应。</p>
          <button class="home-text-link" data-action="go-clarify">和 AI 聊聊我的想法${icon('arrow', 18)}</button>
        </div>
        <ol class="home-process-list">
          ${[
            ['planning', '从空间开始', '选择房间，明确这次想改哪里、保留什么。'],
            ['clarify', '把想法聊清楚', 'AI 逐步追问，将生活化表达整理成具体要求。'],
            ['requirements', '确认共同清单', '逐项核对需求，形成商家能够回应的版本。'],
            ['compare', '让方案有据可循', '对照需求看回应、差异与修订，再做选择。'],
          ].map(([route, title, desc], i) => html`<li><button data-action="go-${route}"><span class="home-step-index">${String(i + 1).padStart(2, '0')}</span><span><b>${title}</b><small>${desc}</small></span>${icon('arrow', 19)}</button></li>`).join('')}
        </ol>
      </section>
      <section class="home-project" aria-labelledby="home-project-title">
        <div class="home-project-heading">
          <div><h2 id="home-project-title">我的第一个家</h2><p>${esc(state.brief || '你的想法、每次确认和方案修订，都从这里接着往下走。')}</p></div>
          <span class="home-project-status"><i></i>${taskStage()}</span>
        </div>
        <dl class="home-project-facts">
          <div><dt>需求条目</dt><dd>${reqs.length ? reqs.length + ' 条' : '尚未建立'}</dd></div>
          <div><dt>现场待办</dt><dd>${pending ? pending + ' 项' : '待梳理'}</dd></div>
          <div><dt>当前基准</dt><dd>${snap ? 'R' + snap.version : '草稿准备'}</dd></div>
          <div class="home-project-records"><dt>确认与选择</dt><dd><button class="home-text-link" data-action="go-records">查看确认记录${icon('arrow', 17)}</button></dd></div>
        </dl>
        ${state.events.length ? html`<ol class="home-events">${state.events.slice(0, 3).map(e => html`<li><p>${esc(e.text)}</p><time>${stamp(e.at)}</time></li>`).join('')}</ol>` : ''}
      </section>
    </main>
    <footer class="home-footer"><span>安居有数</span><p>Dream Defined. Living Refined.</p><small data-project-save>${esc(projectSaveText())}</small></footer>
  </div>`
}

const questions: {
  key: keyof Answers
  title: string
  why: string
  options: string[]
  descriptions: string[]
  multi?: boolean
}[] = [
  {
    key: 'layout',
    title: '厨房里，你想保留现在的布局吗？',
    why: '水槽和冰箱的位置，会影响后续的设备与管线安排。',
    options: ['保留现有布局', '允许调整', '暂不确定'],
    descriptions: [
      '尽量保留水槽与冰箱位置',
      '商家可以提出更合适的布局',
      '先让商家说明调整的必要性',
    ],
  },
  {
    key: 'devices',
    title: '哪些电器，需要出现在你的厨房里？',
    why: '分别记录设备，商家才能回应柜位、电源与供排水配套。',
    options: ['洗碗机', '电饭煲', '咖啡机', '烤箱', '净水器', '暂不确定'],
    descriptions: [
      '嵌入柜体，关注供排水',
      '台面常用设备',
      '日常咖啡角',
      '预留放置与使用位置',
      '关注设备及接口位置',
      '稍后再补充设备清单',
    ],
    multi: true,
  },
  {
    key: 'cleaning',
    title: '说到好打理，你更在意什么？',
    why: '用日常体验描述目标，商家再说明对应材料和做法。',
    options: ['容易擦拭、减少接缝', '耐用优先', '暂不确定'],
    descriptions: [
      '关心表面清洁、接缝与积灰位置',
      '关注长期维护和使用耐久性',
      '让商家解释不同做法的差异',
    ],
  },
  {
    key: 'cabinet',
    title: '你能接受开放式的展示格吗？',
    why: '柜体形式会影响收纳、清洁和视觉效果。',
    options: ['不要开放展示格', '接受开放展示格', '暂不确定'],
    descriptions: ['日常收纳优先使用封闭柜体', '愿意留一部分空间陈列物品', '先看方案，再选择'],
  },
  {
    key: 'window',
    title: '这次改造，厨房窗户要怎么处理？',
    why: '先划清施工范围，避免商家默认把换窗算在方案里。',
    options: ['保留现有窗', '考虑更换', '暂不确定'],
    descriptions: [
      '本次不安排更换，问题另行说明',
      '希望商家提供更换做法',
      '需要先了解现有窗户状态',
    ],
  },
]
function clarify() {
  return html`${heading('一步一步，说清你想要的家。', '按问卷填写即可。不懂的专业问题可以先留待确认。')}${intakeWithSpaceMarkup(planning.model())}`
}
function requirements() {
  const insightSnapshot = state.snapshots.find(snapshot => snapshot.version === insightVersion)
  if (insightSnapshot) {
    const job = insightJobs.get(insightSnapshot.version)
    return renderRequirementInsight({
      requirements: insightSnapshot.requirements, version: insightSnapshot.version,
      status: insightSnapshot.insight ? 'complete' : job?.status || 'error',
      result: insightSnapshot.insight?.data, model: insightSnapshot.insight?.meta.model,
      error: job?.error || '本轮分析尚未完成，可以重新分析。',
      stale: state.dirty || insightSnapshot.version !== latest()?.version,
    })
  }
  if (!state.requirements.length) return html`<div class="hub-root" data-variant="lucid">
    ${heading('我的需求', '把改造要求、项目背景和待确认信息放在一起。')}
    ${emptyPanel('先把想法整理成需求', '从一句生活化描述开始，AI 会拆分范围并补问缺少的信息。', 'go-clarify', '开始需求共创')}
    <details class="requirements-extras"><summary>项目背景与补充记录</summary>${renderProjectContext(projectContext())}${renderLegacyArchive(scales, ownerDimensions, merchantDimensions)}</details>
  </div>`
  const snap = latest()
  return html`<div class="hub-root" data-variant="lucid">${roomOverview()}${heading('我的需求', '各房间已保存需求在此统一汇总；确认后一起提交。', btn(`${icon('plus', 16)}补充需求`, 'add-requirement', 'secondary-button'))}
    <div class="document-toolbar">
      <div>
        <span class="status ${state.dirty || !snap ? 'partial' : 'responded'}"
          >${state.dirty || !snap ? '待发布草稿' : `已发布 R${snap.version}`}</span
        ><span
          >${state.requirements.length} 条需求 ·
          ${state.requirements.filter((r) => r.priority === 'must').length} 条必须项</span
        >
      </div>
      <div>
        ${snap ? btn(snap.insight ? '查看需求图谱' : insightJobs.get(snap.version)?.status === 'loading' ? '查看 Flash 分析进度' : 'Flash 需求分析', 'insight-open', 'secondary-button') : ''}${btn('查看风险评估', 'assessment-open', 'secondary-button', 'data-target="draft"')}${snap ? btn('查看版本', 'history', 'text-button') : ''}${roomContextChanged() && (state.dirty || !snap) ? btn('先更新需求草稿', 'go-clarify') : btn(state.dirty || !snap ? '提交需求，等待方案' : '查看商家方案', state.dirty || !snap ? 'publish' : 'go-compare')}
      </div>
    </div>
    <div class="notice">
      ${icon('info', 18)}设备尺寸与现场接口可以留待核实。发布代表开始方案协作，不代表施工条件已经确定。
    </div>
    ${roomContextChanged() ? '<div class="notice warn">项目背景已改变或与原梳理记录不同。请重新整理并采用草稿后再发布新版本；原发布版本保持不变，仍可用于方案对比。</div>' : ''}
    <div class="hub-workspace">
    <section class="requirement-list">
      ${state.requirements
        .map(
          (r, i) => r.intake ? intakeRequirementRow(r, i) :
            html`<article class="requirement-row" data-requirement-id="${esc(r.id)}">
              <span class="req-order">${String(i + 1).padStart(2, '0')}</span>
              <div class="req-content min-w-0 flex-1">
                <div class="req-meta">
                  ${esc(r.room)} / ${esc(r.category)}<span>${esc(r.id)}</span>
                </div>
                <h3>${esc(r.title)}</h3>
                <p>${esc(r.description)}</p>
                <div class="req-pending">
                  ${r.pending.length ? `${icon('info', 14)}待确认：${esc(r.pending.join('、'))}` : `${icon('check', 14)}已记录用户选择`}
                </div>
              </div>
              <div class="req-controls">
                <label class="sr-only" for="priority-${r.id}">需求 ${esc(r.title)} 的重要程度</label
                ><select id="priority-${r.id}" data-priority="${esc(r.id)}">
                  <option value="must" ${r.priority === 'must' ? 'selected' : ''}>必须满足</option>
                  <option value="prefer" ${r.priority === 'prefer' ? 'selected' : ''}>
                    优先偏好
                  </option></select
                ><button class="text-button" data-action="edit-requirement" data-id="${esc(r.id)}">
                  ${icon('edit', 15)}编辑
                </button>
              </div>
            </article>`,
        )
        .join('')}
    </section>
    ${renderRequirementsOverview(state.requirements, state.intakeDocument, projectContext())}
    </div>
    <p class="end-note">原始表达：${esc(state.brief || '完整演示案例')}</p>
    <details class="requirements-extras"><summary>项目背景与补充记录</summary>${renderProjectContext(projectContext())}${renderLegacyArchive(scales, ownerDimensions, merchantDimensions)}</details>
  </div>`
}
function renderMerchantWaiting() {
  const snap = latest()!
  return `<section class="merchant-waiting" role="status"><span class="merchant-waiting-symbol">${icon('clock', 30)}</span><div><h2>商家正在制作</h2><p>需求 R${snap.version} · ${snap.requirements.length} 条需求已就绪</p><ol><li>${icon('check', 16)}需求已提交</li><li aria-current="step">正在整理方案</li><li>完成后查看对比</li></ol><small>当前为演示流程，未发送给真实商家。下方预制方案可立即查看。</small></div></section>`
}
function renderProposalSamples() {
  const snap = latest()!
  const selected = proposalSamples.find(sample => sample.id === samplePreview)
  const p = selected && currentProposal(selected.id)
  return `<section class="proposal-samples" aria-labelledby="proposal-samples-title"><div class="proposal-samples-heading"><div><h2 id="proposal-samples-title">先看看方案会是什么样</h2><p>预制演示方案 · 点击立即展示，效果图仅作风格参考。</p></div>${btn('同时展示两份方案', 'seed', 'text-button')}</div><div class="proposal-sample-grid">${proposalSamples.map(sample => {
    const available = currentProposal(sample.id)?.requirementVersion === snap.version
    return `<button class="proposal-sample ${samplePreview === sample.id ? 'is-selected' : ''}" data-action="show-sample" data-id="${sample.id}" aria-pressed="${samplePreview === sample.id}"><img src="/assets/${sample.image}" alt="${sample.title}风格示意" loading="lazy"/><span class="proposal-sample-copy"><small>${sample.name} · 演示方案</small><strong>${sample.title}</strong><span>${sample.description}</span><b>${available ? '查看这份方案' : '点击展示方案'} ${icon('arrow', 18)}</b></span></button>`
  }).join('')}</div>
  ${selected && p ? `<article class="sample-proposal-detail" id="sample-proposal-detail" tabindex="-1"><div class="sample-detail-heading"><div><h2>${selected.title}</h2><p>${selected.name} · 演示 V${p.version} · 对应需求 R${p.requirementVersion}</p></div>${btn('查看并选择此方案', 'select-proposal', 'primary', `data-id="${esc(p.id)}" ${p.requirementVersion !== snap.version ? 'disabled' : ''}`)}</div><p>${selected.description}</p><ul class="sample-highlights">${selected.highlights.map(highlight => `<li>${icon('check', 16)}${highlight}</li>`).join('')}</ul><details open><summary>如何回应你的 ${p.items.length} 条需求</summary><dl>${p.items.map(item => `<div><dt>${esc(snap.requirements.find(r => r.id === item.requirementId)?.title || item.requirementId)}</dt><dd>${esc(item.text)}</dd></div>`).join('')}</dl></details><a class="sample-comparison-link" href="#proposal-comparison" data-action="scroll-comparison">下方逐项对照两份方案 ${icon('arrow', 16)}</a></article>` : ''}</section>`
}
function compare() {
  const snap = latest()
  if (!snap)
    return (
      heading('方案对比', '用同一份需求，看清两家方案的回应。') +
      emptyPanel(
        '还没有发布需求',
        '先确认需求清单，商家才能据此提供方案。',
        'go-requirements',
        '查看需求清单',
      )
    )
  const ps = (['a', 'b'] as const).map(currentProposal)
  const hasCurrent = ps.some(p => p?.requirementVersion === snap.version)
  const samples = renderProposalSamples()
  if (ps.every(p => !p)) return `${heading('需求已提交，接下来看看方案。', '方案会围绕你的清单逐项回应。你可以先体验预制示例。')}${renderMerchantWaiting()}${samples}`
  const data = ps.map(
    (p, i) =>
      p ??
      ({
        id: 'pending-' + i,
        vendorId: i === 0 ? 'a' : 'b',
        vendorName: i === 0 ? '木序设计' : '栖居营造',
        version: 0,
        requirementVersion: snap.version,
        items: [],
        createdAt: now(),
      } as Proposal),
  )
  const fs = data.map((p) => findings(p))
  const stale = data.some((p) => p.requirementVersion !== snap.version)
  const reqs = snap.requirements.filter(
    (r) =>
      filter === 'all' ||
      stale ||
      fs.some((f) => f.find((x) => x.requirementId === r.id)?.status !== 'responded'),
  )
  const insights = comparisonInsights(snap.requirements, state.proposals, snap.version)
  const summary = hasCurrent ? `<section class="comparison-insights" aria-labelledby="comparison-insights-title"><header><h2 id="comparison-insights-title">先看这些关键差异</h2><p>按已发布需求 R${snap.version} 核对，优先显示必须项冲突与遗漏。点一项查看原文。</p></header>${insights.length ? `<ol>${insights.map(item => `<li data-kind="${item.kind}"><button data-action="comparison-focus" data-id="${esc(item.requirementId)}"><span class="insight-kind">${item.kind === 'must-conflict' ? '优先处理' : item.kind === 'missing' ? '需要补充' : '需要核对'}</span><strong>${esc(item.title)}</strong><p>${esc(item.summary)}</p><small>下一步：${esc(item.action)}</small></button></li>`).join('')}</ol>` : '<p>当前规则未发现新的差异；仍需核对原文及现场待确认事项。</p>'}</section>` : ''
  return html`${heading('每一份方案，如何回应你', '相同的需求基准，让差异清楚可见。', btn(`${icon('edit', 16)}商家提交 / 修订`, 'go-vendor', 'secondary-button'))}${!hasCurrent ? renderMerchantWaiting() : ''}${state.dirty ? '<p class="notice warn">你有尚未发布的需求修改。当前仍按已发布版本比较。</p>' : ''}${stale ? `<div class="notice warn">${icon('info', 18)}需求已更新到 R${snap.version}，商家方案还在引用旧版。${btn('按新需求重新提交', 'go-vendor', 'text-button')}</div>` : ''}${summary}<details class="proposal-reference" ${samplePreview ? 'open' : ''}><summary>查看风格参考与演示方案</summary>${samples}</details>
    <div class="compare-toolbar" id="proposal-comparison">
      <div class="segmented">
        <button data-filter="all" class="${filter === 'all' ? 'selected' : ''}">全部需求</button
        ><button data-filter="issues" class="${filter === 'issues' ? 'selected' : ''}">
          只看待处理
        </button>
      </div>
      <span>需求基准 R${snap.version} · 规则辅助核对</span>${btn('查看风险评估', 'assessment-open', 'secondary-button', `data-target="requirements:${snap.version}"`)}
    </div>
    <p class="comparison-hint">${icon('arrow', 15)}左右滑动，对照两家方案的回应。</p>
    <div
      class="comparison-scroll overflow-x-auto overscroll-x-contain"
      tabindex="0"
      aria-label="商家方案对比，可横向滚动"
    >
      <table class="comparison">
        <thead>
          <tr>
            <th>
              <span class="muted">对照基准</span>
              <h3>你的需求</h3>
              <small>${snap.requirements.length} 项 · 用户已确认</small>
            </th>
            ${data
              .map(
                (p, i) =>
                  html`<th>
                    <div class="vendor-name">
                      <span class="vendor-avatar ${p.vendorId}">${p.vendorId.toUpperCase()}</span>
                      <div>
                        <h3>${esc(p.vendorName)}</h3>
                        <small
                          >${p.version ? '模拟商家 · V' + p.version + ' / R' + p.requirementVersion : '尚未提交方案'}</small
                        >
                      </div>
                    </div>
                    <div class="vendor-summary">
                      ${p.requirementVersion !== snap.version ? '旧版结果，需重新核对' : `<b>${fs[i].filter((f) => f.status === 'responded').length}</b> 已回应 <span>· ${fs[i].filter((f) => f.status !== 'responded').length} 项待处理</span>`}
                    </div>
                  </th>`,
              )
              .join('')}
          </tr>
        </thead>
        <tbody>
          ${
            reqs
              .map(
                (r) =>
                  html`<tr data-comparison-row="${esc(r.id)}" tabindex="-1">
                    <td>
                      <span class="req-id"
                        >${esc(r.id)} · ${r.priority === 'must' ? '必须满足' : '优先偏好'}</span
                      >
                      <h4>${esc(r.title)}</h4>
                      <p>${esc(r.description)}</p>
                    </td>
                    ${data
                      .map((p, i) => {
                        const f = fs[i].find((f) => f.requirementId === r.id)
                        return html`<td>
                          ${!p.version ? '<span class="status unknown">待商家回应</span><p>尚未提交方案。</p>' : p.requirementVersion !== snap.version ? '<span class="status unknown">待按新需求重新核对</span>' : f ? `${status(f)}<p>${esc(f.evidence || '商家尚未提供该项说明。')}</p><button class="evidence-link" data-action="evidence" data-proposal="${esc(p.id)}" data-id="${esc(r.id)}">查看依据与建议${icon('arrow', 14)}</button>` : '<span class="status unknown">旧版本没有此需求</span>'}
                        </td>`
                      })
                      .join('')}
                  </tr>`,
              )
              .join('') ||
            '<tr><td colspan="3">所有条目均已有商家回应；现场待办仍需另行确认。</td></tr>'
          }
        </tbody>
        <tfoot>
          <tr>
            <td><small>回应完整不等于现场条件已确认。</small></td>
            ${data.map((p) => html`<td><div class="button-stack flex flex-col gap-3">${btn('评估这份方案', 'assessment-open', 'secondary-button', `data-target="proposal:${esc(p.id)}" ${!p.version ? 'disabled' : ''}`)}${btn('生成问题反馈', 'feedback', 'secondary-button', `data-id="${esc(p.id)}" ${!p.version ? 'disabled' : ''}`)}${btn('查看并选择此方案', 'select-proposal', 'primary', `data-id="${esc(p.id)}" ${p.requirementVersion !== snap.version || !p.version ? 'disabled' : ''}`)}</div></td>`).join('')}
          </tr>
        </tfoot>
      </table>
    </div>
    <div class="notice">
      ${icon('info', 18)}核对只检查商家声明与已配置的需求条件。额外项目、工艺可行性和现场情况需要人工确认。${btn('下一步：空间预览', 'go-space', 'secondary-button')}
    </div>`
}
function merchantContextGuide() {
  return html`<div class="hub-root" data-variant="lucid"><details class="hub-merchant-guide"><summary>制作方案前的承接与协作检查</summary><p>围绕当前需求补充资料、承接边界和协作条件；具体回应填写在下面的对应需求中。</p><ul>${merchantDimensions.map(d => html`<li><b>${esc(d.name)}</b><p>${esc(d.question)}</p>${scales[d.id]?.evidence ? html`<p class="muted">历史协作记录（未指定商家）：${esc(scales[d.id].evidence)}</p>` : ''}</li>`).join('')}</ul></details></div>`
}
function vendor() {
  const snap = latest()
  if (!snap)
    return emptyPanel(
      '先发布需求清单',
      '商家方案需要引用一个明确的需求版本。',
      'go-requirements',
      '前往需求清单',
    )
  const p = currentProposal(vendorId)
  if (!draftItems.length)
    draftItems = clone(
      vendorDrafts[draftKey()] ??
        p?.items ??
        snap.requirements.map((r) => ({
          requirementId: r.id,
          commitment: 'unknown' as const,
          text: '',
        })),
    )
  return html`${heading('商家方案工作区', '此处模拟商家操作，内容随项目保存在此浏览器。', btn('返回方案对比', 'go-compare', 'secondary-button'))}
    <div class="document-toolbar">
      <div class="segmented">
        <button data-vendor="a" class="${vendorId === 'a' ? 'selected' : ''}">A · 木序设计</button
        ><button data-vendor="b" class="${vendorId === 'b' ? 'selected' : ''}">B · 栖居营造</button>
      </div>
      <span>下一次提交 V${(p?.version || 0) + 1} · 对应需求 R${snap.version}</span>
    </div>
    ${merchantContextGuide()}
    <div class="import-bar">
      <div>${icon('file')}<span>可编辑下面的回应，或使用 CSV 批量导入。</span></div>
      <div>
        ${btn('下载 CSV 模板', 'csv-template', 'text-button')}<label
          class="secondary-button small upload-label"
          >导入 CSV<input id="csv-upload" type="file" accept=".csv,text/csv" /></label
        >${btn('填入修订示例', 'demo-revise', 'secondary-button small')}
      </div>
    </div>
    ${state.feedback.filter((f) => f.proposalId === p?.id).length ? '<p class="notice warn">业主已对当前方案生成问题反馈，请针对下面的需求逐项修改。</p>' : ''}
    <div class="vendor-editor">
      ${snap.requirements
        .map((r) => {
          const item = draftItems.find((x) => x.requirementId === r.id)
          return html`<div class="vendor-edit-row">
            <div>
              <span class="req-id">${esc(r.id)}</span>
              <h3>${esc(r.title)}</h3>
              <p>${esc(r.description)}</p>
            </div>
            <div>
              <label class="field-label" for="commit-${r.id}">商家回应状态</label
              ><select id="commit-${r.id}" data-commit="${esc(r.id)}">
                ${[
                  ['yes', '已回应需求'],
                  ['partial', '部分回应'],
                  ['no', '目前无法满足'],
                  ['unknown', '需要补充信息'],
                ]
                  .map(
                    ([v, t]) =>
                      html`<option
                        value="${v}"
                        ${(item?.commitment || 'unknown') === v ? 'selected' : ''}
                      >
                        ${t}
                      </option>`,
                  )
                  .join('')}</select
              ><label class="field-label" for="text-${r.id}">具体做法与依据</label
              ><textarea
                id="text-${r.id}"
                data-proposal-text="${esc(r.id)}"
                maxlength="3000"
                rows="3"
                placeholder="说明具体做法，未确认的信息请明确标出。"
              >
${esc(item?.text || '')}</textarea>
            </div>
          </div>`
        })
        .join('')}
    </div>
    <div class="sticky-actions">
      <span>提交后保留旧版，重新进行规则核对。</span>${btn('提交新版并重新核对', 'submit-vendor')}
    </div>`
}
function space() {
  const r = rooms.find((r) => r.id === selectedRoom)!
  const intro = html`${heading(spaceMode === 'project' ? '在你的空间里，核对每一条需求。' : spaceMode === 'walls' ? '在当前户型中，查看墙体调整意向。' : '了解装修构成与工程示意。', spaceMode === 'project' || spaceMode === 'walls' ? '这里沿用空间选择中的户型，方便对应房间与需求。' : '此处使用独立教学示意，不是你上传的户型或商家施工方案。')}
    <div class="space-mode-switch" role="group" aria-label="空间预览方式"><button data-action="space-project" aria-pressed="${spaceMode === 'project'}">我的户型与需求</button><button data-action="space-walls" aria-pressed="${spaceMode === 'walls'}">当前户型 · 墙体调整</button><button data-action="space-engineering" aria-pressed="${spaceMode === 'engineering'}">了解装修构成</button><button data-action="space-rooms" aria-pressed="${spaceMode === 'rooms'}">房间与线路示意</button></div>`
  if (spaceMode === 'project') return intro + renderProjectSpace(planning.model(), state.dirty ? state.requirements : latest()?.requirements ?? state.requirements, selectedProjectRoom, latest()?.version, state.dirty) + `<div class="project-space-guidance"><p>对照房间核对需求后，可以返回方案对比继续选择。</p>${btn('返回方案对比', 'go-compare', 'secondary-button')}</div>`
  if (spaceMode === 'engineering') return intro + renderEngineeringSpace()
  if (spaceMode === 'walls') return intro + wallSpace.render(planning.model(), '返回我的户型')
  return html`${intro}
    <div class="space-toolbar">
      <div class="room-tabs">
        ${rooms.map((r) => html`<button data-room="${r.id}" class="${selectedRoom === r.id ? 'selected' : ''}">${r.name}</button>`).join('')}
      </div>
      <label
        >资料来源
        <select id="space-vendor">
          <option value="overview" ${spaceVendor === 'overview' ? 'selected' : ''}>
            独立户型示意
          </option>
          <option value="a" ${spaceVendor === 'a' ? 'selected' : ''}>木序设计方案</option>
          <option value="b" ${spaceVendor === 'b' ? 'selected' : ''}>栖居营造方案</option>
        </select></label
      >
    </div>
    <div class="space-layout">
      <div class="space-viewport">
        <div id="house-canvas"></div>
        <span class="canvas-badge">示意户型 · 非施工图</span>
        <div class="view-controls">
          ${btn('轴测', 'view-iso', 'secondary-button small')}${btn('俯视', 'view-top', 'secondary-button small')}${btn('隐藏墙体', 'walls', 'secondary-button small')}
        </div>
        <div class="layers">
          ${(['cold', 'hot', 'electric'] as LayerId[]).map((layer, i) => html`<label><input type="checkbox" data-layer="${layer}" checked /><i class="layer-dot ${layer}"></i>${['冷水', '热水', '电路'][i]}</label>`).join('')}
        </div>
      </div>
      <aside class="space-detail"><div id="room-detail">${roomDetail(r.name, r.area)}</div></aside>
    </div>
    <p class="end-note">
      拖动旋转 · 滚轮缩放 ·
      点击房间选择。所有布局、面积和路线均为演示数据，实际条件需要测量与专业复核。
    </p>`
}
function roomDetail(name: string, area: number) {
  const route = routes.find((r) => r.id === selectedRoute)
  const reqs = (latest()?.requirements ?? state.requirements).filter(
    (r) => r.room === '厨房' && selectedRoom === 'kitchen',
  )
  return html`<span class="project-tag">${icon('cube', 14)}空间关联</span>
    <h2>${esc(name)} <small>${area} m²</small></h2>
    ${
      spaceVendor !== 'overview'
        ? '<div class="notice warn">这家商家尚未提供空间坐标与线路资料。底图仅用于定位房间，未展示商家走线。</div>'
        : `<p>点击线路查看它关联的施工内容。</p><div class="route-list">${routes
            .filter((r) => r.roomId === selectedRoom)
            .map(
              (r) =>
                html`<button
                  data-route="${r.id}"
                  class="${r.id === selectedRoute ? 'selected' : ''}"
                >
                  <i class="layer-dot ${r.layer}"></i>${r.name}${icon('chevron', 14)}
                </button>`,
            )
            .join('')}</div>`
    }${route && spaceVendor === 'overview' ? `<div class="route-note"><h3>${esc(route.name)}</h3><p>${esc(route.from)} → ${esc(route.to)}</p><ul>${route.workItems.map((t) => html`<li>${esc(t)}</li>`).join('')}</ul><small>${esc(route.note)}</small></div>` : ''}
    <h3 class="detail-heading">这个空间的需求</h3>
    ${reqs.length ? reqs.map((req) => html`<button class="space-req" data-action="space-req" data-id="${esc(req.id)}"><span>${esc(req.id)}</span><b>${esc(req.title)}</b>${icon('arrow', 14)}</button>`).join('') : '<p class="muted">首版主要梳理厨房需求。这个房间目前提供空间示意。</p>'}`
}
function assessmentTargets() {
  return [
    ...(state.requirements.length ? [{ key: 'draft', label: state.dirty || !latest() ? '当前需求草稿' : '当前需求清单' }] : []),
    ...state.snapshots.slice().reverse().map(s => ({ key: `requirements:${s.version}`, label: `已发布需求 R${s.version}` })),
    ...state.proposals.slice().reverse().map(p => ({ key: `proposal:${p.id}`, label: `${p.vendorName} V${p.version} · 需求 R${p.requirementVersion}${p.requirementVersion !== latest()?.version || currentProposal(p.vendorId)?.id !== p.id ? '（历史）' : ''}` })),
  ]
}
function assessmentInput(key = assessmentTarget): AssessmentInput | undefined {
  const proposal = key.startsWith('proposal:') ? state.proposals.find(p => `proposal:${p.id}` === key) : undefined
  const snapshot = proposal ? state.snapshots.find(s => s.version === proposal.requirementVersion) : key.startsWith('requirements:') ? state.snapshots.find(s => `requirements:${s.version}` === key) : undefined
  if (key !== 'draft' && !snapshot) return
  const target = assessmentTargets().find(t => t.key === key)
  if (!target) return
  return { targetKey: key, targetLabel: target.label, requirementVersion: snapshot?.version ?? null, latestVersion: latest()?.version ?? null,
    requirements: snapshot?.requirements ?? state.requirements, proposal, latestProposalId: proposal ? currentProposal(proposal.vendorId)?.id : undefined, document: snapshot?.intakeDocument ?? (key === 'draft' ? state.intakeDocument : undefined),
    context: snapshot?.projectContext ?? (key === 'draft' ? projectContext() : undefined),
    contextChanged: key === 'draft' && roomContextChanged(),
    responses: proposal ? findings(proposal) : [], notes: state.assessmentNotes }
}
function runAssessment(key = assessmentTarget) {
  const input = assessmentInput(key)
  if (!input) return
  const run = evaluateAssessment(input)
  state.assessments.push(run)
  return run
}
function openAssessment(key = 'draft') {
  assessmentTarget = key
  assessmentFilter = 'all'
  navigate('assessment')
}
function assessment() {
  const targets = assessmentTargets()
  if (!targets.length) return heading('风险评估', '从需求与方案中找出需要处理的问题。') + emptyPanel('先形成一份需求清单', '完成需求共创后，即可在这里检查信息缺口与待核实事项。', 'go-clarify', '前往需求共创')
  if (!targets.some(t => t.key === assessmentTarget)) assessmentTarget = targets[0].key
  const input = assessmentInput()!
  const run = state.assessments.slice().reverse().find(r => r.targetKey === assessmentTarget) ?? runAssessment()!
  return heading('风险评估', '看清依据，处理问题，再做下一步决定。') + renderAssessment(run, {
    persistent: true,
    targets, stale: assessmentIsStale(run, input), filter: assessmentFilter,
    canSelect: !!input.proposal && input.proposal.id === input.latestProposalId && input.requirementVersion === latest()?.version,
    isDraft: assessmentTarget === 'draft',
  })
}
function requireAssessment(action: 'publish' | 'select', key: string) {
  const run = runAssessment(key)
  if (!run) return
  if (blockedIssues(run, action).length) {
    dialog.close()
    openAssessment(key)
    toast('请先处理影响此次确认的问题。')
    return
  }
  return run
}
function records() {
  return html`${heading('把每次决定，留在这里', '已发布的需求、商家修订和你的最终选择都有记录。')}${state.selection ? `<section class="selection-record"><span class="large-check">${icon('check', 27)}</span><div><h2>已选定 ${esc(state.selection.proposal.vendorName)}</h2><p>需求 R${state.selection.requirements.version} · 方案 V${state.selection.proposal.version} · ${stamp(state.selection.at)}</p><span class="status partial">${state.selection.pending.length ? '仍有 ' + state.selection.pending.length + ' 项待办' : '已记录本次选择'}</span>${latest()?.version !== state.selection.requirements.version ? '<p class="notice warn">当前需求已更新，本记录保留的是历史选择。</p>' : ''}</div>${btn('查看确认内容', 'selection-detail', 'secondary-button')}</section>` : emptyPanel('还没有选定方案', '先比较两家商家的回应，再做出适合你的选择。', 'go-compare', '前往方案对比')}
    <div class="records-grid">
      <section>
        <div class="section-title">
          <h2>需求版本</h2>
          <span>${state.snapshots.length} 个版本</span>
        </div>
        ${
          state.snapshots.length
            ? state.snapshots
                .slice()
                .reverse()
                .map(
                  (s) =>
                    html`<button
                      class="version-row"
                      data-action="version"
                      data-version="${s.version}"
                    >
                      <span class="version-icon">R${s.version}</span>
                      <div>
                        <b>${s.requirements.length} 条已发布需求</b><small>${stamp(s.at)}</small>
                      </div>
                      ${icon('chevron', 16)}
                    </button>`,
                )
                .join('')
            : '<p class="muted">发布需求后，将在这里保留只读版本。</p>'
        }
      </section>
      <section>
        <div class="section-title">
          <h2>协作动态</h2>
          <span>本地操作记录</span>
        </div>
        ${
          state.events
            .map(
              (e) =>
                html`<div class="activity-row">
                  <i></i>
                  <div>
                    <p>${esc(e.text)}</p>
                    <time>${stamp(e.at)}</time>
                  </div>
                </div>`,
            )
            .join('') || '<p class="muted">完成第一个操作后开始记录。</p>'
        }
      </section>
    </div>`
}


function render() {
  disposeWorkflowDock?.()
  disposeWorkflowDock = undefined
  disposeInsight?.()
  disposeInsight = undefined
  syncFlow()
  if (!canVisit(page, furthestUnlocked)) {
    page = projectSteps[furthestUnlocked - 1]
    history.replaceState(null, '', `#${page}`)
    toast(blockedHint())
  }
  disposeEngineering?.()
  disposeWallSpace?.()
  disposeWallSpace = undefined
  disposeEngineering = undefined
  if (page !== 'planning') { homeArrival?.dispose(); homeArrival = undefined }
  disposeHome?.()
  disposeHome = undefined
  planning.leave()
  intakeSession?.dispose()
  intakePreview?.dispose()
  intakePreview = undefined
  intakeSession = undefined
  house?.dispose()
  house = undefined
  const pages = { overview, planning: () => roomOverview() + planning.render(), clarify, requirements, compare, assessment, space, records, vendor }
  if (!(page in pages)) page = 'overview'
  app.innerHTML = shell(pages[page]())
  const workflowDock = app.querySelector<HTMLElement>('#workflow-dock')
  if (workflowDock) disposeWorkflowDock = mountWorkflowDock(workflowDock)
  const insightRoot = app.querySelector<HTMLElement>('.requirement-insight')
  if (insightRoot) disposeInsight = mountRequirementInsight(insightRoot)
  for (const button of app.querySelectorAll<HTMLButtonElement>('button[data-action^="go-"]')) {
    const destination = button.dataset.action!.slice(3)
    if (!routeAllowed(destination)) {
      button.dataset.action = 'guide-step'
      button.dataset.destination = destination
      button.title = blockedHint()
      const hint = document.createElement('small')
      hint.className = 'flow-entry-hint'
      hint.textContent = furthestUnlocked === 1 ? '先选择空间即可开始' : blockedHint()
      button.append(hint)
    }
  }
  if (page === 'overview') disposeHome = mountHomeScene(document.querySelector<HTMLElement>('.home-page')!, (keyboard, frame) => {
    homeArrival?.dispose()
    homeArrival = frame ? createHomeArrival(frame) : undefined
    homeArrivalKeyboard = keyboard
    navigate('planning')
  })
  if (page === 'planning') {
    planning.mount(document.querySelector<HTMLElement>('#room-planning')!, state.requirements)
    if (homeArrival) homeArrival.mount(document.querySelector<HTMLElement>('.planning-page')!, homeArrivalKeyboard)
    else if (homeArrivalKeyboard) {
      const heading = document.querySelector<HTMLElement>('#planning-title')!
      heading.tabIndex = -1
      heading.focus({ preventScroll: true })
    }
    homeArrivalKeyboard = false
  }
  if (page === 'clarify') {
    intakePreview = mountIntakeSpacePreview(document.querySelector<HTMLElement>('.intake-space')!, previewFrom)
    previewFrom = undefined
    const area = planningEntry
    planningEntry = undefined
    intakeSession = mountIntake(document.querySelector<HTMLElement>('#intake-root')!, {
      variant: 'lucid', questionnaire: true, externalNavigation: true, onNavigationChange: queueWorkflowUpdate, initialBrief: activeRoomWork()?.document?.brief || (state.activeRoomId ? '' : state.brief), existingCount: activeRoomWork()?.requirements.length ?? state.requirements.length,
      projectContext: contextAnswers(projectContext()),
      planningArea: area,
      storage: activeRoomWork() ? ((room: RoomWork) => ({ getItem: () => room.draft, setItem: (_key: string, value: string) => { room.draft = value; scheduleProjectSave() } }))(activeRoomWork()!) : demoIntakeStorage,
      storageStatus: projectSaveText,
      spatialModel: planning.model(),
      activeRoomId: state.activeRoomId,
      activeRoomName: activeRoomWork()?.name,
      onChooseRoom: enterRoomWork,
      onSpatialFocus: intakePreview.update,
      onFirstExpression: intakePreview.acknowledgeBrief,
      onNotice: toast,
      onAdopt: async (requirements, document) => {
        if (!requirements.length) { toast('请先确认至少一条本次需求。'); return }
        insightVersion = null
        const room = activeRoomWork()
        if (room) {
          const saved = saveRoomRequirements(state.requirements, room, requirements, document)
          state.requirements = saved.requirements
          Object.assign(room, saved.room)
          state.intakeDocument = combinedRoomDocument(state.roomWork!)
          state.brief = state.roomWork!.filter(item => item.document).map(item => `${item.name}：${item.document!.brief}`).join('\n')
          state.dirty = true
          log(`保存${room.name}需求，保留其他房间及历史版本`)
          await saveProject()
          navigate('planning')
          toast(`${room.name}已保存，可以继续其他房间或查看总清单。`)
        } else {
          state.brief = document.brief; state.requirements = clone(requirements); state.intakeDocument = clone(document); state.dirty = true
          navigate('requirements')
        }
      },
    })
    const entry = intakeEntry
    intakeEntry = null
    if (entry?.focus) intakeSession.focusExpression()
    if (entry?.appendBrief) {
      const field = document.querySelector<HTMLTextAreaElement>('#intake-brief')
      if (field && !field.value.includes(entry.appendBrief)) {
        const combined = [field.value.trim(), entry.appendBrief].filter(Boolean).join('\n')
        if (combined.length <= 4000) { field.value = combined; field.dispatchEvent(new Event('input', { bubbles: true })) }
        else toast('便签已保存；当前表达较长，请整理后补入。')
      }
    }
  }
  const navigation = document.querySelector<HTMLElement>('.studio-navigation')
  const activeNavigation = navigation?.querySelector<HTMLElement>('.nav-item.active')
  if (navigation && activeNavigation && navigation.scrollWidth > navigation.clientWidth) {
    navigation.scrollLeft =
      activeNavigation.offsetLeft -
      navigation.offsetLeft -
      navigation.clientWidth / 2 +
      activeNavigation.clientWidth / 2
  }
  if (page === 'space' && spaceMode === 'project') highlightProjectRoom(app, selectedProjectRoom)
  if (page === 'space' && spaceMode === 'walls') disposeWallSpace = wallSpace.mount(document.querySelector<HTMLElement>('.wall-explorer')!, () => { spaceMode = 'project'; render() })
  if (page === 'space' && spaceMode === 'engineering') disposeEngineering = mountEngineeringSpace(document.querySelector<HTMLElement>('.engineering')!)
  if (page === 'space' && spaceMode === 'rooms') {
    const canvas = document.querySelector<HTMLElement>('#house-canvas')!
    house = createHoloView(canvas, {
      onRoomSelect: (id) => {
        if (!id) return
        selectedRoom = id
        selectedRoute = null
        updateSpacePanel()
      },
      onRouteSelect: (id) => {
        if (page !== 'space') return
        selectedRoute = id
        const route = routes.find((r) => r.id === id)
        if (route) selectedRoom = route.roomId
        updateSpacePanel()
      },
    })
    house.selectRoom(selectedRoom)
    house.setVisibleRoutes(
      page === 'space' && spaceVendor === 'overview' ? routes.map((r) => r.id) : [],
    )
    if (page === 'space' && selectedRoute) house.selectRoute(selectedRoute)
  }
  if (page !== 'overview') lastWorkspacePage = page
  queueWorkflowUpdate()
  if (workflowPendingFocus) {
    const { selector, message } = workflowPendingFocus
    workflowPendingFocus = null
    pointWorkflow(selector, message)
  }
  scheduleProjectSave()
}
function updateSpacePanel() {
  const room = rooms.find((r) => r.id === selectedRoom)!
  document.querySelector('#room-detail')!.innerHTML = roomDetail(room.name, room.area)
  document
    .querySelectorAll('[data-room]')
    .forEach((el) =>
      el.classList.toggle('selected', (el as HTMLElement).dataset.room === selectedRoom),
    )
}
function showDialog(title: string, body: string, footer = '') {
  dialog.innerHTML = `<div class="dialog-heading flex items-center justify-between gap-4"><h2>${title}</h2><button class="icon-button" data-action="close-dialog" aria-label="关闭">${icon('close')}</button></div><div class="dialog-body">${body}</div>${footer ? `<div class="dialog-footer flex flex-wrap justify-end gap-3">${footer}</div>` : ''}`
  dialog.showModal()
}
dialog.addEventListener('click', (e) => {
  if (e.target === dialog) dialog.close()
})
function showAdoptedIntake() {
  if (state.roomWork?.length) { navigate('planning'); toast('请选择房间查看或继续对应的共创记录。'); return }
  if (!state.intakeDocument) return
  showDialog('已采用的需求共创文档', adoptedIntakeHtml(state.intakeDocument), btn('继续当前访谈', 'continue-intake', 'secondary-button') + btn('用此文档替换访谈草稿', 'restore-adopted-intake'))
}
function requirementForm(id?: string) {
  const req = state.requirements.find((r) => r.id === id)
  showDialog(
    req ? '编辑需求' : '补充一条需求',
    `<form id="requirement-form" data-id="${esc(id || '')}"><label class="field-label" for="req-title">需求名称</label><input id="req-title" name="title" required maxlength="60" value="${esc(req?.title || '')}"/><label class="field-label" for="req-description">可核对的描述</label><textarea id="req-description" name="description" rows="4" required maxlength="1000">${esc(req?.description || '')}</textarea><p class="muted">${req ? '编辑后需要重新发布需求，新版将保留历史版本。' : '自定义需求将标记为需人工复核，规则不会擅自判断其专业可行性。'}</p><button type="submit" class="primary">保存到需求草稿</button></form>`,
  )
}
function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function previewProjectReport() {
  dialog.close()
  const frame = document.createElement('iframe')
  frame.className = 'project-report-frame'
  frame.title = '项目沟通报告'
  frame.setAttribute('sandbox', 'allow-same-origin allow-modals')
  frame.srcdoc = renderProjectReport({
    projectName: '我的第一个家', scope: [...new Set(state.requirements.map(req => req.room))].join('、') || projectScope(), generatedAt: now(),
    roomGroups: state.roomWork?.map(room => ({ id: room.id, name: room.name, requirementIds: room.requirements.map(req => req.id), hasDraftChanges: !!room.draft && room.draft !== room.savedDraft })),
    requirements: state.requirements, requirementVersion: latest()?.version ?? null,
    proposals: state.proposals, snapshots: state.snapshots, dirty: state.dirty,
    brief: state.brief, projectContext: projectContext(), floorplanModel: planning.model(),
    selectedRoomId: selectedProjectRoom === 'all' ? null : selectedProjectRoom,
    selection: state.selection, assessments: state.assessments, events: state.events,
  })
  const oldOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  const closeReport = () => { frame.remove(); document.body.style.overflow = oldOverflow; document.querySelector<HTMLElement>('[data-action="export"]')?.focus() }
  frame.addEventListener('load', () => {
    const report = frame.contentDocument
    if (!report) return
    const close = report.createElement('button')
    close.type = 'button'; close.textContent = '返回项目'; close.dataset.reportClose = ''
    close.addEventListener('click', closeReport)
    report.querySelector('.report-toolbar')?.prepend(close)
    report.querySelector('[data-report-print]')?.addEventListener('click', () => { frame.contentWindow?.focus(); frame.contentWindow?.print() })
    report.addEventListener('keydown', event => { if (event.key === 'Escape') closeReport() })
    close.focus()
  })
  document.body.append(frame)
}
function showProposalSelection(p: Proposal) {
      const pending = selectionPending(p)
      showDialog(
        '查看选择与剩余待办',
        `<p>你准备选定 <b>${esc(p.vendorName)} V${p.version}</b>，对应需求 R${p.requirementVersion}。</p><h3>保留在确认记录中的待办</h3><ul>${pending.map((t) => html`<li>${esc(t)}</li>`).join('') || '<li>本轮规则检查无未决项，现场实施仍需专业确认。</li>'}</ul><p class="muted">本次选择不会把待办标记为已解决，也不代表施工验收。</p>`,
        btn('暂不选择', 'close-dialog', 'secondary-button') + btn('先查看风险评估', 'assessment-dialog', 'secondary-button', `data-id="${esc(p.id)}"`) +
          btn('确认选定并保留待办', 'confirm-selection', 'primary', `data-id="${esc(p.id)}"`),
      )
}
function selectionPending(p: Proposal) {
  const s = state.snapshots.find((s) => s.version === p.requirementVersion)!
  return [
    ...findings(p)
      .filter((f) => f.status !== 'responded')
      .map((f) => `${f.requirementId}：${f.reason}`),
    ...s.requirements
      .filter((r) => r.pending.length)
      .map((r) => `${r.id}：${r.pending.join('、')}`),
  ]
}
document.addEventListener('click', async (e) => {
  const anchor = (e.target as Element).closest<HTMLAnchorElement>('a[href^="#"]')
  const destination = anchor?.getAttribute('href')?.slice(1)
  if (destination && (projectSteps.includes(destination as ProjectStep) || destination === 'vendor' || destination === 'assessment') && !routeAllowed(destination)) { e.preventDefault(); toast(blockedHint()); return }
  const target = (e.target as HTMLElement).closest<HTMLElement>('button,a[data-action]')
  if (!target) return
  const action = target.dataset.action
  if (target.dataset.projectRoom) {
    selectedProjectRoom = target.dataset.projectRoom
    render()
    document.querySelector<HTMLElement>(`[data-project-room="${CSS.escape(selectedProjectRoom)}"]`)?.focus({ preventScroll: true })
    return
  }
  if (target.dataset.assessmentFilter) {
    assessmentFilter = target.dataset.assessmentFilter as Dimension | 'all'
    render()
    document.querySelector<HTMLElement>('#assessment-issues')?.focus({ preventScroll: true })
    return
  }
  if (target.dataset.filter) {
    filter = target.dataset.filter
    render()
    return
  }
  if (target.dataset.vendor) {
    vendorId = target.dataset.vendor as 'a' | 'b'
    draftItems = []
    render()
    return
  }
  if (target.dataset.room) {
    selectedRoom = target.dataset.room
    selectedRoute = null
    house?.selectRoom(selectedRoom)
    house?.selectRoute(null)
    if (page === 'space') updateSpacePanel()
    return
  }
  if (target.dataset.route) {
    selectedRoute = target.dataset.route
    house?.selectRoute(selectedRoute)
    updateSpacePanel()
    return
  }
  if (!action) return
  if (action.startsWith('go-')) {
    if (dialog.open) dialog.close()
    draftItems = []
    navigate(action.slice(3) as Page)
    return
  }
  const id = target.dataset.id
  switch (action) {
    case 'room-work-open': {
      const room = planning.model().rooms.find(room => room.id === id) || state.roomWork?.find(room => room.id === id)
      enterRoomWork(id!, room?.name || '全屋与公共需求'); break
    }
    case 'workflow-next': await advanceWorkflow(); break
    case 'workflow-back': previousWorkflow(); break
    case 'resume-project': navigate(resumePage()); break
    case 'guide-step': {
      const requested = target.dataset.destination as Page
      if (routeAllowed(requested)) { navigate(requested); break }
      const next = projectSteps[furthestUnlocked - 1]
      toast(`${navs.find(item => item[0] === requested)?.[1] || '此功能'}将在完成前面的步骤后开放，先继续${navs.find(item => item[0] === next)?.[1]}。`)
      navigate(next)
      break
    }
    case 'comparison-focus': {
      filter = 'all'; render()
      const row = document.querySelector<HTMLElement>(`[data-comparison-row="${CSS.escape(id || '')}"]`)
      row?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
      row?.focus({ preventScroll: true })
      break
    }
    case 'project-space-need': {
      const req = (state.dirty ? state.requirements : latest()?.requirements ?? state.requirements).find(item => item.id === id)
      if (req) showDialog(`${esc(req.id)} · ${esc(req.title)}`, `<p>${esc(req.description)}</p><p>关联空间：${esc(req.intake?.areas.join('、') || req.room)}</p><p>待确认：${esc(req.pending.join('；') || '未记录')}</p>`, btn('返回需求清单', 'go-requirements', 'secondary-button') + btn('关闭', 'close-dialog'))
      break
    }
    case 'retry-project': await initializeProject(); break
    case 'save-project': await saveProject(); break
    case 'export-recovery':
      try { download('安居有数原始草稿备份.json', JSON.stringify(await projectStore.readRaw(), null, 2), 'application/json') }
      catch { toast('暂时无法读取原记录，请检查浏览器存储设置后重试。') }
      break
    case 'insight-open': {
      const snapshot = latest()
      if (snapshot) void startRequirementInsight(snapshot)
      break
    }
    case 'insight-retry': {
      const snapshot = state.snapshots.find(item => item.version === insightVersion)
      if (snapshot) void startRequirementInsight(snapshot)
      break
    }
    case 'insight-back':
      insightVersion = null; render()
      document.querySelector<HTMLElement>('[data-action="insight-open"]')?.focus()
      break
    case 'insight-continue':
      insightVersion = null; navigate('compare')
      break
    case 'assessment-dialog': dialog.close(); openAssessment(`proposal:${id}`); break
    case 'assessment-open': openAssessment(target.dataset.target || 'draft'); break
    case 'assessment-first':
      e.preventDefault(); assessmentFilter = 'all'; render(); document.querySelector<HTMLElement>('#assessment-issues')?.focus(); break
    case 'assessment-run':
      runAssessment(); log('重新评估当前需求与方案，保留原评估记录'); render(); toast('评估已更新。'); break
    case 'assessment-export': {
      const input = assessmentInput()
      const run = state.assessments.slice().reverse().find(r => r.targetKey === assessmentTarget)
      if (!input || !run) break
      download('安居有数风险评估.json', JSON.stringify({ exportedAt: now(), stale: assessmentIsStale(run, input), assessment: run }, null, 2), 'application/json')
      break
    }
    case 'assessment-select': {
      const input = assessmentInput()
      if (!input?.proposal) break
      const proposal = state.proposals.find(p => p.id === input.proposal!.id)
      if (proposal) showProposalSelection(proposal)
      break
    }
    case 'assessment-source':
    case 'assessment-edit': {
      const input = assessmentInput()
      const run = state.assessments.slice().reverse().find(r => r.targetKey === assessmentTarget)
      const issue = run?.issues.find(i => i.id === id)
      if (!input || !run || !issue) break
      const req = input.requirements.find(r => issue.requirementIds.includes(r.id))
      if (action === 'assessment-source') {
        showDialog(req ? `${esc(req.id)} · ${esc(req.title)}` : '本次评估的项目资料', `<p>${esc(input.targetLabel)}</p><p>${esc(req?.description || JSON.stringify(input.context || {}))}</p><p class="muted">此处为评估所引用的原文。修改请回到对应需求或商家方案。</p>`, btn('关闭', 'close-dialog'))
      } else if (input.proposal) {
        const proposal = state.proposals.find(p => p.id === input.proposal!.id)!
        vendorId = proposal.vendorId; draftItems = []; navigate('vendor')
        requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>(`[data-proposal-text="${CSS.escape(req?.id || '')}"]`)?.focus())
      } else if (req?.intake || !req || input.targetKey !== 'draft') {
        if (input.targetKey !== 'draft') toast('历史版本保持不变，请在当前需求中创建修订。')
        navigate('requirements')
        if (req?.intake) { intakeEntry = { focus: true }; navigate('clarify') }
      } else requirementForm(req.id)
      break
    }
    case 'scroll-comparison': e.preventDefault(); document.querySelector('#proposal-comparison')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); break
    case 'space-project':
    case 'space-engineering':
    case 'space-rooms':
    case 'space-walls':
      spaceMode = action === 'space-project' ? 'project' : action === 'space-engineering' ? 'engineering' : action === 'space-walls' ? 'walls' : 'rooms'
      render()
      break
    case 'plan-current-room':
    case 'plan-whole-home':
      previewFrom = captureFloorplanHandoff()
      enterRoomWork(action === 'plan-current-room' ? planning.selectedRoom()!.id : 'whole-home', action === 'plan-current-room' ? planning.selectedRoom()!.name : '全屋与公共需求')
      break
    case 'close-dialog':
      dialog.close()
      break
    case 'about':
      showDialog(
        '关于安居有数',
        `<p lang="en">Dream Defined. Living Refined.</p><p>支持多区域 AI 需求共创、清单确认与版本发布；商家提交、核对和选择保留演示流程。</p><dl class="about-list"><dt>数据保存</dt><dd>需求、访谈、户型和墙体标注自动保存在此浏览器。使用同一地址重新打开即可继续；不会同步到其他设备，清除浏览器数据会删除草稿。可导出报告与完整项目备份。</dd><dt>AI 接入</dt><dd>需求共创已接入 AI，上传户型图会发送至 AI 识别。商家方案仍为演示，不会发送给真实商家。</dd><dt>空间模型</dt><dd>默认关联当前项目户型与需求；工程构成与线路是独立教学示意，不能用作施工图。</dd></dl>`,
        btn('清除本机草稿', 'reset', 'text-button'),
      )
      break
    case 'sample-brief':
      state.brief = '厨房想好打理，电器够用，希望加洗碗机，保留现有布局和窗户，不要开放展示格。'
      render()
      break
    case 'start-questions':
      if (!state.brief.trim()) {
        toast('先写一句你的装修想法。')
        document.querySelector<HTMLTextAreaElement>('#brief')?.focus()
        break
      }
      state.question = 0
      render()
      break
    case 'previous':
      state.question = Math.max(-1, state.question - 1)
      render()
      break
    case 'next-question': {
      const q = questions[state.question]
      const answer = state.answers[q.key]
      if (!answer.length) {
        toast('选择一项，或选择暂不确定。')
        break
      }
      if (state.question < 4) {
        state.question++
        render()
      } else {
        const build = () => {
          state.requirements = buildRequirements(state.brief, state.answers)
          state.dirty = true
          log('根据选择题生成了需求草稿')
          navigate('requirements')
        }
        if (state.requirements.length)
          showDialog(
            '重新生成需求草稿',
            `<p>新的选择会替换当前可编辑草稿。已发布的历史需求版本会保留。</p>`,
            btn('保留现有草稿', 'close-dialog', 'secondary-button') + btn('重新生成', 'regenerate'),
          )
        else build()
      }
      break
    }
    case 'regenerate':
      dialog.close()
      state.requirements = buildRequirements(state.brief, state.answers)
      state.dirty = true
      log('重新生成需求草稿')
      navigate('requirements')
      break
    case 'demo':
      if (hasProjectDraft())
        showDialog(
          '载入完整演示',
          `<p>这会替换当前本机项目。你可以先导出项目留存。</p>`,
          btn('取消', 'close-dialog', 'secondary-button') + btn('载入演示', 'confirm-demo'),
        )
      else demo()
      break
    case 'confirm-demo':
      dialog.close()
      demo()
      break
    case 'reset':
      showDialog(
        '清除本机项目草稿',
        `<p>将清除此浏览器保存的需求、访谈、户型图片、墙体标注、方案和确认记录。清除后无法恢复，建议先导出完整项目。</p>`,
        btn('取消', 'close-dialog', 'secondary-button') +
          btn('确认重置', 'confirm-reset', 'danger'),
      )
      break
    case 'confirm-reset':
      projectReady = false; clearTimeout(saveTimer)
      try { await projectStore.clear() } catch { projectReady = !recoveryError; toast('清除失败，原草稿保持不变。'); break }
      cancelInsightJobs()
      workflowChoosingProposal = false
      planning.reset()
      intakeDraft = null
      state = empty()
      planningChosen = false; furthestUnlocked = 1; samplePreview = null
      vendorDrafts = {}
      scales = {}
      currentArea = null; lastWorkspacePage = 'planning'; selectedProjectRoom = 'all'; spaceMode = 'project'; vendorId = 'a'; draftItems = []
      recoveryError = ''; lastSavedFingerprint = ''; hasUnsavedChanges = false; projectReady = true
      dialog.close()
      navigate('overview')
      toast('本机草稿已清除，可以开始新的项目。')
      break
    case 'hub-locate': {
      const row = document.querySelector<HTMLElement>(`[data-requirement-id="${CSS.escape(id || '')}"]`)
      if (row) { row.setAttribute('tabindex', '-1'); row.scrollIntoView({ block: 'center', behavior: 'smooth' }); row.focus({ preventScroll: true }) }
      break
    }
    case 'add-requirement':
      if (state.roomWork?.length) { navigateWithWorkflowHint('planning', '.room-work-overview', '请选择要补充需求的房间，或选择全屋与公共需求。'); break }
      if (state.intakeDocument) { intakeEntry = { focus: true }; navigate('clarify'); break }
      requirementForm()
      break
    case 'edit-requirement':
      { const owner = state.roomWork?.find(room => room.requirements.some(req => req.id === id)); if (owner) { enterRoomWork(owner.id, owner.name); break } }
      if (state.requirements.find(r => r.id === id)?.intake && state.intakeDocument) { showAdoptedIntake(); break }
      requirementForm(id)
      break
    case 'view-adopted-intake':
      showAdoptedIntake()
      break
    case 'restore-adopted-intake':
      if (state.intakeDocument) {
        intakeDraft = JSON.stringify(stateFromAdoptedIntake(state.intakeDocument))
        dialog.close()
        navigate('clarify')
        toast('已复制已采用文档作为访谈草稿，重新修改并确认后再采用。')
      }
      break
    case 'continue-intake':
      dialog.close()
      navigate('clarify')
      break
    case 'publish':
      if (roomContextChanged()) { toast('项目背景已改变，请先重新整理并采用草稿。'); navigate('clarify'); break }
      showDialog(
        '确认发布需求',
        `<p>将发布 <b>R${(latest()?.version || 0) + 1}</b>，共 ${state.requirements.length} 条需求。商家将以这个版本制作方案。</p><p>本次只提交各房间已经保存的需求；进行中的访谈和修改仍保留在对应房间。</p><h3>仍需确认</h3><ul>${state.requirements.flatMap((r) => r.pending.map((p) => html`<li>${esc(r.id)} · ${esc(p)}</li>`)).join('') || '<li>当前没有记录待确认事项。</li>'}</ul><p class="muted">这些待办不会因发布而自动消失。历史版本保持不变。</p>`,
        btn('继续编辑', 'close-dialog', 'secondary-button') + btn('确认并发布', 'confirm-publish'),
      )
      break
    case 'confirm-publish': {
      if (!state.requirements.length || (!state.dirty && latest())) { dialog.close(); break }
      if (roomContextChanged()) { dialog.close(); toast('项目背景已改变，请先重新整理并采用草稿。'); navigate('clarify'); break }
      const assessment = requireAssessment('publish', 'draft')
      if (!assessment) break
      const version = (latest()?.version || 0) + 1
      state.snapshots.push({ version, requirements: clone(state.requirements), at: now(), assessment: clone(assessment), projectContext: clone(projectContext()), ...(state.intakeDocument ? { intakeDocument: clone(state.intakeDocument) } : {}) })
      state.assessmentNotes.push(...assessment.notes.map(note => ({ ...clone(note), targetKey: `requirements:${version}` })))
      latest()!.assessment = clone(runAssessment(`requirements:${version}`)!)
      state.dirty = false
      log(`发布需求 R${version}，共 ${state.requirements.length} 条`)
      dialog.close()
      samplePreview = null
      void startRequirementInsight(latest()!)
      toast(`需求 R${version} 已提交，Flash 正在进一步分析`)
      break
    }
    case 'show-sample': {
      const snapshot = latest()
      if (!snapshot || !['a', 'b'].includes(id || '')) break
      const sampleId = id as 'a' | 'b'
      const existing = currentProposal(sampleId)
      if (!existing || existing.requirementVersion !== snapshot.version) {
        state.proposals.push(createSampleProposal(snapshot.requirements, snapshot.version, sampleId, existing))
        log(`查看${sampleId === 'a' ? '木序设计' : '栖居营造'}的预制演示方案（R${snapshot.version}）`)
      }
      samplePreview = sampleId
      render()
      const detail = document.querySelector<HTMLElement>('#sample-proposal-detail')
      detail?.focus({ preventScroll: true })
      detail?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
      break
    }
    case 'seed': {
      const snapshot = latest()
      if (!snapshot) break
      for (const vendor of ['a', 'b'] as const) {
        const previous = currentProposal(vendor)
        if (!previous || previous.requirementVersion !== snapshot.version) state.proposals.push(createSampleProposal(snapshot.requirements, snapshot.version, vendor, previous))
      }
      log('查看两家预制演示方案')
      render()
      break
    }
    case 'history':
      showDialog(
        '需求与方案版本',
        `<h3>需求版本</h3>${state.snapshots.map((s) => html`<p>R${s.version} · ${s.requirements.length} 条需求 · ${stamp(s.at)}</p>`).join('')}<h3>商家方案</h3>${state.proposals.map((p) => html`<p>${esc(p.vendorName)} · V${p.version} / R${p.requirementVersion} <button class="text-button" data-action="proposal-history" data-id="${esc(p.id)}">查看原文</button></p>`).join('') || '<p>尚无方案。</p>'}`,
      )
      break
    case 'proposal-history': {
      const p = state.proposals.find((p) => p.id === id)!
      dialog.close()
      showDialog(
        `${esc(p.vendorName)} V${p.version}`,
        p.items
          .map(
            (i) =>
              html`<h3>${esc(i.requirementId)}</h3>
                <p>${esc(i.text)}</p>`,
          )
          .join(''),
      )
      break
    }
    case 'version': {
      const s = state.snapshots.find((s) => s.version === Number(target.dataset.version))!
      showDialog(
        `已发布需求 R${s.version}`,
        s.requirements
          .map(
            (r) =>
              html`<h3>${esc(r.id)} · ${esc(r.title)}</h3>
                <p>${esc(r.description)}</p>`,
          )
          .join('') + (s.assessment ? renderAssessmentArchive(s.assessment) : '<p>此历史版本未保存风险评估。</p>'),
      )
      break
    }
    case 'evidence': {
      const p = state.proposals.find((p) => p.id === target.dataset.proposal)
      if (!p) {
        toast('这家商家尚未提交方案，暂无可查看的证据。')
        break
      }
      const r = state.snapshots
        .find((s) => s.version === p.requirementVersion)
        ?.requirements.find((r) => r.id === id)
      const f = findings(p).find((f) => f.requirementId === id)
      if (!r || !f) {
        toast('该条证据的需求版本不存在，请重新核对方案。')
        break
      }
      showDialog(
        `${esc(r.id)} · ${esc(r.title)}`,
        `${status(f)}<h3>你的需求</h3><p>${esc(r.description)}</p><h3>商家原文</h3><blockquote>${esc(f.evidence || '没有对应说明')}</blockquote><small>来源：${esc(p.vendorName)} / V${p.version} / ${esc(r.id)} 条目</small><h3>规则核对结果</h3><p>${esc(f.reason)}</p><h3>建议下一步</h3><p>${esc(f.action)}</p>${r.pending.length ? `<p class="notice warn">现场待确认：${esc(r.pending.join('、'))}</p>` : ''}`,
      )
      break
    }
    case 'feedback': {
      const p = state.proposals.find((p) => p.id === id)!
      const f = findings(p).filter((f) => f.status !== 'responded')
      showDialog(
        '给商家的问题清单',
        f.length
          ? `<p>发送到本机模拟商家工作区，不会向外部企业发送消息。</p><ul>${f.map((x) => html`<li><b>${esc(x.requirementId)}</b> ${esc(x.action)}</li>`).join('')}</ul>`
          : '<p>当前规则检查没有待修订项。现场待办仍需核实。</p>',
        f.length
          ? btn('确认反馈到演示工作区', 'confirm-feedback', 'primary', `data-id="${esc(p.id)}"`)
          : btn('返回', 'close-dialog'),
      )
      break
    }
    case 'confirm-feedback': {
      const p = state.proposals.find((p) => p.id === id)!
      if (!state.feedback.some((x) => x.proposalId === p.id)) {
        state.feedback.push({
          id: localRecordId(),
          proposalId: p.id,
          version: p.version,
          items: findings(p)
            .filter((f) => f.status !== 'responded')
            .map((f) => f.requirementId),
          at: now(),
        })
        log(`向 ${p.vendorName} V${p.version} 生成了问题反馈（模拟）`)
      }
      dialog.close()
      toast('反馈已记录，可进入商家工作区修改')
      render()
      break
    }
    case 'demo-revise': {
      const p =
        currentProposal(vendorId) ??
        seedProposals(latest()!.requirements, latest()!.version).find(
          (p) => p.vendorId === vendorId,
        )!
      draftItems = reviseDemoProposal(p, latest()!.requirements).items
      persistVendorDraft()
      render()
      toast('已填入修订示例，请检查后提交。')
      break
    }
    case 'csv-template':
      download(
        '安居有数商家方案模板.csv',
        '\uFEFF' +
          proposalCsv(
            latest()!.requirements.map((r) => ({
              requirementId: r.id,
              commitment: 'unknown',
              text: '',
            })),
          ),
        'text/csv;charset=utf-8',
      )
      break
    case 'submit-vendor': {
      const snap = latest()!
      const items = snap.requirements.map(
        (r) =>
          draftItems.find((i) => i.requirementId === r.id) ?? {
            requirementId: r.id,
            commitment: 'unknown' as const,
            text: '',
          },
      )
      if (items.every((i) => !i.text.trim())) {
        toast('请至少填写一项具体做法。')
        break
      }
      if (items.some((i) => i.commitment === 'yes' && !i.text.trim())) {
        toast('标记为已回应的条目必须有具体说明。')
        break
      }
      const prior = currentProposal(vendorId)
      const p: Proposal = {
        id: localRecordId(),
        vendorId,
        vendorName: vendorId === 'a' ? '木序设计' : '栖居营造',
        version: (prior?.version || 0) + 1,
        requirementVersion: snap.version,
        items: clone(items),
        createdAt: now(),
      }
      state.proposals.push(p)
      persistVendorDraft()
      log(`${p.vendorName} 提交 V${p.version}，按需求 R${snap.version} 重新核对`)
      draftItems = []
      navigate('compare')
      toast('新版已提交，旧版本已保留')
      break
    }
    case 'select-proposal': {
      const p = state.proposals.find(p => p.id === id)
      if (p) showProposalSelection(p)
      break
    }
    case 'confirm-selection': {
      const p = state.proposals.find((p) => p.id === id)!
      if (p.requirementVersion !== latest()?.version) {
        toast('需求版本已变更，请重新核对。')
        break
      }
      const assessment = requireAssessment('select', `proposal:${p.id}`)
      if (!assessment) break
      state.selection = {
        assessment: clone(assessment),
        proposal: clone(p),
        requirements: clone(latest()!),
        at: now(),
        pending: selectionPending(p),
      }
      log(`选定 ${p.vendorName} V${p.version}，保留未决事项`)
      dialog.close()
      navigate('records')
      break
    }
    case 'selection-detail': {
      const s = state.selection!
      showDialog(
        '本次选择记录',
        `<p>${esc(s.proposal.vendorName)} · V${s.proposal.version} · R${s.requirements.version}</p><ul>${s.pending.map((p) => html`<li>${esc(p)}</li>`).join('') || '<li>没有记录待办</li>'}</ul><p>${stamp(s.at)}</p>${s.assessment ? renderAssessmentArchive(s.assessment) : '<p>此历史记录未保存风险评估。</p>'}`,
      )
      break
    }
    case 'space-req': {
      const req = (latest()?.requirements ?? state.requirements).find((r) => r.id === id)!
      const routeId = id === 'K03' ? 'electric-kitchen' : id === 'K02' ? 'cold-kitchen' : null
      if (page === 'space' && spaceVendor === 'overview' && routeId) {
        selectedRoute = routeId
        house?.selectRoute(routeId)
        updateSpacePanel()
      }
      showDialog(
        `${esc(req.id)} · ${esc(req.title)}`,
        `<p>${esc(req.description)}</p><p class="notice">${page === 'space' && spaceVendor === 'overview' && routeId ? '已高亮相关类别的示意支路；该路线不是商家提供的施工路线。' : '此条需求关联厨房区域，具体点位和管线可在空间工作区查看。'}</p><p>待确认：${esc(req.pending.join('、') || '未记录')}</p>`,
      )
      break
    }
    case 'view-iso':
      house?.setView('iso')
      break
    case 'view-top':
      house?.setView('top')
      break
    case 'walls': {
      const hidden = target.textContent === '隐藏墙体'
      house?.setWallMode(hidden ? 'hidden' : 'cutaway')
      target.textContent = hidden ? '显示墙体' : '隐藏墙体'
      break
    }
    case 'export-scales':
      download(
        '安居有数历史维度记录.json',
        JSON.stringify(
          {
            archiveOnly: true,
            scale: '历史量表原始分值，仅用于追溯',
            ownerDimensions,
            merchantDimensions,
            dimensionBridges,
            answers: scales,
          },
          null,
          2,
        ),
        'application/json',
      )
      toast('历史维度填写已导出。')
      break
    case 'export':
      showDialog('导出与保存项目', `<div class="report-options"><div><p>将户型、需求、方案差异和待确认事项整理成可读报告，方便与家人或设计师讨论。</p>${btn('预览报告 / 保存为 PDF', 'report-preview')}</div><div><p>完整项目备份包含访谈草稿、上传图纸、墙体标注与历史记录。</p>${btn('下载完整项目 JSON', 'export-json', 'secondary-button')}</div><p data-project-save>${esc(projectSaveText())}</p></div>`, btn('重试保存', 'save-project', 'text-button') + btn('清除本机草稿', 'reset', 'text-button'))
      break
    case 'report-preview': previewProjectReport(); break
    case 'export-json':
      download(
        '安居有数项目记录.json',
        JSON.stringify(
          {
            exportedAt: now(),
            mode: 'ai-intake-local-project',
            ...state,
            projectContext: projectContext(),
            dimensionScales: scales,
            vendorDrafts,
            intakeDraft: intakeDraft ? JSON.parse(intakeDraft) : null,
            planning: planning.snapshot(),
            progress: { planningChosen, furthestUnlocked, currentArea, lastWorkspacePage },
          },
          null,
          2,
        ),
        'application/json',
      )
      toast('完整项目已导出，包含户型、访谈和历史记录。')
      break
  }
})
document.addEventListener('input', (e) => {
  const input = e.target as HTMLInputElement
  if (input.dataset.contextText) {
    const field = input.dataset.contextText
    const checkbox = document.querySelector<HTMLInputElement>(`[data-context-confirm="${field}"]`)
    if (checkbox) { checkbox.disabled = !input.value.trim(); checkbox.checked = false }
    const status = document.querySelector<HTMLElement>(`[data-context-state="${field}"]`)
    if (status) { status.textContent = '修改待保存'; status.classList.remove('hub-state--confirmed') }
  }
  if (input.id === 'brief') {
    state.brief = input.value
  }
  if (input.dataset.proposalText) {
    const item = draftItems.find((i) => i.requirementId === input.dataset.proposalText)
    if (item) item.text = input.value
    else
      draftItems.push({
        requirementId: input.dataset.proposalText,
        commitment: 'unknown',
        text: input.value,
      })
    persistVendorDraft()
  }
})
document.addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement
  if (input.id === 'assessment-target') { assessmentTarget = input.value; assessmentFilter = 'all'; render(); return }
  if (input.name === 'answer') {
    const q = questions[state.question]
    if (q.multi) {
      let values = [...state.answers.devices]
      values = input.checked
        ? [...values.filter((v) => v !== input.value), input.value]
        : values.filter((v) => v !== input.value)
      if (input.value === '暂不确定' && input.checked) values = ['暂不确定']
      else values = values.filter((v) => v !== '暂不确定')
      state.answers.devices = values
    } else (state.answers[q.key] as string) = input.value
    render()
  }
  if (input.dataset.priority) {
    const r = state.requirements.find((r) => r.id === input.dataset.priority)!
    r.priority = input.value as 'must' | 'prefer'
    state.dirty = true
    render()
  }
  if (input.dataset.commit) {
    const item = draftItems.find((i) => i.requirementId === input.dataset.commit)
    if (item) item.commitment = input.value as ProposalItem['commitment']
    else
      draftItems.push({
        requirementId: input.dataset.commit,
        commitment: input.value as ProposalItem['commitment'],
        text: '',
      })
    persistVendorDraft()
  }
  if (input.dataset.layer) house?.setLayer(input.dataset.layer as LayerId, input.checked)
  if (input.id === 'space-vendor') {
    spaceVendor = input.value
    selectedRoute = null
    house?.setVisibleRoutes(spaceVendor === 'overview' ? routes.map((r) => r.id) : [])
    updateSpacePanel()
  }
  if (input.id === 'csv-upload') {
    const file = input.files?.[0]
    if (!file) return
    if (file.size > 1024 * 1024) {
      toast('CSV 最大支持 1 MB，请减少文件内容。')
      input.value = ''
      return
    }
    try {
      draftItems = parseProposalCsv(await file.text(), latest()!.requirements)
      persistVendorDraft()
      render()
      toast('CSV 已导入草稿，请检查后提交。')
    } catch (err) {
      toast(err instanceof Error ? err.message : '无法读取 CSV 文件')
      input.value = ''
    }
  }
})
document.addEventListener('submit', (e) => {
  const form = e.target as HTMLFormElement
  if (form.dataset.assessmentNote) {
    e.preventDefault()
    const input = assessmentInput()
    const run = state.assessments.slice().reverse().find(r => r.targetKey === assessmentTarget)
    const issue = run?.issues.find(i => i.id === form.dataset.assessmentNote)
    if (!input || !run || !issue || assessmentIsStale(run, input)) { toast('资料已变化，请先重新评估。'); return }
    const data = new FormData(form)
    const text = String(data.get('note') || '').trim()
    const owner = String(data.get('owner') || '')
    if (!text || text.length > 1200 || !assessmentOwners.includes(owner)) { toast('请选择责任人，并填写 1–1200 字的资料或安排。'); return }
    state.assessmentNotes = state.assessmentNotes.filter(n => !(n.targetKey === assessmentTarget && n.issueId === issue.id))
    state.assessmentNotes.push({ targetKey: assessmentTarget, issueId: issue.id, fingerprint: issue.fingerprint, owner, text, at: now() })
    runAssessment(); log(`记录评估事项的处理安排：${issue.title}`); render()
    const row = document.getElementById(`risk-${issue.id}`)
    row?.setAttribute('tabindex', '-1'); row?.focus({ preventScroll: true })
    toast('安排已保存，核验状态仍保留。')
    return
  }
  if (form.id === 'project-context-form') {
    e.preventDefault()
    const values = new FormData(form)
    const next = initializeProjectContext(undefined, {})
    for (const field of ['household', 'schedule', 'confirmation'] as const) {
      const text = String(values.get(field) || '').trim()
      if (text.length > 1200) { toast('每项项目背景最多 1200 字。'); return }
      next[field] = { text, confirmed: Boolean(text && values.get('confirm-' + field)) }
    }
    state.projectContext = next
    state.dirty = true
    log('保存项目背景，后续 AI 共创将使用同一份信息')
    render()
    const context = document.querySelector<HTMLDetailsElement>('.hub-context')
    if (context) context.open = true
    toast('项目背景已保存，下一轮 AI 共创会带入。')
    return
  }
  if (form.id !== 'requirement-form') return
  e.preventDefault()
  const data = new FormData(form)
  const title = String(data.get('title')).trim(),
    description = String(data.get('description')).trim()
  if (!title || !description) {
    toast('请填写需求名称和具体描述。')
    return
  }
  const req = state.requirements.find((r) => r.id === form.dataset.id)
  if (req) {
    req.title = title
    req.description = description
  } else
    state.requirements.push({
      id: 'U' + String(Date.now()).slice(-7),
      title,
      description,
      room: '厨房',
      category: '个性补充',
      priority: 'must',
      source: '用户手动补充',
      pending: ['需要商家与用户人工复核'],
    })
  state.dirty = true
  log('编辑了需求草稿，等待确认发布')
  dialog.close()
  render()
})
function demo() {
  cancelInsightJobs()
  workflowChoosingProposal = false
  intakeDraft = null
  state = empty()
  scales = {}
  vendorDrafts = {}
  planning.reset()
  planningChosen = true; currentArea = '厨房'; selectedProjectRoom = 'kitchen'; spaceMode = 'project'; furthestUnlocked = 1
  state.brief = '厨房想好打理，电器够用，增加洗碗机，保留布局和窗户，不要开放展示格。'
  state.answers = {
    layout: '保留现有布局',
    devices: ['洗碗机', '电饭煲', '咖啡机'],
    cleaning: '容易擦拭、减少接缝',
    cabinet: '不要开放展示格',
    window: '保留现有窗',
  }
  state.requirements = buildRequirements(state.brief, state.answers)
  state.snapshots = [{ version: 1, requirements: clone(state.requirements), at: now() }]
  state.proposals = []
  samplePreview = null
  state.question = 4
  log('载入完整厨房演示：需求 R1 与两家初版方案')
  navigate('compare')
}
const projectStore = createProjectStorage<ProjectSession>({
  decode: decodeProject,
  onStatus: next => { saveStatus = next; refreshSaveStatus() },
})
planning.subscribe(() => { scheduleProjectSave(); refreshSaveStatus() })
async function initializeProject() {
  projectReady = false; clearTimeout(saveTimer)
  try {
    const saved = await projectStore.load()
    if (saved) {
      const data = saved.data
      state = data.state; intakeDraft = data.intakeDraft; scales = data.scales; vendorDrafts = data.vendorDrafts
      planning.restore(data.planning)
      planningChosen = data.planningChosen; furthestUnlocked = data.furthestUnlocked
      currentArea = data.currentArea; lastWorkspacePage = data.lastWorkspacePage; selectedProjectRoom = data.selectedProjectRoom
      vendorId = data.vendorId; draftItems = []
      lastSavedFingerprint = JSON.stringify(captureProject())
    }
    recoveryError = ''; hasUnsavedChanges = false; projectReady = true
  } catch (error) {
    recoveryError = error instanceof Error ? error.message : '无法恢复本机草稿。'
    projectReady = false
  }
  render()
}
for (const eventName of ['input', 'change', 'click', 'submit']) document.addEventListener(eventName, () => queueMicrotask(scheduleProjectSave))
document.addEventListener('visibilitychange', () => { if (document.hidden) void saveProject() })
window.addEventListener('pagehide', () => { void saveProject() })
void initializeProject()

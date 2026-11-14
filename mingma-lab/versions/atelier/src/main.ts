import { initializeProjectContext, contextAnswers, projectContextChanged, renderRequirementsOverview, renderProjectContext, renderLegacyArchive, type ProjectContext } from '../../../shared/requirements-hub'
import '../../../shared/requirements-hub.css'
import { createRoomPlanning } from '../../../shared/room-planning'
import { captureFloorplanHandoff, intakeWithSpaceMarkup, mountIntakeSpacePreview, type FloorplanHandoff } from '../../../shared/intake-space-preview'
import { mountIntake } from '../../../shared/intake-ui'
import { intakeRequirementRow, adoptedIntakeHtml, stateFromAdoptedIntake } from '../../../shared/intake-bridge'
import type { IntakeDocument } from '../../../shared/intake-contract'
import '../../../shared/intake-bridge.css'
import './style.css'
import { createHoloView } from './atelier-model'
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
type Snapshot = { version: number; requirements: Requirement[]; at: string; intakeDocument?: IntakeDocument; projectContext?: ProjectContext }
type Feedback = { id: string; proposalId: string; version: number; items: string[]; at: string }
type Selection = { proposal: Proposal; requirements: Snapshot; at: string; pending: string[] }
type State = {
  schema: 1
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
const KEY = 'mingma-atelier-v1'
const SCALE_KEY = 'mingma-atelier-dimensions-v1'
type ScaleValue = { maturity: number; priority: string; evidence: string }
let scales: Record<string, ScaleValue> = {}
try {
  const priorScales = JSON.parse(localStorage.getItem(SCALE_KEY) || '{}')
  if (priorScales && typeof priorScales === 'object' && !Array.isArray(priorScales)) scales = priorScales
} catch {
  /* Leave malformed prior data untouched. */
}


const empty = (): State => ({
  schema: 1,
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
let storageError = false
let state: State = empty()
try {
  const raw = localStorage.getItem(KEY)
  if (raw) {
    const parsed = JSON.parse(raw)
    if (
      parsed.schema !== 1 ||
      !Array.isArray(parsed.requirements) ||
      !Array.isArray(parsed.snapshots) ||
      !Array.isArray(parsed.proposals) ||
      !parsed.answers
    )
      throw Error()
    state = parsed
  }
} catch {
  storageError = true
}
if (location.hash === '#dimensions') history.replaceState(null, '', '#requirements')
let page: Page = (location.hash.slice(1) as Page) || 'overview'
let house: HouseView | undefined
const planning = createRoomPlanning()
let planningEntry: string | null | undefined
let previewFrom: FloorplanHandoff | undefined
let intakePreview: ReturnType<typeof mountIntakeSpacePreview> | undefined
let intakeSession: ReturnType<typeof mountIntake> | undefined
let intakeEntry: { focus: boolean; appendBrief?: string } | null = null
const INTAKE_KEY = 'mingma-atelier-intake-v2'
const DRAFT_KEY = 'mingma-atelier-drafts-v1'
let vendorDrafts: Record<string, ProposalItem[]> = {}
try {
  vendorDrafts = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}')
} catch {}
const draftKey = () => `${vendorId}-r${latest()?.version || 0}`
function persistVendorDraft() {
  vendorDrafts[draftKey()] = clone(draftItems)
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(vendorDrafts))
  } catch {
    toast('商家草稿保存失败，请先导出。')
  }
}
let selectedRoom = 'kitchen',
  selectedRoute: string | null = null,
  spaceVendor = 'overview',
  vendorId: 'a' | 'b' = 'a',
  draftItems: ProposalItem[] = []
let filter = 'all',
  saveTimer: ReturnType<typeof setTimeout>,
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
const currentProposal = (id: 'a' | 'b') => state.proposals.filter((p) => p.vendorId === id).at(-1)
const findings = (p: Proposal) =>
  reviewProposal(
    state.snapshots.find((s) => s.version === p.requirementVersion)?.requirements ?? [],
    p,
  )
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
    storageError = false
  } catch {
    storageError = true
    toast('浏览器保存失败，请导出项目，避免丢失内容。')
  }
}
function log(text: string) {
  state.events.unshift({ text, at: now() })
  save()
}
function toast(message: string) {
  const el = document.querySelector('#toast')!
  el.textContent = message
  el.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('show'), 3800)
}
function navigate(to: Page) {
  location.hash = to
  if (page === to) render()
  window.scrollTo(0, 0)
}
window.addEventListener('hashchange', () => {
  if (location.hash === '#dimensions') history.replaceState(null, '', '#requirements')
  page = (location.hash.slice(1) as Page) || 'overview'
  render()
  window.scrollTo(0, 0)
})
const paths: Record<string, string> = {
  home: 'M3 10 12 3l9 7v10H3V10m6 10v-7h6v7',
  chat: 'M4 4h16v12H9l-5 4V4m4 4h8m-8 4h5',
  list: 'M8 5h12M8 12h12M8 19h12M3 5h1m-1 7h1m-1 7h1',
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
  ['compare', '方案比对', 'compare'],
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
function chapter() {
  const entries: Record<Page, [string, string]> = {
    overview: ['01', '项目总览'],
    planning: ['02', '空间选择'],
    clarify: ['03', '生活访谈'],
    requirements: ['04', '我的需求'],
    compare: ['05', '方案审阅'],
    vendor: ['05.1', '商家修订'],
    space: ['06', '空间图纸'],
    records: ['07', '确认归档'],
  }
  return entries[page] ?? entries.overview
}

function heading(title: string, desc: string, actions = '') {
  return html`<div class="page-heading">
    <div class="heading-copy">
      <h1>${title}</h1>
      <p>${desc}</p>
    </div>
    <div class="heading-actions">
      ${actions}<span class="page-ordinal" aria-hidden="true">${chapter()[0]}</span>
    </div>
  </div>`
}

function emptyPanel(title: string, desc: string, action: string, text: string) {
  return html`<div class="empty-state">
    <span class="empty-mark">${icon('file', 30)}</span>
    <h2>${title}</h2>
    <p>${desc}</p>
    ${btn(text, action)}
  </div>`
}

function shell(content: string) {
  const current = chapter()
  const snap = latest()
  return html`<div class="atelier-app" data-page="${page}">
    <aside class="atelier-rail">
      <a class="atelier-brand" href="#overview" aria-label="筑序项目总览"
        ><span class="brand-symbol">${icon('cube', 26)}</span
        ><span>筑序<small>ATELIER</small></span></a
      >
      <div class="rail-project">
        <span>明码 · 家装方案册</span><b>我的第一个家</b><small>示例项目 / 厨房改造</small>
      </div>
      <nav aria-label="项目章节">
        ${navs.map(([id, text, symbol], index) => html`<a href="#${id}" class="chapter-link ${page === id || (page === 'vendor' && id === 'compare') ? 'active' : ''}" ${page === id ? 'aria-current="page"' : ''}><span class="chapter-num">${String(index + 1).padStart(2, '0')}</span><span class="chapter-text">${({ overview: '项目总览', clarify: '生活访谈', requirements: '我的需求', compare: '方案审阅', space: '空间图纸', records: '确认归档' } as Record<string, string>)[id] || text}</span><span class="chapter-symbol">${icon(symbol, 15)}</span></a>`).join('')}
      </nav>
      <div class="rail-bottom">
        <p>为生活留白，<br />为每个决定留据。</p>
        <a class="gallery-return" href="../../index.html">${icon('arrow', 15)}返回设计展厅</a
        ><button class="text-button" data-action="about">${icon('info', 15)}本版说明</button
        ><span class="edition">C / 筑序 · 建筑方案册</span>
      </div>
    </aside>
    <div class="atelier-document">
      <header class="document-bar">
        <div class="document-location">
          <span>${current[0]}</span><b>${current[1]}</b><i></i
          ><small>${snap ? `需求 R${snap.version}` : '未发布需求'}</small>
        </div>
        <div class="document-tools">
          <span class="local-state"><i></i>${storageError ? '本机保存异常' : '本机保存'}</span
          >${btn(`${icon('export', 16)}导出项目`, 'export', 'secondary-button small')}
        </div>
      </header>
      <main id="main-content">
        ${storageError ? '<p class="notice warn">本机保存异常，请先导出当前项目留存。</p>' : ''}${content}
      </main>
      <footer class="document-footer">
        <span>明码 / 筑序</span>
        <p>需求由你定义，方案依据逐项核对。</p>
        <small>AI 需求共创 · 不涉及价格</small>
      </footer>
    </div>
  </div>`
}

function overview() {
  const snap = latest()
  const selectionCurrent = !!snap && state.selection?.requirements.version === snap.version
  const reqs = snap?.requirements ?? state.requirements
  const recent = state.events.slice(0, 3)
  return html`<section class="project-cover">
      <div class="cover-heading">
        <div>
          <h1>把生活，<br /><em>写进空间。</em></h1>
          <p>一份关于居住方式的需求档案，<br />也是你与装修公司共同使用的方案依据。</p>
        </div>
        <aside class="cover-action">
          <span class="case-label">我的第一个家</span>
          <dl>
            <div>
              <dt>改造主题</dt>
              <dd>厨房与日常生活</dd>
            </div>
            <div>
              <dt>需求状态</dt>
              <dd>
                ${snap ? `R${snap.version} 已发布` : reqs.length ? '草稿待确认' : '等待第一份访谈'}
              </dd>
            </div>
            <div>
              <dt>空间资料</dt>
              <dd>67 m² 示意户型</dd>
            </div>
          </dl>
          ${btn(`开始硬装规划${icon('arrow', 18)}`, 'go-planning')}${snap ? btn('查看当前需求', 'go-requirements', 'text-button') : btn('体验完整案例', 'demo', 'text-button')}
        </aside>
      </div>
      <figure class="cover-photograph">
        <img
          src="../../assets/atelier.webp"
          alt="温暖侧光下的洞石与木材厨房空间，概念参考图"
          fetchpriority="high"
        />
        <figcaption>
          <span>材料、光与日常。</span><small>概念参考图 · 不代表商家已提交的方案</small>
        </figcaption>
        <div class="photo-note">
          <span>${icon('leaf', 15)}本案关注</span>
          <p>保留熟悉的生活，<br />让每处改变都有理由。</p>
        </div>
      </figure>
    </section>
    <section class="project-contents">
      <div class="section-title">
        <h2>一份方案的形成</h2>
        <button class="text-button" data-action="reset">${icon('reset', 14)}重置示例</button>
      </div>
      <div class="steps">
        ${[
          ['planning', '选择空间', '按房间梳理硬装需求'],
          ['requirements', '形成共同清单', '确认范围与优先级'],
          ['compare', '对照每个回应', '核对原文与差异'],
          ['records', '留下选择依据', '保留版本与待办'],
        ]
          .map(
            ([route, title, desc], i) =>
              html`<button
                class="step ${(!snap && i === 0) || (snap && !selectionCurrent && i === 2) ? 'current' : ''}"
                data-action="go-${route}"
              >
                <span class="step-number"
                  >${(i < 2 && snap) || (i === 3 && selectionCurrent) ? icon('check', 18) : String(i + 1).padStart(2, '0')}</span
                >
                <div><b>${title}</b><small>${desc}</small></div>
                ${icon('arrow', 16)}
              </button>`,
          )
          .join('')}
      </div>
    </section>
    <section class="project-spread">
      <div class="brief-sheet">
        <div class="section-title">
          <h2>居住需求摘要</h2>
          <span>${reqs.length ? `${reqs.length} 项已记录` : '待整理'}</span>
        </div>
        ${
          reqs.length
            ? reqs
                .slice(0, 4)
                .map(
                  (r) =>
                    html`<button class="brief-entry" data-action="go-requirements">
                      <span>${esc(r.id)}</span>
                      <div>
                        <h3>${esc(r.title)}</h3>
                        <p>${esc(r.description)}</p>
                      </div>
                      ${icon('chevron', 15)}
                    </button>`,
                )
                .join('')
            : html`<div class="blank-brief">
                <p>从这些生活里的小事开始。</p>
                <div><span>布局</span><b>哪些原有位置值得保留？</b></div>
                <div><span>设备</span><b>哪些功能是这次真正需要的？</b></div>
                <div><span>维护</span><b>你期待怎样清洁和使用它？</b></div>
              </div>`
        }
        <div class="sheet-footer">
          ${btn('打开需求档案', 'go-requirements', 'text-button')}<span
            >${snap ? `发布于 ${stamp(snap.at)}` : '由用户确认后形成版本'}</span
          >
        </div>
      </div>
      <div class="drawing-sheet">
        <div class="section-title"><h2>按空间规划</h2></div>
        <p>从最想改动的房间开始，逐步整理每个区域的硬装需求。</p>
        ${btn(`选择房间${icon('arrow', 17)}`, 'go-planning', 'text-button')}
      </div>
    </section>
    <section class="project-journal">
      <div>
        <h2>项目札记</h2>
        <p>每次修订都留下痕迹，<br />也让下一次沟通更容易。</p>
        ${btn('查看确认记录', 'go-records', 'text-button')}
      </div>
      <div class="journal-list">
        ${
          recent.length
            ? recent
                .map(
                  (e) =>
                    html`<div class="journal-entry">
                      <time>${stamp(e.at)}</time>
                      <p>${esc(e.text)}</p>
                      ${icon('arrow', 16)}
                    </div>`,
                )
                .join('')
            : html`<div class="journal-empty">
                <span>${icon('file', 22)}</span>
                <h3>从第一份需求开始记录</h3>
                <p>完成访谈、发布需求或收到方案后，项目过程会保留在这里。</p>
              </div>`
        }
      </div>
    </section>`
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
  return html`${heading('把生活想法，变成清楚的需求', '先表达，再拆分与追问；全局、区域、公共项和待确认事项一起整理。')}${intakeWithSpaceMarkup(planning.model())}`
}
function requirements() {
  if (!state.requirements.length) return html`<div class="hub-root" data-variant="atelier">
    ${heading('我的需求', '把改造要求、项目背景和待确认信息放在一起。')}
    ${emptyPanel('先把想法整理成需求', '从一句生活化描述开始，AI 会拆分范围并补问缺少的信息。', 'go-clarify', '开始需求共创')}
    ${renderProjectContext(projectContext())}
    ${renderLegacyArchive(scales, ownerDimensions, merchantDimensions)}
  </div>`
  const snap = latest()
  return html`<div class="hub-root" data-variant="atelier">${heading('我的需求', '逐项检查描述与重要程度，确认后让商家围绕同一份需求回应。', btn(`${icon('plus', 16)}补充需求`, 'add-requirement', 'secondary-button'))}
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
        ${snap ? btn('查看版本', 'history', 'text-button') : ''}${projectContextChanged(projectContext(), state.intakeDocument) && (state.dirty || !snap) ? btn('先更新需求草稿', 'go-clarify') : btn(state.dirty || !snap ? '确认并发布需求' : '前往方案比对', state.dirty || !snap ? 'publish' : 'go-compare')}
      </div>
    </div>
    <div class="notice">
      ${icon('info', 18)}设备尺寸与现场接口可以留待核实。发布代表开始方案协作，不代表施工条件已经确定。
    </div>
    ${projectContextChanged(projectContext(), state.intakeDocument) ? '<div class="notice warn">项目背景已改变或与原梳理记录不同。请重新整理并采用草稿后再发布新版本；原发布版本保持不变，仍可用于方案比对。</div>' : ''}
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
    ${renderProjectContext(projectContext())}
    ${renderLegacyArchive(scales, ownerDimensions, merchantDimensions)}
  </div>`
}
function compare() {
  const snap = latest()
  if (!snap)
    return (
      heading('方案比对', '用同一份需求，看清两家方案的回应。') +
      emptyPanel(
        '还没有发布需求',
        '先确认需求清单，商家才能据此提供方案。',
        'go-requirements',
        '查看需求清单',
      )
    )
  const ps = (['a', 'b'] as const).map(currentProposal)
  if (ps.every((p) => !p))
    return (
      heading('方案比对', `当前需求基准 R${snap.version}`) +
      emptyPanel(
        '准备好接收方案了',
        '可以先载入两家模拟商家的方案，体验核对与修订。',
        'seed',
        '载入演示商家方案',
      ) +
      btn('自行提交商家方案', 'go-vendor', 'secondary-button')
    )
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
      data.some(
        (proposal, i) =>
          proposal.version === 0 ||
          proposal.requirementVersion !== snap.version ||
          fs[i].find((x) => x.requirementId === r.id)?.status !== 'responded',
      ),
  )
  return html`${heading('每一份方案，如何回应你', '相同的需求基准，让差异清楚可见。', btn(`${icon('edit', 16)}商家提交 / 修订`, 'go-vendor', 'secondary-button'))}${state.dirty ? '<p class="notice warn">你有尚未发布的需求修改。当前仍按已发布版本比较。</p>' : ''}${stale ? `<div class="notice warn">${icon('info', 18)}需求已更新到 R${snap.version}，商家方案还在引用旧版。${btn('按新需求重新提交', 'go-vendor', 'text-button')}</div>` : ''}
    <div class="compare-toolbar">
      <div class="segmented">
        <button data-filter="all" class="${filter === 'all' ? 'selected' : ''}">全部需求</button
        ><button data-filter="issues" class="${filter === 'issues' ? 'selected' : ''}">
          只看待处理
        </button>
      </div>
      <span>需求基准 R${snap.version} · 规则辅助核对</span>
    </div>
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
                  html`<tr>
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
                          ${p.version === 0 ? '<span class="status unknown">尚未提交方案</span><p>等待商家提供具体做法与说明。</p>' : p.requirementVersion !== snap.version ? '<span class="status unknown">待按新需求重新核对</span>' : f ? `${status(f)}<p>${esc(f.evidence || '商家尚未提供该项说明。')}</p><button class="evidence-link" data-action="evidence" data-proposal="${esc(p.id)}" data-id="${esc(r.id)}">查看依据与建议${icon('arrow', 14)}</button>` : '<span class="status unknown">旧版本没有此需求</span>'}
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
            ${data.map((p) => html`<td><div class="button-stack flex flex-col gap-3">${btn('生成问题反馈', 'feedback', 'secondary-button', `data-id="${esc(p.id)}" ${!p.version ? 'disabled' : ''}`)}${btn('查看并选择此方案', 'select-proposal', 'primary', `data-id="${esc(p.id)}" ${p.requirementVersion !== snap.version || !p.version ? 'disabled' : ''}`)}</div></td>`).join('')}
          </tr>
        </tfoot>
      </table>
    </div>
    <div class="notice">
      ${icon('info', 18)}核对只检查商家声明与已配置的需求条件。额外项目、工艺可行性和现场情况需要人工确认。${btn('查看空间关联', 'go-space', 'text-button')}
    </div>`
}
function merchantContextGuide() {
  return html`<div class="hub-root" data-variant="atelier"><details class="hub-merchant-guide"><summary>制作方案前的承接与协作检查</summary><p>围绕当前需求补充资料、承接边界和协作条件；具体回应填写在下面的对应需求中。</p><ul>${merchantDimensions.map(d => html`<li><b>${esc(d.name)}</b><p>${esc(d.question)}</p>${scales[d.id]?.evidence ? html`<p class="muted">历史协作记录（未指定商家）：${esc(scales[d.id].evidence)}</p>` : ''}</li>`).join('')}</ul></details></div>`
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
  return html`${heading('商家方案工作区', '此处模拟商家操作；提交只保存到你的浏览器。', btn('返回方案比对', 'go-compare', 'secondary-button'))}
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
  return html`${heading('在空间里，看懂你的方案', '点选房间与水电示意线路，查看对应的需求和施工内容。')}
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
    (r) => r.intake ? r.intake.scope === 'global' || r.intake.areas.includes(name) : r.room === name,
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
function records() {
  return html`${heading('把每次决定，留在这里', '已发布的需求、商家修订和你的最终选择都有记录。', btn(`${icon('export', 16)}导出项目`, 'export', 'secondary-button'))}${state.selection ? `<section class="selection-record"><span class="large-check">${icon('check', 27)}</span><div><h2>已选定 ${esc(state.selection.proposal.vendorName)}</h2><p>需求 R${state.selection.requirements.version} · 方案 V${state.selection.proposal.version} · ${stamp(state.selection.at)}</p><span class="status partial">${state.selection.pending.length ? '仍有 ' + state.selection.pending.length + ' 项待办' : '已记录本次选择'}</span>${latest()?.version !== state.selection.requirements.version ? '<p class="notice warn">当前需求已更新，本记录保留的是历史选择。</p>' : ''}</div>${btn('查看确认内容', 'selection-detail', 'secondary-button')}</section>` : emptyPanel('还没有选定方案', '先比较两家商家的回应，再做出适合你的选择。', 'go-compare', '前往方案比对')}
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
  planning.leave()
  intakeSession?.dispose()
  intakePreview?.dispose()
  intakePreview = undefined
  intakeSession = undefined
  house?.dispose()
  house = undefined
  const pages = { overview, planning: planning.render, clarify, requirements, compare, space, records, vendor }
  if (!(page in pages)) page = 'overview'
  app.innerHTML = shell(pages[page]())
  if (page === 'planning') planning.mount(document.querySelector<HTMLElement>('#room-planning')!, state.requirements)
  if (page === 'clarify') {
    intakePreview = mountIntakeSpacePreview(document.querySelector<HTMLElement>('.intake-space')!, previewFrom)
    previewFrom = undefined
    const area = planningEntry
    planningEntry = undefined
    intakeSession = mountIntake(document.querySelector<HTMLElement>('#intake-root')!, {
      variant: 'atelier', initialBrief: state.brief, existingCount: state.requirements.length,
      projectContext: contextAnswers(projectContext()),
      planningArea: area,
      spatialModel: planning.model(),
      onSpatialFocus: intakePreview.update,
      onFirstExpression: intakePreview.acknowledgeBrief,
      onNotice: toast,
      onAdopt: (requirements, document) => {
        if (!requirements.length) { toast('请先确认至少一条本次需求。'); return }
        state.brief = document.brief
        state.requirements = clone(requirements)
        state.intakeDocument = clone(document)
        state.dirty = true
        log('采用新的需求共创草稿，等待用户发布；已有版本保持不变')
        navigate('requirements')
        toast('需求草稿已采用，请核对后发布。')
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
  if (page === 'space') {
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
document.addEventListener('click', (e) => {
  const target = (e.target as HTMLElement).closest<HTMLElement>('button,a[data-action]')
  if (!target) return
  const action = target.dataset.action
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
    draftItems = []
    navigate(action.slice(3) as Page)
    return
  }
  const id = target.dataset.id
  switch (action) {
    case 'plan-current-room':
    case 'plan-whole-home':
      previewFrom = captureFloorplanHandoff()
      planningEntry = action === 'plan-current-room' ? planning.selectedRoom()?.name : null
      navigate('clarify')
      break
    case 'close-dialog':
      dialog.close()
      break
    case 'about':
      showDialog(
        '关于这版明码',
        `<p>这是可交互的网页 MVP，支持多区域 AI 需求共创、清单确认与版本发布；商家提交、核对和选择保留演示流程。</p><dl class="about-list"><dt>数据保存</dt><dd>仅保存在当前浏览器，不会同步给真实商家。更换浏览器不会同步数据。</dd><dt>AI 接入</dt><dd>需求共创已接入 AI，可按全局、区域和公共项拆分并追问；商家方案页面仍使用演示规则，不构成专业审查。</dd><dt>空间模型</dt><dd>固定示意户型与路线，不能用作实际施工图。</dd></dl>`,
      )
      break
    case 'sample-brief':
      state.brief = '厨房想好打理，电器够用，希望加洗碗机，保留现有布局和窗户，不要开放展示格。'
      save()
      render()
      break
    case 'start-questions':
      if (!state.brief.trim()) {
        toast('先写一句你的装修想法。')
        document.querySelector<HTMLTextAreaElement>('#brief')?.focus()
        break
      }
      state.question = 0
      save()
      render()
      break
    case 'previous':
      state.question = Math.max(-1, state.question - 1)
      save()
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
        save()
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
      if (state.requirements.length)
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
        '重置本机演示项目',
        `<p>将清除当前浏览器中的本项目需求、维度量表、方案和确认记录。建议先导出项目。</p>`,
        btn('取消', 'close-dialog', 'secondary-button') +
          btn('确认重置', 'confirm-reset', 'danger'),
      )
      break
    case 'confirm-reset':
      planning.reset()
      localStorage.removeItem(INTAKE_KEY)
      state = empty()
      vendorDrafts = {}
      scales = {}
      localStorage.removeItem(SCALE_KEY)
      localStorage.removeItem(DRAFT_KEY)
      save()
      dialog.close()
      navigate('overview')
      toast('已重置当前演示项目')
      break
    case 'hub-locate': {
      const row = document.querySelector<HTMLElement>(`[data-requirement-id="${CSS.escape(id || '')}"]`)
      if (row) { row.setAttribute('tabindex', '-1'); row.scrollIntoView({ block: 'center', behavior: 'smooth' }); row.focus({ preventScroll: true }) }
      break
    }
    case 'add-requirement':
      if (state.intakeDocument) { intakeEntry = { focus: true }; navigate('clarify'); break }
      requirementForm()
      break
    case 'edit-requirement':
      if (state.requirements.find(r => r.id === id)?.intake && state.intakeDocument) { showAdoptedIntake(); break }
      requirementForm(id)
      break
    case 'view-adopted-intake':
      showAdoptedIntake()
      break
    case 'restore-adopted-intake':
      if (state.intakeDocument) {
        localStorage.setItem(INTAKE_KEY, JSON.stringify(stateFromAdoptedIntake(state.intakeDocument)))
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
      if (projectContextChanged(projectContext(), state.intakeDocument)) { toast('项目背景已改变，请先重新整理并采用草稿。'); navigate('clarify'); break }
      showDialog(
        '确认发布需求',
        `<p>将发布 <b>R${(latest()?.version || 0) + 1}</b>，共 ${state.requirements.length} 条需求。商家将以这个版本制作方案。</p><h3>仍需确认</h3><ul>${state.requirements.flatMap((r) => r.pending.map((p) => html`<li>${esc(r.id)} · ${esc(p)}</li>`)).join('') || '<li>当前没有记录待确认事项。</li>'}</ul><p class="muted">这些待办不会因发布而自动消失。历史版本保持不变。</p>`,
        btn('继续编辑', 'close-dialog', 'secondary-button') + btn('确认并发布', 'confirm-publish'),
      )
      break
    case 'confirm-publish': {
      if (projectContextChanged(projectContext(), state.intakeDocument)) { dialog.close(); toast('项目背景已改变，请先重新整理并采用草稿。'); navigate('clarify'); break }
      const version = (latest()?.version || 0) + 1
      state.snapshots.push({ version, requirements: clone(state.requirements), at: now(), projectContext: clone(projectContext()), ...(state.intakeDocument ? { intakeDocument: clone(state.intakeDocument) } : {}) })
      state.dirty = false
      log(`发布需求 R${version}，共 ${state.requirements.length} 条`)
      dialog.close()
      render()
      toast(`需求 R${version} 已发布`)
      break
    }
    case 'seed':
      state.proposals.push(
        ...seedProposals(latest()!.requirements, latest()!.version).filter(
          (p) => !currentProposal(p.vendorId),
        ),
      )
      log('载入两家模拟商家的初版方案')
      render()
      break
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
          .join(''),
      )
      break
    }
    case 'evidence': {
      const p = state.proposals.find((p) => p.id === target.dataset.proposal)
      if (!p) {
        toast('该商家尚未提交方案，请先等待商家回应。')
        break
      }
      const r = state.snapshots
        .find((s) => s.version === p.requirementVersion)
        ?.requirements.find((r) => r.id === id)
      const f = findings(p).find((f) => f.requirementId === id)
      if (!r || !f) {
        toast('未找到对应需求或审查记录，请重新核对方案版本。')
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
          id: crypto.randomUUID(),
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
        '明码商家方案模板.csv',
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
        id: crypto.randomUUID(),
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
      const p = state.proposals.find((p) => p.id === id)!
      const pending = selectionPending(p)
      showDialog(
        '查看选择与剩余待办',
        `<p>你准备选定 <b>${esc(p.vendorName)} V${p.version}</b>，对应需求 R${p.requirementVersion}。</p><h3>保留在确认记录中的待办</h3><ul>${pending.map((t) => html`<li>${esc(t)}</li>`).join('') || '<li>本轮规则检查无未决项，现场实施仍需专业确认。</li>'}</ul><p class="muted">本次选择不会把待办标记为已解决，也不代表施工验收。</p>`,
        btn('暂不选择', 'close-dialog', 'secondary-button') +
          btn('确认选定并保留待办', 'confirm-selection', 'primary', `data-id="${esc(p.id)}"`),
      )
      break
    }
    case 'confirm-selection': {
      const p = state.proposals.find((p) => p.id === id)!
      if (p.requirementVersion !== latest()?.version) {
        toast('需求版本已变更，请重新核对。')
        break
      }
      state.selection = {
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
        `<p>${esc(s.proposal.vendorName)} · V${s.proposal.version} · R${s.requirements.version}</p><ul>${s.pending.map((p) => html`<li>${esc(p)}</li>`).join('') || '<li>没有记录待办</li>'}</ul><p>${stamp(s.at)}</p>`,
      )
      break
    }
    case 'space-req': {
      const req = (latest()?.requirements ?? state.requirements).find((r) => r.id === id)!
      const routeId = id === 'K03' ? 'electric-kitchen' : id === 'K02' ? 'cold-kitchen' : null
      if (spaceVendor === 'overview' && routeId) {
        selectedRoute = routeId
        house?.selectRoute(routeId)
        updateSpacePanel()
      }
      showDialog(
        `${esc(req.id)} · ${esc(req.title)}`,
        `<p>${esc(req.description)}</p><p class="notice">${routeId ? '已高亮相关类别的示意支路；该路线不是商家提供的施工路线。' : '此条需求关联厨房区域，尚未提供更具体的位置数据。'}</p><p>待确认：${esc(req.pending.join('、') || '未记录')}</p>`,
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
        '明码历史维度记录.json',
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
      download(
        '明码项目记录.json',
        JSON.stringify(
          {
            exportedAt: now(),
            mode: 'ai-intake-local-project',
            ...state,
            projectContext: projectContext(),
            dimensionScales: scales,
            vendorDrafts,
          },
          null,
          2,
        ),
        'application/json',
      )
      toast('项目记录已导出，包含需求与方案历史。')
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
    clearTimeout(saveTimer)
    saveTimer = setTimeout(save, 250)
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
    save()
    render()
  }
  if (input.dataset.priority) {
    const r = state.requirements.find((r) => r.id === input.dataset.priority)!
    r.priority = input.value as 'must' | 'prefer'
    state.dirty = true
    save()
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
  localStorage.removeItem(INTAKE_KEY)
  state = empty()
  scales = {}
  localStorage.removeItem(SCALE_KEY)
  vendorDrafts = {}
  localStorage.removeItem(DRAFT_KEY)
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
  state.proposals = seedProposals(state.requirements, 1)
  state.question = 4
  log('载入完整厨房演示：需求 R1 与两家初版方案')
  navigate('compare')
}
render()

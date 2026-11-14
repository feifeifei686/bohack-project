import type { InsightRequirement, InsightConnection, RequirementInsight } from '../../../shared/requirement-insight-contract'

export type RequirementInsightViewInput = {
  requirements: InsightRequirement[]
  version: number
  status: 'loading' | 'complete' | 'error'
  result?: RequirementInsight
  model?: string
  error?: string
  stale?: boolean
}

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
const connectionNames: Record<InsightConnection['kind'], string> = { dependency: '需要配套', synergy: '相互支持', tradeoff: '需要取舍' }
const arrow = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>'
const sparkle = '<svg viewBox="0 0 32 32" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><path d="M16 3c0 9-4 13-13 13 9 0 13 4 13 13 0-9 4-13 13-13-9 0-13-4-13-13Z"/><path d="M26 3v6M23 6h6"/></svg>'
const number = (value: number) => `<span class="ri-number" data-insight-value="${value}" aria-hidden="true">${value}</span><span class="ri-sr-only">${value}</span>`

function graphLayout(count: number) {
  const half = Math.ceil(count / 2)
  return Array.from({ length: count }, (_, index) => {
    const column = index < half ? 0 : 1
    const columnCount = column ? count - half : half
    const row = column ? index - half : index
    return { x: column ? 560 : 160, y: columnCount === 1 ? 240 : 76 + row * (328 / (columnCount - 1)) }
  })
}

function renderGraph(input: RequirementInsightViewInput, selected: string) {
  const { requirements, result, status } = input
  const visible = requirements.slice(0, 8)
  const positions = graphLayout(visible.length)
  const pointById = new Map(visible.map((requirement, index) => [requirement.id, positions[index]]))
  const connections = status === 'complete' ? result?.connections ?? [] : []
  const visibleConnections = connections.filter(connection => pointById.has(connection.fromId) && pointById.has(connection.toId))
  const spokes = status !== 'complete' ? positions.map((position, index) => `<path class="ri-input-line" d="M360 240 Q ${position.x} 240 ${position.x} ${position.y}" style="--ri-order:${index}"/>`).join('') : ''
  const edges = visibleConnections.map((connection, index) => {
    const from = pointById.get(connection.fromId)!, to = pointById.get(connection.toId)!
    const bend = from.x === to.x ? (from.x < 360 ? 290 : 430) : 360
    return `<path class="ri-connection ri-connection--${connection.kind}" data-insight-edge data-from="${escape(connection.fromId)}" data-to="${escape(connection.toId)}" d="M${from.x} ${from.y} C${bend} ${from.y} ${bend} ${to.y} ${to.x} ${to.y}" pathLength="1" style="--ri-order:${index}"><title>${escape(connectionNames[connection.kind])}：${escape(connection.reason)}</title></path>`
  }).join('')
  return `<div class="ri-map-wrap">
    <div class="ri-map-heading"><h2>需求关系图</h2><span>${status === 'complete' ? '点击需求，展开分析依据' : status === 'error' ? '已提交的需求仍然保留' : '已提交的想法，正在逐一复核'}</span></div>
    <div class="ri-map" data-node-count="${visible.length}">
      <svg class="ri-network" viewBox="0 0 720 480" preserveAspectRatio="none" aria-hidden="true">${spokes}${edges}</svg>
      <div class="ri-map-center" aria-hidden="true"><span class="ri-map-symbol">${sparkle}</span><b>你的家</b><span>R${input.version} · ${requirements.length} 条需求</span></div>
      ${visible.map((requirement, index) => {
        const finding = result?.findings.find(item => item.requirementId === requirement.id)
        return `<button class="ri-node ${requirement.id === selected ? 'is-selected' : ''}" style="--ri-x:${positions[index].x / 7.2}%;--ri-y:${positions[index].y / 4.8}%;--ri-order:${index}" data-insight-node="${escape(requirement.id)}" aria-pressed="${requirement.id === selected}" aria-controls="ri-detail-${requirements.indexOf(requirement)}" title="${escape(requirement.title)}">
          <span class="ri-node-meta"><span>${escape(requirement.id)}</span><span>${requirement.priority === 'must' ? '必须项' : '偏好项'}</span></span><strong>${escape(requirement.title)}</strong>
          <span class="ri-node-state ${finding?.clarity === 'needs_detail' ? 'is-pending' : ''}">${status === 'complete' && finding ? finding.clarity === 'clear' ? '表达已清晰' : '还需补充细节' : escape(requirement.room)}</span>
        </button>`
      }).join('')}
    </div>
    <div class="ri-map-legend">${status === 'complete' ? Object.entries(connectionNames).map(([kind, label]) => `<span><i class="ri-key ri-key--${kind}"></i>${label}</span>`).join('') : '<span class="ri-map-note">连线表示已提交的需求，分析结果返回后展示需求间关系。</span>'}</div>
    ${requirements.length > 8 ? `<p class="ri-map-note ri-map-overflow">图中展示前 8 条需求；下方可查看全部 ${requirements.length} 条的分析与关系。</p>` : ''}
    ${status === 'complete' && !visibleConnections.length ? `<p class="ri-map-note">${connections.length ? '当前图中没有同时展示关系两端的条目，完整关系见下方分析。' : '本轮未识别到有充分依据的需求关联，逐项分析见下方。'}</p>` : ''}
  </div>`
}

function renderQuantities(input: RequirementInsightViewInput) {
  const { result, status, requirements } = input
  if (status !== 'complete' || !result) return `<aside class="ri-observations">
    <h2>${status === 'error' ? '分析还没有完成' : '再想一层，让想法更完整。'}</h2>
    <p>${status === 'error' ? '已发布的需求仍然保留。重试后，可以继续查看量化结论。' : 'Flash 正在结合整份清单，检查描述是否清楚、哪些需求需要一起考虑。'}</p>
    <dl class="ri-known-counts"><div><dt>本次复核</dt><dd>${requirements.length}<span> 条需求</span></dd></div><div><dt>保留优先级</dt><dd>${requirements.filter(item => item.priority === 'must').length}<span> 条必须项</span></dd></div></dl>
    <ul class="ri-review-scope"><li><span></span>逐项核对表达与依据</li><li><span></span>发现配套关系与潜在取舍</li><li><span></span>整理需要补充的条件</li></ul>
    <p class="ri-quiet-note">${status === 'error' ? '这里会显示实际返回的分析结果。' : '量化结论将在分析返回后显示。你可以先返回需求清单。'}</p>
  </aside>`
  const { metrics } = result
  return `<aside class="ri-observations">
    <h2>每个数字，都有依据。</h2>
    <div class="ri-clarity"><div class="ri-clarity-label"><span>表达清晰度</span><strong>${number(metrics.clarityPercent)}<small>%</small></strong></div>
      <div class="ri-clarity-bar ${result.findings.length > 30 ? 'is-dense' : ''}" role="img" aria-label="${metrics.total} 条需求中，${metrics.clear} 条表达清晰，${metrics.needsDetail} 条还需补充细节">${result.findings.map(finding => `<span class="${finding.clarity === 'clear' ? 'is-clear' : 'is-pending'}"></span>`).join('')}</div>
      <p>${metrics.clear} / ${metrics.total} 条表达清晰，${metrics.needsDetail} 条仍需补充。</p>
    </div>
    <dl class="ri-measures">
      <div><dt><b>发现需求关联</b><span>配套、支持与取舍</span></dt><dd>${number(metrics.connections)}<small> 组</small></dd></div>
      <div><dt><b>保留待确认事项</b><span>合并重复项后计数</span></dt><dd>${number(metrics.pendingChecks)}<small> 项</small></dd></div>
      <div><dt><b>你的必须项</b><span>沿用提交时的优先级</span></dt><dd>${number(metrics.must)}<small> 条</small></dd></div>
    </dl>
    <p class="ri-quiet-note">清晰度 = 表达清晰的需求数 ÷ 本次需求总数；仅衡量文字说明，不代表施工可行性。</p>
  </aside>`
}

function renderDetails(input: RequirementInsightViewInput, selected: string) {
  const { requirements, result, status } = input
  const selectedIndex = requirements.findIndex(item => item.id === selected)
  return `<section class="ri-evidence-section" aria-labelledby="ri-evidence-heading">
    <div class="ri-section-heading"><h2 id="ri-evidence-heading">从一条需求，看见更多。</h2><p>选择需求，查看原文与本轮分析。</p></div>
    <div class="ri-requirement-picker" role="group" aria-label="选择要查看的需求">${requirements.map((requirement, index) => `<button class="ri-picker ${requirement.id === selected ? 'is-selected' : ''}" data-insight-node="${escape(requirement.id)}" aria-pressed="${requirement.id === selected}" aria-controls="ri-detail-${index}"><span>${escape(requirement.id)}</span>${escape(requirement.title)}</button>`).join('')}</div>
    <div class="ri-detail-container">${requirements.map((requirement, index) => {
      const finding = result?.findings.find(item => item.requirementId === requirement.id)
      const connections = result?.connections.filter(connection => connection.fromId === requirement.id || connection.toId === requirement.id) ?? []
      return `<article class="ri-detail" id="ri-detail-${index}" ${index === selectedIndex ? '' : 'hidden'} data-insight-detail="${escape(requirement.id)}">
        <div class="ri-detail-main"><header><span class="ri-detail-id">${escape(requirement.id)}</span><h3 tabindex="-1">${escape(requirement.title)}</h3>${finding ? `<span class="ri-clarity-state ${finding.clarity === 'clear' ? 'is-clear' : 'is-pending'}">${finding.clarity === 'clear' ? '表达已清晰' : '还需补充细节'}</span>` : ''}</header>
          ${finding ? `<p class="ri-rationale">${escape(finding.rationale)}</p>` : `<p class="ri-rationale">${escape(requirement.description)}</p>`}
          ${finding?.evidence.length ? `<details class="ri-evidence"><summary>查看 ${finding.evidence.length} 处原文依据</summary>${finding.evidence.map(evidence => `<blockquote><p>${escape(evidence.quote)}</p><cite>${escape(evidence.sourceId)} · 提交时的需求原文</cite></blockquote>`).join('')}</details>` : `<p class="ri-quiet-note">${status === 'error' ? '分析暂未返回，上方保留提交时的描述。' : '原文已保留，等待 Flash 返回分析依据。'}</p>`}
          ${finding?.checks.length ? `<div class="ri-checks"><h4>仍需确认</h4><ul>${finding.checks.map(check => `<li>${escape(check)}</li>`).join('')}</ul></div>` : finding ? '<p class="ri-quiet-note">本条未新增待确认项；后续仍以现场资料为准。</p>' : ''}
        </div>
        <div class="ri-detail-relations"><h4>${finding ? '与这些需求一起考虑' : '本次记录'}</h4>
          ${connections.length ? `<ul>${connections.map(connection => {
            const otherId = connection.fromId === requirement.id ? connection.toId : connection.fromId
            const other = requirements.find(item => item.id === otherId)
            return `<li><div class="ri-relation-title"><span class="ri-relation-kind ri-relation-kind--${connection.kind}">${connectionNames[connection.kind]}</span><button data-insight-node="${escape(otherId)}">${escape(other?.title ?? otherId)} ${arrow}</button></div><p>${escape(connection.reason)}</p><details class="ri-relation-evidence"><summary>查看关联依据</summary>${connection.evidence.map(evidence => `<blockquote><p>${escape(evidence.quote)}</p><cite>${escape(evidence.sourceId)} · 需求原文</cite></blockquote>`).join('')}</details></li>`
          }).join('')}</ul>` : `<p>${finding ? '本轮没有发现需要与其他条目联动的明确关系。' : `${escape(requirement.room)} · ${escape(requirement.category)}<br/>${requirement.priority === 'must' ? '必须项' : '偏好项'} · 优先级保持不变`}</p>`}
        </div>
      </article>`
    }).join('')}</div>
  </section>`
}

export function renderRequirementInsight(input: RequirementInsightViewInput): string {
  const { status, result, requirements } = input
  const selected = result?.findings.find(item => item.clarity === 'needs_detail')?.requirementId ?? requirements[0]?.id ?? ''
  return `<section class="requirement-insight" data-insight-status="${status}" aria-labelledby="ri-heading">
    <header class="ri-heading"><div><h1 id="ri-heading" tabindex="-1">${status === 'complete' ? '你的想法，开始彼此连接。' : status === 'error' ? '这轮分析，暂时停了一下。' : '让每个想法，找到彼此。'}</h1><p>${status === 'complete' && result ? escape(result.summary) : status === 'error' ? '需求已提交。你可以重试分析，也可以继续查看方案。' : '需求已提交。Flash 再复核一轮，把清晰之处、关联与待确认项呈现给你。'}</p></div><div class="ri-state" role="status"><span class="ri-state-dot"></span>${status === 'complete' ? `Flash 复核完成 · R${input.version}` : status === 'error' ? `R${input.version} · 等待重试` : `Flash 分析中 · R${input.version}`}</div></header>
    ${input.stale ? '<p class="ri-alert">你已修改需求草稿。这份分析对应发布时的版本，请发布新版本后查看新的分析。</p>' : ''}
    ${status === 'error' ? `<div class="ri-error" role="alert"><p>${escape(input.error || '暂时无法取得分析结果，请稍后重试。')}</p><button class="secondary-button" data-action="insight-retry">重新分析 ${arrow}</button></div>` : ''}
    <div class="ri-workspace">${renderGraph(input, selected)}${renderQuantities(input)}</div>
    ${renderDetails(input, selected)}
    ${status === 'complete' && result?.nextSteps.length ? `<section class="ri-next-section"><div class="ri-section-heading"><h2>接下来，先把这几件事说清。</h2><p>Flash 根据本轮需求提出的建议。</p></div><ol class="ri-next-steps">${result.nextSteps.map((step, index) => `<li><span class="ri-step-number">${String(index + 1).padStart(2, '0')}</span><div><h3>${escape(step.title)}</h3><p>${escape(step.reason)}</p><span class="ri-step-references">对应 ${step.requirementIds.map(escape).join('、')}</span></div></li>`).join('')}</ol></section>` : ''}
    ${status === 'complete' && result?.warnings.length ? `<details class="ri-limitations"><summary>查看本轮分析说明</summary><ul>${result.warnings.map(warning => `<li>${escape(warning)}</li>`).join('')}</ul></details>` : ''}
    <footer class="ri-footer"><div><p>${status === 'complete' ? '分析已保留，继续围绕同一份需求协作。' : '已发布的需求保持不变，可以随时回来查看分析。'}</p>${status === 'complete' ? `<small>${escape(input.model || 'deepseek-flash')} · 分析结论，不自动修改你的需求</small>` : ''}</div><div class="ri-actions"><button class="secondary-button" data-action="insight-back">返回需求清单</button><button class="primary" data-action="insight-continue">继续查看方案 ${arrow}</button></div></footer>
  </section>`
}

/** Bind local graph exploration only; publishing, retry, and navigation belong to the page. */
export function mountRequirementInsight(root: HTMLElement): () => void {
  const surface = root.matches('.requirement-insight') ? root : root.querySelector<HTMLElement>('.requirement-insight')
  if (!surface) return () => {}
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  let frame = 0
  const selectNode = (id: string) => {
    surface.querySelectorAll<HTMLElement>('[data-insight-node]').forEach(node => {
      const selected = node.dataset.insightNode === id
      node.classList.toggle('is-selected', selected)
      if (node.hasAttribute('aria-pressed')) node.setAttribute('aria-pressed', String(selected))
    })
    surface.querySelectorAll<HTMLElement>('[data-insight-detail]').forEach(panel => { panel.hidden = panel.dataset.insightDetail !== id })
    surface.querySelectorAll<SVGPathElement>('[data-insight-edge]').forEach(edge => edge.classList.toggle('is-muted', edge.dataset.from !== id && edge.dataset.to !== id))
  }
  const handleClick = (event: Event) => {
    const target = (event.target as Element).closest<HTMLElement>('[data-insight-node]')
    if (target && surface.contains(target)) {
      const opensDetail = target.classList.contains('ri-node') || Boolean(target.closest('.ri-detail-relations'))
      selectNode(target.dataset.insightNode!)
      if (opensDetail) {
        const detail = surface.querySelector<HTMLElement>('.ri-detail:not([hidden])')
        detail?.querySelector<HTMLElement>('h3')?.focus({ preventScroll: true })
        detail?.scrollIntoView({ block: 'nearest', behavior: motion.matches ? 'instant' : 'smooth' })
      }
    }
  }
  surface.addEventListener('click', handleClick)
  const counters = Array.from(surface.querySelectorAll<HTMLElement>('[data-insight-value]'))
  const finishCounters = () => counters.forEach(counter => { counter.textContent = counter.dataset.insightValue! })
  const stopMotion = () => { cancelAnimationFrame(frame); finishCounters() }
  const onMotionChange = () => { if (motion.matches) stopMotion() }
  motion.addEventListener('change', onMotionChange)
  if (!motion.matches && surface.dataset.insightStatus === 'complete') {
    const start = performance.now()
    const animate = (now: number) => {
      const elapsed = Math.min(1, (now - start) / 720)
      const progress = 1 - (1 - elapsed) ** 4
      counters.forEach(counter => { counter.textContent = String(Math.round(Number(counter.dataset.insightValue) * progress)) })
      if (elapsed < 1) frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
  }
  return () => { stopMotion(); surface.removeEventListener('click', handleClick); motion.removeEventListener('change', onMotionChange) }
}

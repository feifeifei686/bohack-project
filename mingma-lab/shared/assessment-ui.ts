import { dimensions, riskLabels, assessmentOwners, blockedIssues, type AssessmentRun, type Dimension } from './assessment.ts'

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const button = (label: string, action: string, extra = '', cls = 'secondary-button') => `<button type="button" class="${cls}" data-action="${action}" ${extra}>${label}</button>`
export type AssessmentTarget = { key: string; label: string }
export function renderAssessment(run: AssessmentRun, options: { targets: AssessmentTarget[]; stale: boolean; filter: Dimension | 'all'; canSelect: boolean; isDraft: boolean }): string {
  const blocked = blockedIssues(run, options.isDraft ? 'publish' : 'select')
  const visible = run.issues.filter(i => options.filter === 'all' || i.dimension === options.filter)
  const selectedDimension = run.dimensions.find(d => d.id === options.filter)
  const title = options.stale ? '资料已变化，请重新评估' : blocked.length ? `先处理 ${blocked.length} 项影响当前确认的问题` : options.isDraft ? '可以继续提交咨询需求' : options.canSelect ? '可以继续核对并选择方案' : '可以继续征集或查看商家方案'
  return `<div class="assessment-root">
    <div class="assessment-toolbar"><label for="assessment-target">评估对象<select id="assessment-target">${options.targets.map(t => `<option value="${esc(t.key)}" ${t.key === run.targetKey ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select></label><div>${button('重新评估', 'assessment-run', '', 'primary')}${button('导出评估', 'assessment-export')}</div></div>
    <section class="assessment-summary ${options.stale ? 'is-stale' : blocked.length ? 'is-blocked' : ''}" aria-labelledby="assessment-conclusion">
      <div><h2 id="assessment-conclusion">${title}</h2><p>${options.stale ? '以下保留上次结果，不能作为当前确认依据。更新需求或处理说明后，需要重新检查。' : `${run.issues.length} 项需要处理或核实，${run.dimensions.filter(d => d.level === 'pending').length} 个维度仍缺少判断依据。未发现阻断项不代表施工条件已核实。`}</p></div>
      ${!options.stale && blocked.length ? '<a class="primary assessment-link" href="#assessment-issues" data-action="assessment-first">处理问题</a>' : !options.stale && options.canSelect ? button('查看选择与待办', 'assessment-select', '', 'primary') : !options.stale && options.isDraft ? button('返回需求并提交', 'go-requirements') : ''}
    </section>
    <div class="assessment-workspace">
      <section class="assessment-dimensions" aria-labelledby="assessment-dimensions-title"><h2 id="assessment-dimensions-title">八维检查</h2><p>选择一个维度，查看问题和判断依据。</p><button type="button" class="assessment-all ${options.filter === 'all' ? 'is-active' : ''}" data-assessment-filter="all" aria-pressed="${options.filter === 'all'}">全部问题 <span>${run.issues.length}</span></button>
      <ul>${run.dimensions.map(d => `<li><button type="button" class="assessment-dimension ${options.filter === d.id ? 'is-active' : ''}" data-assessment-filter="${d.id}" aria-pressed="${options.filter === d.id}"><span>${d.label}</span><span class="risk-status risk-${d.level}">${riskLabels[d.level]}</span></button></li>`).join('')}</ul>
      <details class="assessment-method"><summary>评估范围与依据</summary><p>本轮执行咨询规则，检查已记录的安全核验事项、信息缺口、必须项回应与决策冲突。报价、预算、预备金和工期数据尚不齐备，保留待评估。</p><p>未启用缺少评分映射的 FMEA 自动打分。专业核验不能由处理说明或用户勾选替代。</p><p>规则 ${esc(run.ruleVersion)} · ${esc(new Date(run.at).toLocaleString('zh-CN'))}</p><a href="https://nankai.feishu.cn/wiki/VEXCwhEoFiwfz7kshf0cGruNntf" target="_blank" rel="noopener noreferrer">查看咨询分级参考</a></details></section>
      <section class="assessment-issues" id="assessment-issues" tabindex="-1" aria-labelledby="assessment-issues-title"><div class="assessment-issue-heading"><h2 id="assessment-issues-title">${selectedDimension ? esc(selectedDimension.label) : '问题与下一步'}</h2><span>${visible.length} 项</span></div>
      ${selectedDimension ? `<p class="assessment-dimension-detail">${esc(selectedDimension.detail)}</p>` : ''}
      ${visible.length ? visible.map(issue => {
        const note = run.notes.find(n => n.issueId === issue.id && n.fingerprint === issue.fingerprint)
        const dimension = dimensions.find(d => d[0] === issue.dimension)![1]
        return `<article class="assessment-issue" id="risk-${esc(issue.id)}"><div class="assessment-issue-meta"><span>${dimension}${issue.requirementIds.length ? ` · ${esc(issue.requirementIds.join(' / '))}` : ''}</span><span class="risk-status risk-${issue.level}">${riskLabels[issue.level]}</span></div><h3>${esc(issue.title)}</h3><p>${esc(issue.reason)}</p><dl><div><dt>下一步</dt><dd>${esc(issue.next)}</dd></div><div><dt>当前影响</dt><dd>${issue.blocks.includes('publish') ? '先处理，再提交确定的需求范围。' : issue.blocks.includes('select') ? '先处理，再确认选定当前方案。' : issue.blocks.includes('construction') ? '可继续咨询；相关实施条件仍需专业核验。' : '可继续咨询，保留待办并安排补充。'}</dd></div><div><dt>责任人</dt><dd>${esc(note?.owner || issue.owner)}</dd></div></dl>
          <details class="assessment-evidence"><summary>查看原文依据</summary><p>${esc(issue.evidence)}</p></details>
          ${note ? `<div class="assessment-note"><strong>已记录安排，仍待核实</strong><p>${esc(note.text)}</p><small>${esc(note.owner)} · ${esc(new Date(note.at).toLocaleString('zh-CN'))}</small></div>` : ''}
          <div class="assessment-issue-actions">${button(issue.requirementIds.length ? '查看原需求' : '查看项目资料', 'assessment-source', `data-id="${esc(issue.id)}"`, 'text-button')}${button(options.canSelect || run.proposalVersion ? '补充商家方案' : '修改需求', 'assessment-edit', `data-id="${esc(issue.id)}"`, 'text-button')}</div>
          <details class="assessment-resolution"><summary>记录资料与核实安排</summary><form data-assessment-note="${esc(issue.id)}"><label>由谁处理<select name="owner" required ${options.stale ? 'disabled' : ''}>${assessmentOwners.map(o => `<option ${o === (note?.owner || issue.owner) ? 'selected' : ''}>${o}</option>`).join('')}</select></label><label>补充资料或下一步安排<textarea name="note" rows="3" maxlength="1200" required ${options.stale ? 'disabled' : ''} placeholder="例如：请商家现场核对设备尺寸，并在新版方案中说明接口位置。">${esc(note?.text || '')}</textarea></label><p>此处保存处理记录；原需求与方案的修改请使用上方入口。记录不会自动消除风险或替代专业核验。</p><button class="primary" type="submit" ${options.stale ? 'disabled' : ''}>保存安排并重新评估</button></form></details>
        </article>`
      }).join('') : `<div class="assessment-empty"><h3>${selectedDimension?.level === 'pending' ? '还需要更多依据' : '本轮没有记录待处理问题'}</h3><p>${selectedDimension?.level === 'pending' ? esc(selectedDimension.detail) : '这只反映当前资料与规则覆盖范围，未提供的信息仍需后续核实。'}</p></div>`}
      </section>
    </div><p class="assessment-session-note">评估与处理记录保留在本轮页面中，刷新会清空。离开前可导出评估或完整项目。</p>
  </div>`
}

export function renderAssessmentArchive(run: AssessmentRun): string {
  return `<section class="assessment-archive"><h3>当时的风险评估</h3><p>${esc(run.targetLabel)} · 规则 ${esc(run.ruleVersion)} · ${esc(new Date(run.at).toLocaleString('zh-CN'))}</p><ul>${run.dimensions.map(d => `<li>${d.label}：${riskLabels[d.level]}</li>`).join('')}</ul><p>${run.issues.length} 项处理或核实事项随此版本保存。</p><ol>${run.issues.map(i => { const note = run.notes.find(n => n.issueId === i.id); return `<li><strong>${esc(i.title)}</strong><p>${esc(i.reason)}</p><p>${esc(note ? `${note.owner}：${note.text}` : `待办：${i.next}`)}</p></li>` }).join('')}</ol></section>`
}

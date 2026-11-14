import type { IntakeDocument, IntakeItem } from './intake-contract.ts'
import { localRecordId } from './local-record-id.ts'

export const assessmentRuleVersion = 'consultation-1.0'
export const dimensions = [
  ['safety', '安全底线'], ['budget', '预算合理性'], ['reserve', '预备金充足度'],
  ['extras', '增项风险敞口'], ['schedule', '工期可行性'], ['priority', '需求优先级'],
  ['information', '信息完整性'], ['consistency', '决策一致性'],
] as const
export type Dimension = typeof dimensions[number][0]
export type RiskLevel = 'low' | 'medium' | 'high' | 'pending' | 'na'
export type RiskAction = 'publish' | 'select' | 'construction'
export type RiskRequirement = { id: string; title: string; description: string; room: string; category: string; priority: 'must' | 'prefer'; pending: string[]; intake?: IntakeItem }
export type RiskProposal = { id: string; version: number; requirementVersion: number; vendorName: string; items: { requirementId: string; commitment: string; text: string }[] }
export type RiskResponse = { requirementId: string; status: string; reason: string; evidence: string; action: string }
export type AssessmentInput = {
  targetKey: string; targetLabel: string; requirementVersion: number | null; latestVersion: number | null;
  requirements: RiskRequirement[]; proposal?: RiskProposal; latestProposalId?: string; document?: IntakeDocument; context?: unknown; contextChanged?: boolean;
  responses: RiskResponse[]; notes: AssessmentNote[];
}
export type AssessmentIssue = {
  id: string; dimension: Dimension; level: RiskLevel; requirementIds: string[]; title: string;
  reason: string; evidence: string; next: string; owner: string; blocks: RiskAction[]; fingerprint: string;
}
export type AssessmentNote = { targetKey: string; issueId: string; fingerprint: string; owner: string; text: string; at: string }
export type DimensionResult = { id: Dimension; label: string; level: RiskLevel; detail: string }
export type AssessmentRun = {
  id: string; targetKey: string; targetLabel: string; requirementVersion: number | null;
  proposalVersion: number | null; ruleVersion: string; at: string; signature: string;
  dimensions: DimensionResult[]; issues: AssessmentIssue[]; notes: AssessmentNote[];
}
export const riskLabels: Record<RiskLevel, string> = { low: '低风险', medium: '需调整', high: '高风险', pending: '待评估', na: '不适用' }
export const assessmentOwners = ['业主', '商家', '现场人员', '专业人员', '待分配']
const ownerLabel: Record<string, string> = { user: '业主', merchant: '商家', site: '现场人员', professional: '专业人员', unassigned: '待分配' }
const source = '咨询检查规则；依据当前需求与方案记录，不构成施工鉴定。'

export function assessmentSignature(input: AssessmentInput): string {
  return JSON.stringify({ ...input, notes: [...input.notes].filter(n => n.targetKey === input.targetKey).sort((a, b) => a.issueId.localeCompare(b.issueId)), ruleVersion: assessmentRuleVersion })
}
export function assessmentIsStale(run: AssessmentRun, input: AssessmentInput): boolean {
  return run.signature !== assessmentSignature(input)
}
export function blockedIssues(run: AssessmentRun, action: RiskAction): AssessmentIssue[] {
  return run.issues.filter(issue => issue.blocks.includes(action))
}
export function evaluateAssessment(input: AssessmentInput, at = new Date().toISOString()): AssessmentRun {
  const issues: AssessmentIssue[] = []
  const add = (issue: Omit<AssessmentIssue, 'fingerprint'>) => {
    const related = input.requirements.filter(r => issue.requirementIds.includes(r.id))
    const replies = input.proposal?.items.filter(r => issue.requirementIds.includes(r.requirementId))
    issues.push({ ...issue, fingerprint: JSON.stringify({ issue, related, replies }) })
  }
  if (!input.requirements.length) add({ id: 'empty', dimension: 'information', level: 'pending', requirementIds: [], title: '尚未形成需求清单', reason: '至少需要一条明确的需求才能进行检查。', evidence: source, next: '先完成需求共创。', owner: '业主', blocks: ['publish', 'select'] })
  if (input.contextChanged) add({ id: 'context', dimension: 'consistency', level: 'high', requirementIds: [], title: '项目背景与草稿不一致', reason: '背景已修改，当前草稿还没有按新背景重新整理。', evidence: '当前背景与采用问卷时的背景不同。', next: '返回需求共创，整理并采用最新草稿。', owner: '业主', blocks: ['publish'] })
  if (input.proposal && input.requirementVersion !== input.latestVersion) add({ id: 'version', dimension: 'consistency', level: 'high', requirementIds: [], title: '方案引用了旧需求版本', reason: '可以查看这份历史评估，但不能据此确认当前方案选择。', evidence: `方案引用 R${input.requirementVersion}，当前为 R${input.latestVersion}。`, next: '请商家按当前需求重新提交方案。', owner: '商家', blocks: ['select'] })
  if (input.proposal && input.latestProposalId && input.proposal.id !== input.latestProposalId) add({ id: 'proposal-version', dimension: 'consistency', level: 'high', requirementIds: [], title: '这家商家已有新版方案', reason: '当前对象保留用于历史回看，选定时需要检查最新提交的版本。', evidence: `当前查看 V${input.proposal.version}，商家已有新提交。`, next: '在评估对象中选择这家商家的最新方案。', owner: '商家', blocks: ['select'] })
  for (const r of input.requirements) {
    if (!r.title.trim() || !r.description.trim()) add({ id: `empty:${r.id}`, dimension: 'information', level: 'high', requirementIds: [r.id], title: `${r.title || r.id}的描述不完整`, reason: '商家无法依据空白描述作出回应。', evidence: `需求 ${r.id} 缺少名称或具体描述。`, next: '补充原需求。', owner: '业主', blocks: ['publish', 'select'] })
    const pending = r.intake?.pending ?? r.pending.map(question => ({ question, owner: 'unassigned', blocking: false, kind: 'detail' }))
    pending.forEach((p, index) => {
      if (!p.question.trim()) return
      const professional = p.owner === 'professional'
      const mustDecide = p.blocking && ['user', 'unassigned'].includes(p.owner) && r.priority === 'must'
      add({ id: `pending:${r.id}:${index}`, dimension: professional ? 'safety' : 'information', level: mustDecide ? 'high' : 'medium', requirementIds: [r.id], title: p.question, reason: professional ? '原需求保留了专业核验事项。填写处理说明不会替代核验。' : mustDecide ? '这项必须需求仍有影响方案方向的业主决策。' : '这是原需求中的未决事项，可以安排核实后继续咨询。', evidence: `需求原文：${r.description}`, next: mustDecide ? '在需求共创中补充决定，重新整理并采用草稿。' : '指定责任人并记录需补充的资料，核实结果在原需求或方案中更新。', owner: ownerLabel[p.owner] || '待分配', blocks: mustDecide ? ['publish', 'select'] : professional ? ['construction'] : [] })
    })
    // Text signals only request verification; they never establish structural facts.
    if (!pending.some(p => p.owner === 'professional') && /承重|拆墙|拆除.*墙|墙.*拆除|燃气|消防|结构改造/.test(`${r.title} ${r.description}`)) add({ id: `safety:${r.id}`, dimension: 'safety', level: 'pending', requirementIds: [r.id], title: `${r.title}需要确认专业条件`, reason: '文本提到了可能涉及专业条件的内容，尚不能判断适用性或可行性。', evidence: r.description, next: '请专业人员核实涉及范围与所需资料；保留咨询意向。', owner: '专业人员', blocks: ['construction'] })
    if (r.intake && r.description !== r.intake.description) add({ id: `edited:${r.id}`, dimension: 'consistency', level: 'medium', requirementIds: [r.id], title: `${r.title}已修改，原依据需复核`, reason: '当前描述与采用时的条目不同，旧标准和待办不能视为已经重新确认。', evidence: `采用时：${r.intake.description}\n当前：${r.description}`, next: '返回需求共创整理最新表达，或请商家对当前文本逐项说明。', owner: '业主', blocks: [] })
  }
  for (const conflict of input.document?.result.conflicts || []) {
    const related = input.requirements.filter(r => conflict.itemIds.includes(r.id))
    if (!related.length) continue
    const must = related.some(r => r.priority === 'must')
    add({ id: `conflict:${conflict.id}`, dimension: 'consistency', level: must ? 'high' : 'medium', requirementIds: related.map(r => r.id), title: '需求之间还有取舍未完成', reason: conflict.message, evidence: '已采用问卷中的冲突记录。', next: '回到需求共创处理冲突，重新整理并采用。', owner: '业主', blocks: must ? ['publish', 'select'] : [] })
  }
  if (input.proposal) for (const r of input.requirements) {
    const replies = input.proposal.items.filter(p => p.requirementId === r.id)
    const reply = replies[0]
    const response = input.responses.find(f => f.requirementId === r.id)
    const denied = replies.length === 1 && (reply.commitment === 'no' || response?.status === 'conflict')
    if (replies.length === 1 && reply.text.trim() && reply.commitment === 'yes' && response?.status === 'responded') continue
    const high = denied && r.priority === 'must'
    add({ id: `response:${r.id}`, dimension: denied ? 'priority' : 'information', level: high ? 'high' : denied ? 'medium' : 'pending', requirementIds: [r.id], title: denied ? `${r.title}与商家回应冲突` : `${r.title}需要商家补充或复核`, reason: replies.length > 1 ? '同一需求存在重复回应，需要明确采用哪条。' : response?.reason || '商家尚未提供足够明确的逐项回应。', evidence: reply?.text || '尚无该项方案原文。', next: high ? '请商家修订方案，或由业主调整需求并发布新版本。处理说明不能替代这一步。' : '请商家在对应需求下补充说明并提交新版；自定义需求仍需人工核对。', owner: '商家', blocks: high ? ['select'] : [] })
  }
  const notes = input.notes.filter(n => n.targetKey === input.targetKey && issues.some(i => i.id === n.issueId && i.fingerprint === n.fingerprint))
  const ranks: RiskLevel[] = ['high', 'medium', 'pending', 'low', 'na']
  const rows: DimensionResult[] = dimensions.map(([id, label]) => {
    const group = issues.filter(issue => issue.dimension === id)
    const level = ranks.find(level => group.some(issue => issue.level === level))
    if (group.length) return { id, label, level: level!, detail: `${group.length} 项需处理或核实，展开查看依据。` }
    const unavailable: Partial<Record<Dimension, string>> = {
      budget: '尚无同范围、同口径的预算与估算依据，本轮不作价格判断。',
      reserve: '尚无工程估算和预备金口径，不将空值当作 0。',
      extras: '当前方案是文字回应，尚无结构化报价范围、型号与数量清单。',
      schedule: '尚无经核实的工序依赖与必要工期，仅有时间意向不足以计算。',
      safety: '当前资料不足以作专业安全判断；未发现提示不等于已核验。',
    }
    if (unavailable[id]) return { id, label, level: 'pending', detail: unavailable[id]! }
    if (id === 'priority' && !input.proposal) return { id, label, level: 'pending', detail: '已记录需求重要程度，待方案提交后检查必须项回应。' }
    return { id, label, level: 'low', detail: id === 'information' ? '本轮未发现空白描述或已记录的未决事项；不代表现场条件齐备。' : id === 'priority' ? '本轮未发现商家明确拒绝必须项；费用覆盖仍未评估。' : '本轮未发现已记录的取舍冲突或版本不一致。' }
  })
  return { id: localRecordId(), targetKey: input.targetKey, targetLabel: input.targetLabel, requirementVersion: input.requirementVersion, proposalVersion: input.proposal?.version ?? null, ruleVersion: assessmentRuleVersion, at, signature: assessmentSignature(input), dimensions: rows, issues, notes: structuredClone(notes) }
}

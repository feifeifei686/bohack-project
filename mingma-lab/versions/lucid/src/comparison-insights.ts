import { reviewProposal, type Finding, type Proposal, type Requirement } from './domain.ts'

export type ComparisonInsight = {
  requirementId: string
  requirementTitle: string
  kind: 'must-conflict' | 'conflict' | 'missing' | 'uncertain' | 'difference'
  title: string
  summary: string
  action: string
  vendors: { vendorName: string; proposalId: string; status: Finding['status']; evidence: string; reason: string }[]
}

/** A historical submission must never become a conclusion about a newer requirement. */
export function latestCurrentProposals(proposals: readonly Proposal[], requirementVersion: number | null): Proposal[] {
  if (!Number.isInteger(requirementVersion) || !requirementVersion || requirementVersion < 1) return []
  const latest = new Map<string, Proposal>()
  for (const proposal of proposals) {
    const previous = latest.get(proposal.vendorId)
    if (!previous || proposal.requirementVersion > previous.requirementVersion ||
      (proposal.requirementVersion === previous.requirementVersion && proposal.version >= previous.version)) {
      latest.set(proposal.vendorId, proposal)
    }
  }
  return [...latest.values()].filter(proposal => proposal.requirementVersion === requirementVersion)
}

const labels: Record<Finding['status'], string> = {
  responded: '已回应', partial: '说明不完整', conflict: '与需求冲突', unknown: '待补充或人工核对',
}

/** Deterministic summaries point back to the same evidence used by the comparison table. */
export function comparisonInsights(
  requirements: readonly Requirement[], proposals: readonly Proposal[], requirementVersion: number | null, limit = 3,
): ComparisonInsight[] {
  const current = latestCurrentProposals(proposals, requirementVersion)
  if (!current.length) return []
  const reviews = current.map(proposal => ({ proposal, findings: reviewProposal([...requirements], proposal) }))
  const entries = requirements.flatMap((requirement, index) => {
    const vendors = reviews.map(({ proposal, findings }) => {
      const finding = findings.find(item => item.requirementId === requirement.id)!
      return { vendorName: proposal.vendorName, proposalId: proposal.id, status: finding.status, evidence: finding.evidence, reason: finding.reason, action: finding.action }
    })
    const conflict = vendors.some(vendor => vendor.status === 'conflict')
    const missing = vendors.some(vendor => vendor.status === 'partial')
    const uncertain = vendors.some(vendor => vendor.status === 'unknown')
    const different = vendors.length > 1 && new Set(vendors.map(vendor => vendor.evidence.trim())).size > 1
    if (!conflict && !missing && !uncertain && !different) return []
    const kind: ComparisonInsight['kind'] = conflict ? requirement.priority === 'must' ? 'must-conflict' : 'conflict' : missing ? 'missing' : uncertain ? 'uncertain' : 'difference'
    const title = `${kind === 'must-conflict' ? '必须项存在冲突' : kind === 'conflict' ? '偏好需要取舍' : kind === 'missing' ? '回应遗漏要点' : kind === 'uncertain' ? '信息仍待核对' : '两家做法表述不同'} · ${requirement.title}`
    const unresolved = vendors.filter(vendor => vendor.status !== 'responded')
    const summary = vendors.map(vendor => `${vendor.vendorName}：${labels[vendor.status]}${vendor.status === 'responded' ? '' : `，${vendor.reason.split(' 待确认：')[0]}`}`).join('；')
    const action = unresolved.length
      ? unresolved.map(vendor => `${vendor.vendorName}：${vendor.action}`).join(' ')
      : '两家都回应了规则检查点，请查看原文，确认做法差别是否影响你的选择。'
    const rank = kind === 'must-conflict' ? 0 : kind === 'conflict' ? 1 : kind === 'missing' ? 2 : kind === 'uncertain' ? 3 : 4
    return [{ insight: { requirementId: requirement.id, requirementTitle: requirement.title, kind, title, summary, action, vendors }, rank, index }]
  })
  return entries.sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, Math.max(0, Math.min(3, Number.isFinite(limit) ? Math.floor(limit) : 3)))
    .map(entry => entry.insight)
}

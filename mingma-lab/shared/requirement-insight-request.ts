import type { RequirementInsightRequest, RequirementInsightResponse } from './requirement-insight-contract.ts'

/** Validate the response against the exact published version before displaying it. */
export function validRequirementInsight(value: unknown, input: RequirementInsightRequest): value is RequirementInsightResponse {
  if (!value || typeof value !== 'object') return false
  const response = value as RequirementInsightResponse
  const data = response.data
  const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
  const texts = (value: unknown): value is string[] => Array.isArray(value) && value.every(text)
  const ids = new Set(input.requirements.map(item => item.id))
  const sources = new Map(input.requirements.map(item => [item.id, [item.title, item.description, item.source, ...item.pending].join('\n')]))
  const evidence = (value: unknown) => Array.isArray(value) && value.length > 0 && value.every(item => item && text(item.sourceId) && text(item.quote) && sources.get(item.sourceId)?.includes(item.quote))
  if (!text(response.requestId) || response.meta?.requiresHumanConfirmation !== true || !text(response.meta.model)) return false
  if (!data || data.requirementVersion !== input.requirementVersion || !text(data.summary) || !Array.isArray(data.findings) || !Array.isArray(data.connections) || !Array.isArray(data.nextSteps) || !texts(data.warnings)) return false
  if (data.findings.length !== ids.size || new Set(data.findings.map(item => item?.requirementId)).size !== ids.size) return false
  if (!data.findings.every(item => item && ids.has(item.requirementId) && ['clear', 'needs_detail'].includes(item.clarity) && text(item.rationale) && texts(item.checks) && evidence(item.evidence) && item.evidence.every(e => e.sourceId === item.requirementId))) return false
  if (!data.connections.every(item => item && ids.has(item.fromId) && ids.has(item.toId) && item.fromId !== item.toId && ['dependency', 'synergy', 'tradeoff'].includes(item.kind) && text(item.reason) && evidence(item.evidence))) return false
  if (!data.nextSteps.every(item => item && text(item.title) && text(item.reason) && texts(item.requirementIds) && item.requirementIds.length > 0 && item.requirementIds.every(id => ids.has(id)))) return false
  if (input.requirements.some(req => req.pending.some(pending => !data.findings.find(item => item.requirementId === req.id)?.checks.includes(pending)))) return false
  const clear = data.findings.filter(item => item.clarity === 'clear').length
  const expected = {
    total: input.requirements.length, must: input.requirements.filter(item => item.priority === 'must').length,
    clear, needsDetail: input.requirements.length - clear, connections: data.connections.length,
    pendingChecks: new Set(data.findings.flatMap(item => item.checks)).size,
    clarityPercent: Math.round(clear / input.requirements.length * 100),
  }
  return !!data.metrics && Object.entries(expected).every(([key, count]) => data.metrics[key as keyof typeof expected] === count)
}

export async function requestRequirementInsight(input: RequirementInsightRequest, signal: AbortSignal): Promise<RequirementInsightResponse> {
  const timeout = AbortSignal.timeout(125000)
  try {
    const response = await fetch('/api/ai/requirement-insight', {
      method: 'POST', credentials: 'omit', redirect: 'error',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input), signal: AbortSignal.any([signal, timeout]),
    })
    const result = await response.json().catch(() => null)
    if (!response.ok) {
      const reason = typeof result?.error?.message === 'string' ? result.error.message : `分析暂未完成（${response.status}）。`
      throw new Error(`${reason} 已发布的需求仍然保留，可重试分析。`)
    }
    if (!validRequirementInsight(result, input)) throw new Error('这次分析未通过版本与依据核对，请重试。已发布的需求不受影响。')
    return result
  } catch (error) {
    signal.throwIfAborted()
    if (timeout.aborted) throw new Error('Flash 本次响应超时。需求已发布，你可以重试分析或继续查看方案。')
    if (error instanceof TypeError) throw new Error('暂时无法连接 Flash。需求已发布，请检查网络后重试。')
    throw error
  }
}

import { z } from 'zod'
import type { Config } from './config.ts'
import { ApiError } from './errors.ts'

export type Message = { role: 'system' | 'user'; content: string }
const Completion = z.object({
  model: z.string().trim().min(1).max(100).optional(),
  choices: z.array(z.object({
    finish_reason: z.string(),
    message: z.object({ content: z.string().nullable(), refusal: z.string().nullable().optional() }),
  })).min(1),
  usage: z.object({ prompt_tokens: z.number().int().nonnegative(), completion_tokens: z.number().int().nonnegative(), total_tokens: z.number().int().nonnegative() }),
})
async function readBoundedBody(response: Response): Promise<string> {
  if (!response.body) throw new ApiError(502, 'AI_INVALID_OUTPUT', '模型未返回可解析的内容。', true)
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    length += value.byteLength
    if (length > 1024 * 1024) {
      await reader.cancel()
      throw new ApiError(502, 'AI_INVALID_OUTPUT', '模型返回内容过大，请缩小本次处理范围。')
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}
function upstreamError(status: number): ApiError {
  if (status === 401 || status === 403) return new ApiError(502, 'AI_UPSTREAM_AUTH', '模型服务鉴权失败，请检查服务端密钥配置。')
  if (status === 402) return new ApiError(502, 'AI_UPSTREAM_QUOTA', '模型账户额度不足，请检查服务方账户。')
  if (status === 429) return new ApiError(429, 'AI_UPSTREAM_RATE_LIMIT', '模型服务暂时限流，请稍后重试。', true)
  if (status >= 500) return new ApiError(503, 'AI_UPSTREAM_UNAVAILABLE', '模型服务暂时不可用，请稍后重试。', true)
  return new ApiError(502, 'AI_UPSTREAM_REJECTED', '模型服务拒绝了本次请求，请检查模型配置或缩小输入范围。')
}
export async function complete(config: Config, messages: Message[], clientSignal?: AbortSignal) {
  if (!config.apiKey) throw new ApiError(503, 'AI_NOT_CONFIGURED', '尚未配置服务端模型密钥。')
  const timeout = AbortSignal.timeout(config.timeoutMs)
  const signal = clientSignal ? AbortSignal.any([timeout, clientSignal]) : timeout
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST', redirect: 'error', signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model, messages, stream: false, thinking: { type: 'disabled' },
        response_format: { type: 'json_object' }, temperature: 0.2, max_tokens: config.maxOutputTokens,
      }),
    })
    if (!response.ok) { await response.body?.cancel(); throw upstreamError(response.status) }
    let envelope: unknown
    try { envelope = JSON.parse(await readBoundedBody(response)) }
    catch (error) { if (error instanceof SyntaxError) throw new ApiError(502, 'AI_INVALID_OUTPUT', '模型服务未返回有效 JSON。', true); throw error }
    const parsed = Completion.safeParse(envelope)
    if (!parsed.success) throw new ApiError(502, 'AI_INVALID_OUTPUT', '模型响应结构不完整。', true)
    const choice = parsed.data.choices[0]!
    if (choice.message.refusal || choice.finish_reason === 'content_filter') throw new ApiError(502, 'AI_REFUSED', '模型未能处理本次内容，请调整输入后重试。')
    if (choice.finish_reason !== 'stop') throw new ApiError(502, 'AI_OUTPUT_TRUNCATED', '模型输出未完整结束，请减少本次需求或方案内容。', true)
    if (!choice.message.content?.trim()) throw new ApiError(502, 'AI_INVALID_OUTPUT', '模型返回空内容，请稍后重试。', true)
    let raw: unknown
    try { raw = JSON.parse(choice.message.content) }
    catch { throw new ApiError(502, 'AI_INVALID_OUTPUT', '模型内容不是有效 JSON，请重试。', true) }
    const usage = parsed.data.usage
    return { raw, model: parsed.data.model || config.model, usage: { promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens, totalTokens: usage.total_tokens } }
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (timeout.aborted) throw new ApiError(504, 'AI_TIMEOUT', '模型响应超时，请稍后重试。', true)
    if (clientSignal?.aborted) throw new ApiError(499, 'REQUEST_CANCELLED', '请求已取消。')
    throw new ApiError(503, 'AI_UPSTREAM_UNAVAILABLE', '暂时无法连接模型服务，请稍后重试。', true)
  }
}

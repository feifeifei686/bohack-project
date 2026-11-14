import type { z } from 'zod'
import type { schemas, Metadata, Operation } from './src/schemas.ts'

export type AiInput<K extends Operation> = z.input<(typeof schemas)[K]['input']>
export type AiData<K extends Operation> = z.output<(typeof schemas)[K]['output']>
export type AiResponse<K extends Operation> = {
  requestId: string
  data: AiData<K>
  meta: z.output<typeof Metadata>
}

export class AiClientError extends Error {
  status: number
  code: string
  requestId?: string
  retryable: boolean
  details?: { path: string; message: string }[]

  constructor(options: {
    status: number; code: string; message: string; requestId?: string
    retryable?: boolean; details?: { path: string; message: string }[]
  }) {
    super(options.message)
    this.name = 'AiClientError'
    this.status = options.status
    this.code = options.code
    this.requestId = options.requestId
    this.retryable = options.retryable ?? false
    this.details = options.details
  }
}

export type AiClientOptions = {
  /** Empty means same-origin. For a separate local service use http://127.0.0.1:5199. */
  baseUrl?: string
  /** Local service token only. Never pass the DeepSeek API key to a browser. */
  getAccessToken?: () => string | Promise<string>
  timeoutMs?: number
  fetcher?: typeof fetch
}

/** No automatic retries: each retry can start another billable model request. */
export function createAiClient(options: AiClientOptions = {}) {
  const baseUrl = (options.baseUrl ?? '').replace(/\/+$/, '')
  const fetcher = options.fetcher ?? fetch

  async function request<K extends Operation>(operation: K, input: AiInput<K>, signal?: AbortSignal): Promise<AiResponse<K>> {
    const controller = new AbortController()
    const abort = () => controller.abort()
    if (signal?.aborted) controller.abort()
    signal?.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(abort, options.timeoutMs ?? 65000)
    try {
      const token = await options.getAccessToken?.()
      const response = await fetcher(`${baseUrl}/api/ai/${operation}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(input), signal: controller.signal,
        credentials: 'omit', redirect: 'error',
      })
      let body: unknown
      try { body = await response.json() } catch (error) {
        if (controller.signal.aborted) throw error
        if (error instanceof SyntaxError) {
          throw new AiClientError({ status: response.status, code: 'INVALID_RESPONSE', message: '接口未返回有效 JSON。', retryable: false })
        }
        // A response body can fail after its headers arrive; preserve transport failures.
        throw error
      }
      const result = body as Partial<AiResponse<K>> & {
        error?: { code?: string; message?: string; retryable?: boolean; details?: { path: string; message: string }[] }
      }
      if (!response.ok) {
        throw new AiClientError({
          status: response.status, code: result?.error?.code ?? 'HTTP_ERROR',
          message: result?.error?.message ?? 'AI 请求未成功。',
          requestId: result?.requestId, retryable: result?.error?.retryable ?? false,
          details: result?.error?.details,
        })
      }
      if (!result || typeof result.requestId !== 'string' || !result.data || result.meta?.requiresHumanConfirmation !== true) {
        throw new AiClientError({ status: response.status, code: 'INVALID_RESPONSE', message: '接口响应缺少必要字段。' })
      }
      return result as AiResponse<K>
    } catch (error) {
      if (error instanceof AiClientError) throw error
      throw new AiClientError({
        status: 0, code: controller.signal.aborted ? 'REQUEST_ABORTED' : 'NETWORK_ERROR',
        message: controller.signal.aborted ? '请求已取消或超时。' : '无法连接 AI 接口。',
        retryable: true,
      })
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
    }
  }

  return {
    intake: (input: AiInput<'intake'>, signal?: AbortSignal) => request('intake', input, signal),
    clarify: (input: AiInput<'clarify'>, signal?: AbortSignal) => request('clarify', input, signal),
    requirements: (input: AiInput<'requirements'>, signal?: AbortSignal) => request('requirements', input, signal),
    review: (input: AiInput<'review'>, signal?: AbortSignal) => request('review', input, signal),
    explain: (input: AiInput<'explain'>, signal?: AbortSignal) => request('explain', input, signal),
  }
}

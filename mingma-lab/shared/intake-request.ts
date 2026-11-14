import type { IntakeRequest, IntakeResponse } from './intake-contract.ts'
import { validResult } from './intake-state.ts'

class IntakeFailure extends Error {
  constructor(message: string, readonly retryable: boolean, readonly delay = 0, readonly requestId = '') {
    super(message)
  }
}

function waitForRetry(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted()
    const cancel = () => { clearTimeout(timer); reject(signal.reason) }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', cancel)
      resolve()
    }, ms)
    signal.addEventListener('abort', cancel, { once: true })
  })
}

export async function requestIntake(payload: IntakeRequest, signal: AbortSignal, onRetry: (attempt: number) => void) {
  const body = JSON.stringify(payload)
  for (let retry = 0; ; retry++) {
    signal.throwIfAborted()
    const timeout = AbortSignal.timeout(65000)
    try {
      const response = await fetch('/api/ai/intake', {
        method: 'POST', credentials: 'omit', redirect: 'error',
        signal: AbortSignal.any([signal, timeout]), headers: { 'Content-Type': 'application/json' }, body,
      })
      const result = await response.json().catch(() => null) as (Partial<IntakeResponse> & { error?: { message?: string; retryable?: boolean } }) | null
      const requestId = typeof result?.requestId === 'string' ? result.requestId : ''
      if (!response.ok) {
        const after = response.headers.get('Retry-After')
        const seconds = Number(after)
        const delay = !after ? 0 : Number.isFinite(seconds) ? seconds * 1000 : Date.parse(after) - Date.now()
        const retryable = result?.error?.retryable ?? [408, 429, 502, 503, 504].includes(response.status)
        throw new IntakeFailure(result?.error?.message || `这次整理没有完成（${response.status}），原输入和草稿已保留。`, retryable, Math.max(0, delay || 0), requestId)
      }
      if (result?.meta?.requiresHumanConfirmation !== true || !validResult(result.data)) {
        throw new IntakeFailure('返回结果不符合需求清单格式，已有草稿仍保留。', true, 0, requestId)
      }
      return { data: result.data, meta: result.meta, requestId }
    } catch (error) {
      signal.throwIfAborted()
      const failure = timeout.aborted
        ? new IntakeFailure('本次整理等待超时，已有输入和草稿仍保留。', true)
        : error instanceof IntakeFailure ? error : new IntakeFailure('暂时无法连接 AI 服务，已有输入和草稿仍保留。', true)
      if (!failure.retryable || retry >= 2 || failure.delay > 60000) throw failure
      onRetry(retry + 1)
      await waitForRetry(Math.max(1000 * 2 ** retry, failure.delay), signal)
    }
  }
}

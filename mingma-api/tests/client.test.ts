import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type ServerResponse } from 'node:http'
import { AiClientError, createAiClient } from '../client.ts'

const requestId = '11111111-1111-4111-8111-111111111111'
const success = {
  requestId,
  data: { summary: '厨房需求待澄清。', facts: [], questions: [], readyForDraft: true, pending: ['尺寸待确认'], warnings: [] },
  meta: { model: 'simulation', promptVersion: 'test', durationMs: 1, requiresHumanConfirmation: true, usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } },
}

test('client sends JSON to local service and leaves provider credentials outside the request', async () => {
  let called = false
  const fetcher: typeof fetch = async (url, init) => {
    called = true
    assert.equal(url, 'http://127.0.0.1:5199/api/ai/clarify')
    assert.equal(init?.method, 'POST')
    const headers = new Headers(init?.headers)
    assert.equal(headers.get('Authorization'), null)
    assert.equal(headers.get('Content-Type'), 'application/json')
    assert.deepEqual(JSON.parse(String(init?.body)), { room: '厨房', brief: '希望好打理。' })
    return Response.json(success)
  }
  const result = await createAiClient({ baseUrl: 'http://127.0.0.1:5199/', fetcher }).clarify({ room: '厨房', brief: '希望好打理。' })
  assert.equal(called, true)
  assert.equal(result.meta.requiresHumanConfirmation, true)
  assert.deepEqual(result.data.pending, ['尺寸待确认'])
})

test('client exposes version conflict for user correction and never retries automatically', async () => {
  let calls = 0
  const fetcher: typeof fetch = async () => {
    calls++
    return Response.json({ requestId, error: { code: 'REQUIREMENT_VERSION_MISMATCH', message: '需求版本不一致。', retryable: false } }, { status: 409 })
  }
  const client = createAiClient({ fetcher })
  await assert.rejects(client.clarify({ room: '厨房', brief: '希望好打理。' }), (error: unknown) => {
    assert.ok(error instanceof AiClientError)
    assert.equal(error.status, 409)
    assert.equal(error.code, 'REQUIREMENT_VERSION_MISMATCH')
    assert.equal(error.requestId, requestId)
    assert.equal(error.retryable, false)
    return true
  })
  assert.equal(calls, 1)
})

test('client rejects a success body that omits the human confirmation boundary', async () => {
  const fetcher: typeof fetch = async () => Response.json({ requestId, data: {}, meta: {} })
  await assert.rejects(createAiClient({ fetcher }).clarify({ room: '厨房', brief: '好打理。' }), (error: unknown) => error instanceof AiClientError && error.code === 'INVALID_RESPONSE')
})

test('client timeout cancels the fetch instead of silently returning demo data', async () => {
  const fetcher: typeof fetch = async (_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
  })
  await assert.rejects(createAiClient({ fetcher, timeoutMs: 5 }).clarify({ room: '厨房', brief: '好打理。' }), (error: unknown) => error instanceof AiClientError && error.code === 'REQUEST_ABORTED')
})

async function servePartialBody(t: TestContext, finish: (response: ServerResponse) => void, delayMs: number) {
  const server = createServer((request, response) => {
    request.resume()
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.flushHeaders()
    response.write('{')
    const timer = setTimeout(() => finish(response), delayMs)
    response.on('close', () => clearTimeout(timer))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
    server.closeAllConnections()
  }))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  return `http://127.0.0.1:${address.port}`
}

test('client timeout while reading a real slow HTTP body remains REQUEST_ABORTED', async t => {
  const baseUrl = await servePartialBody(t, response => response.end('}'), 300)
  let headersReceived = false
  const fetcher: typeof fetch = async (url, init) => {
    const response = await fetch(url, init)
    headersReceived = true
    return response
  }
  await assert.rejects(createAiClient({ baseUrl, fetcher, timeoutMs: 50 }).clarify({ room: '厨房', brief: '好打理。' }), (error: unknown) => {
    assert.ok(error instanceof AiClientError)
    assert.equal(error.code, 'REQUEST_ABORTED')
    assert.equal(error.retryable, true)
    return true
  })
  assert.equal(headersReceived, true, 'the request must reach response-body reading before its timeout')
})

test('caller cancellation after real HTTP headers is reported as REQUEST_ABORTED', async t => {
  const baseUrl = await servePartialBody(t, response => response.end('}'), 300)
  const controller = new AbortController()
  const fetcher: typeof fetch = async (url, init) => {
    const response = await fetch(url, init)
    setTimeout(() => controller.abort(), 10)
    return response
  }
  await assert.rejects(createAiClient({ baseUrl, fetcher }).clarify({ room: '厨房', brief: '好打理。' }, controller.signal), (error: unknown) => error instanceof AiClientError && error.code === 'REQUEST_ABORTED')
})

test('real response stream interruption is a retryable NETWORK_ERROR', async t => {
  const baseUrl = await servePartialBody(t, response => response.destroy(), 25)
  let headersReceived = false
  const fetcher: typeof fetch = async (url, init) => {
    const response = await fetch(url, init)
    headersReceived = true
    return response
  }
  await assert.rejects(createAiClient({ baseUrl, fetcher }).clarify({ room: '厨房', brief: '好打理。' }), (error: unknown) => {
    assert.ok(error instanceof AiClientError)
    assert.equal(error.code, 'NETWORK_ERROR')
    assert.equal(error.retryable, true)
    return true
  })
  assert.equal(headersReceived, true)
})

test('complete but malformed JSON remains a non-retryable INVALID_RESPONSE', async () => {
  const fetcher: typeof fetch = async () => new Response('{', { status: 200, headers: { 'Content-Type': 'application/json' } })
  await assert.rejects(createAiClient({ fetcher }).clarify({ room: '厨房', brief: '好打理。' }), (error: unknown) => {
    assert.ok(error instanceof AiClientError)
    assert.equal(error.code, 'INVALID_RESPONSE')
    assert.equal(error.retryable, false)
    return true
  })
})

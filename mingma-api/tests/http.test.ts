import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer, request } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createApp } from '../src/app.ts'
import { readConfig } from '../src/config.ts'

const input = { room: '厨房', brief: '厨房想增加洗碗机。', answers: [], maxQuestions: 2 }
const result = {
  summary: '确认洗碗机的安装条件。',
  facts: [{ dimension: '设备', value: '增加洗碗机', evidence: [{ sourceId: 'brief', quote: '增加洗碗机' }] }],
  questions: [{ id: 'size', dimension: '设备', question: '型号是否确定？', options: ['已确定', '暂不确定'], allowMultiple: false, reason: '需要进一步确认设备条件。' }],
  readyForDraft: false, pending: ['设备尺寸待确认'], warnings: [],
}
async function fixture(overrides: Record<string, string> = {}, delay = 0, providerModel = 'deepseek-flash') {
  let calls = 0
  let lastAuth = ''
  const upstream = createServer(async (req, res) => {
    calls++; lastAuth = req.headers.authorization || ''
    for await (const _chunk of req) { /* drain request without recording content */ }
    if (delay) await new Promise(r => setTimeout(r, delay))
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ model: providerModel, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result) } }], usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } }))
  })
  await new Promise<void>(r => upstream.listen(0, '127.0.0.1', r))
  const config = readConfig({
    DEEPSEEK_API_KEY: 'simulation-only', ALLOW_MOCK_PROVIDER: 'true',
    DEEPSEEK_BASE_URL: `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`, ...overrides,
  })
  const logs: unknown[] = []
  const app = createApp(config, event => logs.push(event))
  await new Promise<void>(r => app.listen(0, '127.0.0.1', r))
  const url = `http://127.0.0.1:${(app.address() as AddressInfo).port}`
  return {
    url, logs, calls: () => calls, lastAuth: () => lastAuth,
    close: async () => { app.closeAllConnections(); upstream.closeAllConnections(); await Promise.all([new Promise<void>(r => app.close(() => r())), new Promise<void>(r => upstream.close(() => r()))]) },
    post: (body: unknown = input, headers: Record<string, string> = {}) => fetch(`${url}/api/ai/clarify`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }),
  }
}

test('health reports configuration without exposing key; absent key fails before provider', async () => {
  const f = await fixture()
  try {
    const r = await fetch(`${f.url}/api/health`)
    assert.equal(r.status, 200); const b = await r.json()
    assert.equal(b.aiConfigured, true); assert.equal(JSON.stringify(b).includes('simulation-only'), false)
    assert.equal(f.calls(), 0)
  } finally { await f.close() }
  const app = createApp(readConfig({}))
  await new Promise<void>(r => app.listen(0, '127.0.0.1', r))
  try {
    const r = await fetch(`http://127.0.0.1:${(app.address() as AddressInfo).port}/api/ai/clarify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
    assert.equal(r.status, 503); assert.equal((await r.json()).error.code, 'AI_NOT_CONFIGURED')
  } finally { app.closeAllConnections(); await new Promise<void>(r => app.close(() => r())) }
})

test('real HTTP provider path yields a structured advisory result and metadata', async () => {
  const f = await fixture()
  try {
    const r = await f.post(); const b = await r.json()
    assert.equal(r.status, 200, JSON.stringify(b)); assert.equal(b.meta.requiresHumanConfirmation, true)
    assert.equal(b.data.facts[0].evidence[0].quote, '增加洗碗机')
    assert.equal(b.meta.usage.totalTokens, 30); assert.equal(f.calls(), 1)
    assert.equal(f.lastAuth(), 'Bearer simulation-only')
    assert.equal(JSON.stringify(f.logs).includes(input.brief), false)
    assert.equal(JSON.stringify(f.logs).includes('simulation-only'), false)
    assert.match(r.headers.get('x-request-id')!, /^[0-9a-f-]{36}$/)
  } finally { await f.close() }
})

test('blank provider model metadata is rejected rather than returning an invalid success', async () => {
  const f = await fixture({}, 0, ' ')
  try {
    const r = await f.post()
    assert.equal(r.status, 502); assert.equal((await r.json()).error.code, 'AI_INVALID_OUTPUT')
  } finally { await f.close() }
})

test('invalid JSON, media type, unknown fields and duplicate answers do not reach provider', async () => {
  const f = await fixture()
  try {
    const url = `${f.url}/api/ai/clarify`
    const badJson = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })
    assert.equal(badJson.status, 400)
    const media = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' })
    assert.equal(media.status, 415)
    assert.equal((await f.post({ ...input, model: 'attacker-model' })).status, 400)
    assert.equal((await f.post({ ...input, answers: [{ id: 'a', question: 'Q', answer: 'A' }, { id: 'a', question: 'Q', answer: 'B' }] })).status, 400)
    assert.equal(f.calls(), 0)
  } finally { await f.close() }
})

test('CORS allowlist and Host validation reject unwanted web origins', async () => {
  const f = await fixture()
  try {
    assert.equal((await f.post(input, { Origin: 'https://evil.example' })).status, 403)
    const badHostStatus = await new Promise<number>((resolve, reject) => {
      const req = request(`${f.url}/api/health`, { headers: { Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode!) })
      req.on('error', reject); req.end()
    })
    assert.equal(badHostStatus, 403)
    const r = await fetch(`${f.url}/api/ai/clarify`, { method: 'OPTIONS', headers: { Origin: 'http://127.0.0.1:5188', 'Access-Control-Request-Method': 'POST' } })
    assert.equal(r.status, 204); assert.equal(r.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5188')
    assert.equal(f.calls(), 0)
  } finally { await f.close() }
})

test('service access token is distinct from provider secret', async () => {
  const token = 'local-test-token-with-24-characters'
  const f = await fixture({ API_ACCESS_TOKEN: token })
  try {
    assert.equal((await f.post()).status, 401)
    assert.equal((await f.post(input, { Authorization: 'Bearer wrong' })).status, 401)
    assert.equal((await f.post(input, { Authorization: `Bearer ${token}` })).status, 200)
    assert.equal(f.calls(), 1); assert.equal(f.lastAuth(), 'Bearer simulation-only')
  } finally { await f.close() }
})

test('wrong method, missing route, oversized declared body and chunked body are rejected', async () => {
  const f = await fixture()
  try {
    assert.equal((await fetch(`${f.url}/api/ai/clarify`)).status, 405)
    assert.equal((await fetch(`${f.url}/missing`)).status, 404)
    assert.equal((await f.post({ ...input, brief: 'x'.repeat(140000) })).status, 413)
    const status = await new Promise<number>((resolve, reject) => {
      const req = request(`${f.url}/api/ai/clarify`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' } }, res => { res.resume(); resolve(res.statusCode!) })
      req.on('error', reject); req.write('x'.repeat(140000)); req.end()
    })
    assert.equal(status, 413); assert.equal(f.calls(), 0)
  } finally { await f.close() }
})

test('concurrency limit releases its slot after completion', async () => {
  const f = await fixture({ AI_MAX_CONCURRENT: '1' }, 150)
  try {
    const first = f.post()
    while (!f.calls()) await new Promise(r => setTimeout(r, 5))
    const busy = await f.post()
    assert.equal(busy.status, 429); assert.equal((await busy.json()).error.code, 'AI_BUSY')
    assert.equal((await first).status, 200)
    assert.equal((await f.post()).status, 200)
  } finally { await f.close() }
})

test('rate limit returns Retry-After and prevents additional model calls', async () => {
  const f = await fixture({ AI_REQUESTS_PER_MINUTE: '1' })
  try {
    assert.equal((await f.post()).status, 200)
    const r = await f.post()
    assert.equal(r.status, 429); assert.equal(r.headers.get('retry-after'), '60')
    assert.equal((await r.json()).error.code, 'RATE_LIMITED'); assert.equal(f.calls(), 1)
  } finally { await f.close() }
})

test('timeout returns a bounded failure, without automatic retries', async () => {
  const f = await fixture({ AI_TIMEOUT_MS: '100' }, 400)
  try {
    const r = await f.post(); const b = await r.json()
    assert.equal(r.status, 504); assert.equal(b.error.code, 'AI_TIMEOUT'); assert.equal(f.calls(), 1)
  } finally { await f.close() }
})

test('provider host and non-local server bindings fail closed', () => {
  assert.throws(() => readConfig({ HOST: '0.0.0.0' }), /API_ACCESS_TOKEN/)
  assert.throws(() => readConfig({ DEEPSEEK_BASE_URL: 'https://evil.example' }), /official DeepSeek/)
  assert.throws(() => readConfig({ DEEPSEEK_BASE_URL: 'https://api.deepseek.com@evil.example' }), /official DeepSeek/)
  assert.throws(() => readConfig({ DEEPSEEK_BASE_URL: 'http://127.0.0.1:5202', DEEPSEEK_API_KEY: 'real-key-placeholder', ALLOW_MOCK_PROVIDER: 'true' }), /official DeepSeek/)
  assert.throws(() => readConfig({ CORS_ORIGINS: '*' }), /CORS_ORIGINS/)
})

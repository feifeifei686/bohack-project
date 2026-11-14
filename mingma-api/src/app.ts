import { floorplanMessages, validateFloorplanInput, validateFloorplanOutput } from './floorplan.ts'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { ApiError } from './errors.ts'
import { isLoopback, type Config } from './config.ts'
import { complete } from './provider.ts'
import { successSchema, type Operation } from './schemas.ts'
import { PROMPT_VERSION, validateInput, buildMessages, validateOutput } from './operations.ts'

export type SafeLog = (event: { requestId: string; method: string; path: string; status: number; durationMs: number }) => void
function send(res: ServerResponse, status: number, data: unknown) {
  if (res.destroyed || res.writableEnded) return
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
  res.end(JSON.stringify(data))
}
async function readJson(req: IncomingMessage, limit: number) {
  if (!/^application\/json(?:\s*;|\s*$)/i.test(req.headers['content-type'] || '') || (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity')) throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', '请使用 application/json 请求体。')
  if (Number(req.headers['content-length'] || 0) > limit) { req.resume(); throw new ApiError(413, 'PAYLOAD_TOO_LARGE', `请求体不能超过 ${Math.round(limit / 1024)} KiB。`) }
  const chunks = await new Promise<Buffer[]>((resolve, reject) => {
    const parts: Buffer[] = []
    let size = 0
    let failed = false
    req.on('data', (chunk: Buffer) => {
      if (failed) return
      size += chunk.byteLength
      if (size > limit) {
        failed = true
        parts.length = 0
        reject(new ApiError(413, 'PAYLOAD_TOO_LARGE', `请求体不能超过 ${Math.round(limit / 1024)} KiB。`))
      } else parts.push(chunk)
    })
    req.on('end', () => { if (!failed) resolve(parts) })
    req.on('error', () => { failed = true; reject(new ApiError(400, 'REQUEST_ABORTED', '请求体传输中断。')) })
  })
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown }
  catch { throw new ApiError(400, 'INVALID_JSON', '请求体必须是有效的 JSON。') }
}
function authenticated(req: IncomingMessage, token: string) {
  if (!token) return true
  const provided = req.headers.authorization || ''
  const expected = `Bearer ${token}`
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.byteLength === b.byteLength && timingSafeEqual(a, b)
}
export function createApp(config: Config, log: SafeLog = () => {}) {
  let active = 0
  const limits = new Map<string, { count: number; reset: number }>()
  return createServer({ requestTimeout: 15000, headersTimeout: 10000 }, async (req, res) => {
    const requestId = randomUUID()
    const started = performance.now()
    const abort = new AbortController()
    const path = (req.url || '/').split('?')[0] || '/'
    const isFloorplan = path === '/api/ai/floorplan'
    const publicPath = path === '/api/health' || path === '/api/openapi.json'
    const name = path.match(/^\/api\/ai\/(clarify|requirements|review|explain|intake)$/)?.[1] as Operation | undefined
    const logPath = publicPath || name || isFloorplan ? path : '/unknown'
    res.setHeader('X-Request-ID', requestId)
    res.setHeader('Vary', 'Origin')
    res.on('close', () => { if (!res.writableEnded) abort.abort() })
    res.on('finish', () => log({ requestId, method: req.method || '', path: logPath, status: res.statusCode, durationMs: Math.round(performance.now() - started) }))
    let reserved = false
    try {
      if (isLoopback(config.host)) {
        let hostname = ''
        try { hostname = new URL(`http://${req.headers.host || ''}`).hostname } catch {}
        if (!isLoopback(hostname)) throw new ApiError(403, 'HOST_NOT_ALLOWED', '不允许该服务主机名。')
      }
      const origin = req.headers.origin
      if (origin && !config.corsOrigins.includes(origin)) throw new ApiError(403, 'ORIGIN_NOT_ALLOWED', '该网页来源不在允许列表中。')
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin)
        res.setHeader('Access-Control-Expose-Headers', 'X-Request-ID')
      }
      if (!publicPath && !name && !isFloorplan) throw new ApiError(404, 'NOT_FOUND', '接口不存在。')
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', publicPath ? 'GET, OPTIONS' : 'POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        res.writeHead(204); res.end(); return
      }
      if ((publicPath && req.method !== 'GET') || ((name || isFloorplan) && req.method !== 'POST')) {
        res.setHeader('Allow', publicPath ? 'GET, OPTIONS' : 'POST, OPTIONS')
        throw new ApiError(405, 'METHOD_NOT_ALLOWED', '该接口不支持此请求方法。')
      }
      if (path === '/api/health') {
        send(res, 200, { status: 'ok', service: 'mingma-ai-api', version: '0.1.0', aiConfigured: Boolean(config.apiKey), model: config.model }); return
      }
      if (path === '/api/openapi.json') {
        const spec = JSON.parse(await readFile(new URL('../../docs/api/openapi.json', import.meta.url), 'utf8'))
        send(res, 200, spec); return
      }
      if (!authenticated(req, config.accessToken)) throw new ApiError(401, 'UNAUTHORIZED', '缺少或无效的服务访问令牌。')
      if (!config.apiKey) throw new ApiError(503, 'AI_NOT_CONFIGURED', '尚未配置服务端模型密钥。')
      const now = Date.now()
      for (const [key, bucket] of limits) if (bucket.reset <= now) limits.delete(key)
      const key = req.socket.remoteAddress || 'local'
      const bucket = limits.get(key) || { count: 0, reset: now + 60000 }
      if (bucket.count >= config.requestsPerMinute) throw new ApiError(429, 'RATE_LIMITED', '请求过于频繁，请稍后重试。', true)
      bucket.count++; limits.set(key, bucket)
      const raw = await readJson(req, isFloorplan ? 6 * 1024 * 1024 + 1024 : config.bodyLimitBytes)
      const operation = name!
      const imageInput = isFloorplan ? validateFloorplanInput(raw) : undefined
      const input = !isFloorplan ? validateInput(operation, raw) : undefined
      if (active >= config.maxConcurrent) throw new ApiError(429, 'AI_BUSY', '当前 AI 请求较多，请稍后重试。', true)
      active++; reserved = true
      if (isFloorplan) {
        const result = await complete({ ...config, model: 'deepseek-flash', timeoutMs: Math.min(120000, config.timeoutMs * 2), maxOutputTokens: 14000 }, floorplanMessages(imageInput!.image), abort.signal)
        send(res, 200, { requestId, data: validateFloorplanOutput(result.raw), meta: { model: result.model, requiresHumanConfirmation: true, durationMs: Math.round(performance.now() - started), usage: result.usage } }); return
      }
      const result = await complete(config, buildMessages(operation, input!), abort.signal)
      const data = validateOutput(operation, input!, result.raw)
      const response = successSchema(operation).safeParse({ requestId, data, meta: { model: result.model, promptVersion: PROMPT_VERSION, durationMs: Math.round(performance.now() - started), requiresHumanConfirmation: true, usage: result.usage } })
      if (!response.success) throw new ApiError(502, 'AI_INVALID_OUTPUT', '模型响应未通过最终契约校验。', true)
      send(res, 200, response.data)
    } catch (error) {
      const safe = error instanceof ApiError ? error : new ApiError(500, 'INTERNAL_ERROR', '服务内部错误，请使用请求编号排查。')
      if (safe.status === 429) res.setHeader('Retry-After', '60')
      send(res, safe.status, { requestId, error: { code: safe.code, message: safe.message, retryable: safe.retryable, ...(safe.details ? { details: safe.details } : {}) } })
    } finally {
      if (reserved) active--
    }
  })
}

export interface Config {
  host: string; port: number; apiKey: string; baseUrl: string; model: string
  timeoutMs: number; maxOutputTokens: number; maxConcurrent: number; requestsPerMinute: number
  accessToken: string; corsOrigins: string[]; bodyLimitBytes: number
}
const integer = (env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number) => {
  const raw = env[name] ?? String(fallback)
  if (!/^\d+$/.test(raw) || Number(raw) < min || Number(raw) > max) throw new Error(`Invalid ${name} configuration`)
  return Number(raw)
}
export const isLoopback = (host: string) => ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)
export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const host = env.HOST || '127.0.0.1'
  const accessToken = env.API_ACCESS_TOKEN?.trim() || ''
  if (accessToken && accessToken.length < 24) throw new Error('API_ACCESS_TOKEN must contain at least 24 characters')
  if (!isLoopback(host) && !accessToken) throw new Error('Non-loopback binding requires API_ACCESS_TOKEN')
  const apiKey = env.DEEPSEEK_API_KEY?.trim() || ''
  const baseUrl = (env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '')
  let url: URL
  try { url = new URL(baseUrl) } catch { throw new Error('Invalid DEEPSEEK_BASE_URL configuration') }
  const official = url.protocol === 'https:' && url.hostname === 'api.deepseek.com' && !url.port && ['', '/', '/v1'].includes(url.pathname)
  const localMock = env.ALLOW_MOCK_PROVIDER === 'true' && apiKey === 'simulation-only' && url.protocol === 'http:' && isLoopback(url.hostname)
  if (url.username || url.password || url.search || url.hash || (!official && !localMock)) throw new Error('Provider must be official DeepSeek HTTPS, or an explicitly enabled loopback simulation using the dummy key')
  const model = env.DEEPSEEK_MODEL || 'deepseek-flash'
  if (!/^[a-zA-Z0-9._-]{1,100}$/.test(model)) throw new Error('Invalid DEEPSEEK_MODEL configuration')
  const corsOrigins = (env.CORS_ORIGINS || 'http://127.0.0.1:5188,http://localhost:5188,http://127.0.0.1:5180,http://127.0.0.1:5190').split(',').map(x => x.trim()).filter(Boolean)
  if (corsOrigins.length > 20 || corsOrigins.some(value => {
    try { const u = new URL(value); return !['https:', 'http:'].includes(u.protocol) || value !== u.origin } catch { return true }
  })) throw new Error('CORS_ORIGINS must contain explicit HTTP(S) origins')
  return {
    host, port: integer(env, 'PORT', 5199, 1, 65535), apiKey, baseUrl, model, accessToken, corsOrigins,
    timeoutMs: integer(env, 'AI_TIMEOUT_MS', 60000, 100, 120000),
    maxOutputTokens: integer(env, 'AI_MAX_OUTPUT_TOKENS', 8192, 512, 16384),
    maxConcurrent: integer(env, 'AI_MAX_CONCURRENT', 2, 1, 10),
    requestsPerMinute: integer(env, 'AI_REQUESTS_PER_MINUTE', 20, 1, 120),
    bodyLimitBytes: 128 * 1024,
  }
}

import { createServer, request as proxyRequest } from 'node:http'
import { createReadStream } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, sep, extname } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { networkInterfaces } from 'node:os'
import { isIPv4 } from 'node:net'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' }
const hopHeaders = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade'])
function cleanHeaders(headers) {
  const omitted = new Set([...hopHeaders, ...(headers.connection || '').split(',').map(x => x.trim().toLowerCase())])
  return Object.fromEntries(Object.entries(headers).filter(([key]) => !omitted.has(key.toLowerCase())))
}
function json(res, status, body) {
  if (res.destroyed || res.writableEnded) return
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
  res.end(JSON.stringify(body))
}
export function workspaceId(root = projectRoot) { return createHash('sha256').update(root).digest('hex').slice(0, 12) }
const ipv4 = address => (address || '').replace(/^::ffff:/, '')
export function isLoopbackPeer(address) {
  const value = ipv4(address)
  return value === '::1' || (isIPv4(value) && value.startsWith('127.'))
}
export function isPrivateIPv4(address) {
  const value = ipv4(address)
  if (!isIPv4(value)) return false
  const [a, b] = value.split('.').map(Number)
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}
export function lanAddresses() {
  return [...new Set(Object.values(networkInterfaces()).flat().filter(x => x && x.family === 'IPv4' && !x.internal && isPrivateIPv4(x.address)).map(x => x.address))]
}

export function createLocalWeb({ root = projectRoot, apiPort = 5199, lanEnabled = false } = {}) {
  const dist = resolve(root, 'mingma-lab/dist')
  return createServer({ requestTimeout: 15000, headersTimeout: 10000 }, async (req, res) => {
    let host
    try { const authority = new URL(`http://${req.headers.host || ''}`); if (authority.username || authority.password || authority.pathname !== '/') throw new Error(); host = authority.hostname } catch {}
    const loopback = isLoopbackPeer(req.socket.remoteAddress)
    if (!loopback && (!lanEnabled || !isPrivateIPv4(req.socket.remoteAddress))) { json(res, 403, { error: 'Network access not allowed' }); return }
    const hosts = ['localhost', '127.0.0.1', '[::1]', ...(lanEnabled ? lanAddresses() : [])]
    if (!hosts.includes(host)) { json(res, 403, { error: 'Host not allowed' }); return }
    const rawPath = (req.url || '/').split('?')[0]
    let lanIntake = false
    if (!loopback && (rawPath.startsWith('/api/') || rawPath.startsWith('/__mingma_local/'))) {
      if (!['/api/ai/intake', '/api/ai/floorplan', '/api/ai/requirement-insight'].includes(rawPath) || req.method !== 'POST') {
        json(res, 403, { requestId: randomUUID(), error: { code: 'LOCAL_ONLY', message: '该接口仅限本机访问。局域网可直接使用需求共创、需求分析和户型识别。', retryable: false } }); return
      }
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) {
        json(res, 403, { requestId: randomUUID(), error: { code: 'ORIGIN_NOT_ALLOWED', message: '请从这台电脑提供的网页使用 AI。', retryable: false } }); return
      }
      lanIntake = true
    }
    if (rawPath === '/__mingma_local/health') {
      if (req.method !== 'GET') { json(res, 405, { error: 'Method not allowed' }); return }
      json(res, 200, { service: 'mingma-local-web', mode: 'static', workspaceId: workspaceId(root), lanEnabled, intakeEnabled: true }); return
    }
    if (rawPath.startsWith('/api/')) {
      const forwarded = cleanHeaders(req.headers)
      delete forwarded['x-mingma-access']
      // The private-network peer and same-origin request were checked above.
      // Keep the loopback API's CORS policy; discard any retired access header.
      if (lanIntake) delete forwarded.origin
      const upstream = proxyRequest({
        hostname: '127.0.0.1', port: apiPort, path: req.url, method: req.method,
        headers: { ...forwarded, host: `127.0.0.1:${apiPort}` },
      }, response => {
        if (res.destroyed) { response.destroy(); return }
        res.writeHead(response.statusCode || 502, cleanHeaders(response.headers))
        response.on('error', () => res.destroy())
        response.pipe(res)
      })
      const fail = () => {
        if (res.headersSent) { res.destroy(); return }
        json(res, 503, { requestId: randomUUID(), error: { code: 'LOCAL_API_UNAVAILABLE', message: '本机 AI 服务尚未就绪，请运行启动明码或查看明码状态。', retryable: true } })
      }
      upstream.setTimeout(125000, () => { upstream.destroy(); fail() })
      upstream.on('error', fail)
      req.on('aborted', () => upstream.destroy())
      req.on('error', () => upstream.destroy())
      res.on('close', () => { if (!res.writableEnded) upstream.destroy() })
      req.pipe(upstream)
      return
    }
    if (!['GET', 'HEAD'].includes(req.method || '')) { json(res, 405, { error: 'Method not allowed' }); return }
    try {
      const decoded = decodeURIComponent(rawPath)
      if (decoded.includes('\0') || decoded.split('/').some(part => part.startsWith('.'))) { json(res, 404, { error: 'Not found' }); return }
      let target = resolve(dist, `.${decoded}`)
      if (target !== dist && !target.startsWith(`${dist}${sep}`)) { json(res, 404, { error: 'Not found' }); return }
      if ((await stat(target)).isDirectory()) target = resolve(target, 'index.html')
      const actual = await realpath(target)
      const actualRoot = await realpath(dist)
      if (!actual.startsWith(`${actualRoot}${sep}`)) { json(res, 404, { error: 'Not found' }); return }
      const info = await stat(actual)
      if (!info.isFile()) { json(res, 404, { error: 'Not found' }); return }
      res.writeHead(200, { 'Content-Type': types[extname(actual)] || 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' })
      if (req.method === 'HEAD') { res.end(); return }
      const stream = createReadStream(actual)
      stream.on('error', () => res.destroy())
      res.on('close', () => stream.destroy())
      stream.pipe(res)
    } catch (error) {
      if (error instanceof URIError) json(res, 400, { error: 'Invalid path' })
      else json(res, 404, { error: 'Not found' })
    }
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.MINGMA_WEB_PORT || 5188)
  const apiPort = Number(process.env.MINGMA_API_PORT || 5199)
  if (![port, apiPort].every(n => Number.isInteger(n) && n > 0 && n < 65536)) throw new Error('Invalid local port')
  const lanEnabled = process.env.MINGMA_WEB_LAN === '1'
  const server = createLocalWeb({ apiPort, lanEnabled })
  server.on('error', () => { console.error('Local web could not listen; check port availability.'); process.exitCode = 1 })
  server.listen(port, lanEnabled ? '0.0.0.0' : '127.0.0.1', () => console.log(`Mingma local web: http://127.0.0.1:${port}/; LAN sharing: ${lanEnabled}`))
  const stop = () => { server.close(); server.closeAllConnections() }
  process.once('SIGTERM', stop); process.once('SIGINT', stop)
}

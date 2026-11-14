import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer, request } from 'node:http'
import { createLocalWeb, workspaceId, isLoopbackPeer, isPrivateIPv4, lanAddresses } from './local-web.mjs'

test('local deployment serves only the build and proxies API responses without adding credentials', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mingma-web-test-'))
  await mkdir(join(root, 'mingma-lab/dist/assets'), { recursive: true })
  await writeFile(join(root, 'mingma-lab/dist/index.html'), '<h1>Mingma</h1>')
  await writeFile(join(root, 'mingma-lab/dist/assets/app.js'), 'window.test=true')
  await writeFile(join(root, 'secret.txt'), 'private-value')
  await writeFile(join(root, 'mingma-lab/dist/.env'), 'private-value')
  await symlink(join(root, 'secret.txt'), join(root, 'mingma-lab/dist/leak.txt'))
  let calls = 0
  const api = createServer(async (req, res) => {
    calls++
    let body = ''
    for await (const chunk of req) body += chunk
    res.writeHead(409, { 'Content-Type': 'application/json', 'X-Request-ID': 'test-request' })
    res.end(JSON.stringify({ body, origin: req.headers.origin, authorization: req.headers.authorization, host: req.headers.host }))
  })
  await new Promise(resolve => api.listen(0, '127.0.0.1', resolve))
  const web = createLocalWeb({ root, apiPort: api.address().port })
  await new Promise(resolve => web.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${web.address().port}`
  try {
    assert.equal(await (await fetch(url)).text(), '<h1>Mingma</h1>')
    const head = await fetch(`${url}/assets/app.js`, { method: 'HEAD' })
    assert.equal(head.status, 200); assert.equal(await head.text(), '')
    assert.equal((await fetch(`${url}/__mingma_local/health`).then(r => r.json())).workspaceId, workspaceId(root))
    for (const path of ['/.env', '/leak.txt', '/%2e%2e%2fsecret.txt', '/missing']) assert.equal((await fetch(url + path)).status, 404, path)
    const invalidHost = await new Promise((resolve, reject) => {
      const req = request(`${url}/api/health`, { headers: { Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode) })
      req.on('error', reject); req.end()
    })
    assert.equal(invalidHost, 403); assert.equal(calls, 0)
    const response = await fetch(`${url}/api/ai/review`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:5188' }, body: '{"version":1}' })
    const data = await response.json()
    assert.equal(response.status, 409); assert.equal(response.headers.get('x-request-id'), 'test-request')
    assert.equal(data.body, '{"version":1}'); assert.equal(data.authorization, undefined)
    assert.equal(data.origin, 'http://127.0.0.1:5188'); assert.equal(data.host, `127.0.0.1:${api.address().port}`)
    api.closeAllConnections(); await new Promise(resolve => api.close(resolve))
    const unavailable = await fetch(`${url}/api/health`)
    assert.equal(unavailable.status, 503); assert.equal((await unavailable.json()).error.code, 'LOCAL_API_UNAVAILABLE')
  } finally {
    web.closeAllConnections(); api.closeAllConnections()
    await new Promise(resolve => web.close(resolve)); await new Promise(resolve => api.close(() => resolve()))
    await rm(root, { recursive: true })
  }
})

test('network classification accepts loopback and private IPv4 without trusting lookalike addresses', () => {
  for (const value of ['127.0.0.1', '127.0.0.2', '::1', '::ffff:127.0.0.1']) assert.equal(isLoopbackPeer(value), true)
  for (const value of ['10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.3', '::ffff:10.1.2.3']) assert.equal(isPrivateIPv4(value), true)
  for (const value of ['172.32.0.1', '8.8.8.8', '10.attacker.example', '10.300.0.1', '', undefined]) assert.equal(isPrivateIPv4(value), false)
  for (const value of ['10.1.2.3', '127.attacker.example', undefined]) assert.equal(isLoopbackPeer(value), false)
})

test('LAN peers can use intake without a code while other APIs and foreign origins stay restricted', async t => {
  const address = lanAddresses()[0]
  if (!address) { t.skip('No private IPv4 interface is available for the socket-level LAN check'); return }
  const root = await mkdtemp(join(tmpdir(), 'mingma-lan-test-'))
  await mkdir(join(root, 'mingma-lab/dist/assets'), { recursive: true })
  await writeFile(join(root, 'mingma-lab/dist/index.html'), '<h1>LAN demo</h1>')
  await writeFile(join(root, 'mingma-lab/dist/assets/app.js'), 'window.test=true')
  let calls = 0
  let forwardedHeaders = {}
  const api = createServer((req, res) => { calls++; forwardedHeaders = req.headers; req.resume(); res.end('{}') })
  await new Promise(resolve => api.listen(0, '127.0.0.1', resolve))
  const web = createLocalWeb({ root, apiPort: api.address().port, lanEnabled: true })
  await new Promise(resolve => web.listen(0, '0.0.0.0', resolve))
  const url = `http://${address}:${web.address().port}`
  const remoteRequest = (path, headers = {}, method = 'GET') => new Promise((resolve, reject) => {
    const req = request(url + path, { localAddress: address, headers, method }, res => {
      let body = ''; res.on('data', chunk => { body += chunk }); res.on('end', () => resolve({ status: res.statusCode, body }))
    })
    req.on('error', reject); req.end()
  })
  try {
    assert.equal((await remoteRequest('/')).status, 200)
    assert.equal((await remoteRequest('/assets/app.js')).status, 200)
    for (const path of ['/api/health', '/api/ai/clarify', '/__mingma_local/health']) {
      const result = await remoteRequest(path, { Host: `127.0.0.1:${web.address().port}`, 'X-Forwarded-For': '127.0.0.1', Origin: 'http://127.0.0.1:5188' })
      assert.equal(result.status, 403)
      assert.equal(JSON.parse(result.body).error.code, 'LOCAL_ONLY')
    }
    assert.equal(calls, 0)
    const noCode = await remoteRequest('/api/ai/intake', { 'Content-Type': 'application/json' }, 'POST')
    assert.equal(noCode.status, 200); assert.equal(calls, 1)
    const evilOrigin = await remoteRequest('/api/ai/intake', { Origin: 'https://evil.example' }, 'POST')
    assert.equal(evilOrigin.status, 403); assert.equal(calls, 1)
    const allowed = await remoteRequest('/api/ai/intake', { Origin: url }, 'POST')
    assert.equal(allowed.status, 200); assert.equal(calls, 2)
    const oldCode = await remoteRequest('/api/ai/intake', { 'X-Mingma-Access': 'retired', Origin: url }, 'POST')
    assert.equal(oldCode.status, 200); assert.equal(calls, 3)
    assert.equal(forwardedHeaders['x-mingma-access'], undefined); assert.equal(forwardedHeaders.origin, undefined)
    const otherEndpoint = await remoteRequest('/api/ai/review', { Origin: url }, 'POST')
    assert.equal(otherEndpoint.status, 403); assert.equal(calls, 3)
    const local = await fetch(`http://127.0.0.1:${web.address().port}/api/health`)
    assert.equal(local.status, 200); assert.equal(calls, 4)
    const floorplan = await remoteRequest('/api/ai/floorplan', {Origin:url}, 'POST')
    assert.equal(floorplan.status,200); assert.equal(calls,5)
    assert.equal((await remoteRequest('/api/ai/floorplan', {Origin:'https://evil.example'}, 'POST')).status,403)
    assert.equal((await remoteRequest('/api/ai/floorplan', {}, 'GET')).status,403)
    assert.equal((await remoteRequest('/api/ai/requirement-insight', { Origin: url }, 'POST')).status, 200)
    assert.equal((await remoteRequest('/api/ai/requirement-insight', { Origin: 'https://evil.example' }, 'POST')).status, 403)
    assert.equal((await remoteRequest('/api/ai/requirement-insight', {}, 'GET')).status, 403)
    const unknownHost = await remoteRequest('/', { Host: 'evil.example' }); assert.equal(unknownHost.status, 403)
  } finally {
    web.closeAllConnections(); api.closeAllConnections()
    await new Promise(resolve => web.close(resolve)); await new Promise(resolve => api.close(resolve))
    await rm(root, { recursive: true })
  }
})

import { existsSync, mkdirSync, readFileSync, writeFileSync, realpathSync, statSync, chmodSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve, dirname, join } from 'node:path'
import { createHash } from 'node:crypto'
import { createServer } from 'node:net'
import { workspaceId, lanAddresses } from './local-web.mjs'
import { waitForProcessesToExit } from './launchd-lifecycle.mjs'

const root = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'))
const runtime = join(root, '.local-run')
const logDir = join(runtime, 'logs')
const domain = `gui/${process.getuid()}`
const id = workspaceId(root)
const labels = { api: `local.mingma.${id}.api`, web: `local.mingma.${id}.web` }
const target = name => `${domain}/${labels[name]}`
const node = realpathSync(process.execPath)
const url = 'http://127.0.0.1:5188/'
const action = process.argv[2] || 'status'
const accessFile = join(runtime, 'access.json')
let lanEnabled = false
try { lanEnabled = JSON.parse(readFileSync(accessFile, 'utf8')).lanEnabled === true } catch {}
const openBrowser = process.argv.includes('--open')
const pause = ms => new Promise(r => setTimeout(r, ms))
const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const hash = value => createHash('sha256').update(value).digest('hex')

function ctl(args, allowMissing = false) {
  const result = spawnSync('/bin/launchctl', args, { encoding: 'utf8' })
  if (result.status !== 0 && !allowMissing) throw new Error(`macOS 服务操作失败：launchctl ${args[0]}。请查看 ${runtime} 中的配置与日志。`)
  return result
}
function loaded(name) { return ctl(['print', target(name)], true).status === 0 }
function info(name) {
  const response = ctl(['print', target(name)], true)
  return { loaded: response.status === 0, pid: Number(response.stdout?.match(/\bpid = (\d+)/)?.[1] || 0), state: response.stdout?.match(/\bstate = (\S+)/)?.[1] || 'stopped' }
}
async function health(endpoint, expected) {
  try { const r = await fetch(endpoint, { signal: AbortSignal.timeout(1500), redirect: 'error' }); return r.ok && expected(await r.json()) } catch { return false }
}
async function managedHealthy(name, port, endpoint, expected) {
  const service = info(name)
  if (!service.loaded || service.state !== 'running' || !service.pid) return false
  const listener = spawnSync('/usr/sbin/lsof', ['-nP', '-a', '-p', String(service.pid), `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' })
  if (listener.status !== 0 || !listener.stdout.trim().split('\n').includes(String(service.pid))) return false
  return health(endpoint, expected)
}
const apiHealthy = () => managedHealthy('api', 5199, 'http://127.0.0.1:5199/api/health', x => x.service === 'mingma-ai-api' && x.aiConfigured === true)
const webHealthy = () => managedHealthy('web', 5188, `${url}__mingma_local/health`, x => x.service === 'mingma-local-web' && x.workspaceId === id && x.lanEnabled === lanEnabled && x.intakeEnabled === true)
async function waitReady(check, label) {
  const deadline = Date.now() + 20000
  while (Date.now() < deadline) { if (await check()) return; await pause(300) }
  throw new Error(`${label}未能启动，请查看 ${logDir}。`)
}
async function freePort(port) {
  const probe = createServer()
  await new Promise((ok, fail) => {
    probe.once('error', () => fail(new Error(`${port} 端口被其他进程占用；为保护已有程序，未自动终止它。`)))
    probe.listen(port, port === 5188 && lanEnabled ? '0.0.0.0' : '127.0.0.1', ok)
  })
  await new Promise(ok => probe.close(ok))
}
function prepare() {
  mkdirSync(logDir, { recursive: true, mode: 0o700 }); chmodSync(runtime, 0o700); chmodSync(logDir, 0o700)
  const npm = join(dirname(node), 'npm')
  if (!existsSync(npm)) throw new Error('当前 Node.js 安装缺少 npm，请使用完整 Node.js 24 安装。')
  const env = { ...process.env, PATH: `${dirname(node)}:${process.env.PATH || '/usr/bin:/bin'}` }
  const statePath = join(runtime, 'dependencies.json')
  let state = {}
  try { state = JSON.parse(readFileSync(statePath, 'utf8')) } catch {}
  for (const project of ['mingma-api', 'mingma-lab']) {
    const cwd = join(root, project)
    const fingerprint = hash(readFileSync(join(cwd, 'package-lock.json'))) + process.versions.node.split('.')[0]
    if (state[project] !== fingerprint || !existsSync(join(cwd, 'node_modules'))) {
      console.log(`安装 ${project} 的锁定依赖…`)
      execFileSync(npm, ['ci', '--no-audit', '--no-fund'], { cwd, env, stdio: 'inherit' })
      state[project] = fingerprint
    }
    console.log(`构建 ${project}…`)
    execFileSync(npm, ['run', 'build'], { cwd, env, stdio: 'inherit' })
  }
  writeFileSync(statePath, JSON.stringify(state, null, 2), { mode: 0o600 })
}
function plist(name) {
  const args = name === 'api'
    ? [node, `--env-file=${join(root, 'mingma-api/.env')}`, join(root, 'mingma-api/src/server.ts')]
    : [node, join(root, 'scripts/local-web.mjs')]
  const values = name === 'api' ? { HOST: '127.0.0.1', PORT: '5199', NODE_ENV: 'production' } : { MINGMA_WEB_PORT: '5188', MINGMA_API_PORT: '5199', MINGMA_WEB_LAN: lanEnabled ? '1' : '0', NODE_ENV: 'production' }
  const file = join(runtime, `${name}.plist`)
  writeFileSync(file, `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>
<key>Label</key><string>${xml(labels[name])}</string>
<key>ProgramArguments</key><array>${args.map(x => `<string>${xml(x)}</string>`).join('')}</array>
<key>WorkingDirectory</key><string>${xml(name === 'api' ? join(root, 'mingma-api') : root)}</string>
<key>EnvironmentVariables</key><dict>${Object.entries(values).map(([k,v]) => `<key>${xml(k)}</key><string>${xml(v)}</string>`).join('')}</dict>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>10</integer>
<key>ProcessType</key><string>Background</string>
<key>StandardOutPath</key><string>${xml(join(logDir, `${name}.log`))}</string>
<key>StandardErrorPath</key><string>${xml(join(logDir, `${name}.error.log`))}</string>
</dict></plist>\n`, { mode: 0o600 })
  execFileSync('/usr/bin/plutil', ['-lint', file], { stdio: 'pipe' })
  return file
}
async function stop() {
  const exiting = []
  for (const name of ['web', 'api']) {
    const current = info(name)
    if (current.loaded) {
      if (current.pid) exiting.push(current.pid)
      ctl(['bootout', target(name)])
    }
  }
  await waitForProcessesToExit(exiting)
  console.log('明码本机服务已停止；浏览器中的项目数据保留。')
}
async function status() {
  const api = info('api'); const web = info('web')
  const checks = await Promise.all([apiHealthy(), webHealthy()])
  console.log(`网页：${web.loaded && checks[1] ? '运行中' : '未就绪'}${web.pid ? `（PID ${web.pid}）` : ''}`)
  console.log(`接口：${api.loaded && checks[0] ? '运行中' : '未就绪'}${api.pid ? `（PID ${api.pid}）` : ''}`)
  console.log(`打开：${url}\n日志：${logDir}`)
  console.log(lanEnabled ? `局域网网页：${lanAddresses().map(ip => `http://${ip}:5188/`).join(' 或 ') || '暂未检测到私有 IPv4 地址'}\n同一局域网可直接使用 AI 需求共创，无需访问码。` : '局域网共享：关闭')
  return web.loaded && api.loaded && checks.every(Boolean)
}
async function start(update = false) {
  if (!existsSync(join(root, 'mingma-api/.env'))) throw new Error('缺少 mingma-api/.env，请先配置服务端模型密钥。')
  if ((statSync(join(root, 'mingma-api/.env')).mode & 0o777) !== 0o600) chmodSync(join(root, 'mingma-api/.env'), 0o600)
  if (!update && loaded('api') && loaded('web') && await apiHealthy() && await webHealthy()) {
    console.log('明码已经运行，无需重复启动。'); if (openBrowser) execFileSync('/usr/bin/open', [url]); return
  }
  // Never stop unknown listeners or inspect their environment.
  for (const [name, port] of [['api', 5199], ['web', 5188]]) if (!loaded(name)) await freePort(port)
  prepare()
  await stop()
  const started = []
  try {
    for (const name of ['api', 'web']) {
      ctl(['bootstrap', domain, plist(name)]); started.push(name)
      await waitReady(name === 'api' ? apiHealthy : webHealthy, name === 'api' ? 'AI 接口' : '网页')
    }
  } catch (error) {
    for (const name of started.toReversed()) ctl(['bootout', target(name)], true)
    throw error
  }
  writeFileSync(join(runtime, 'deployment.json'), JSON.stringify({ workspaceId: id, node, labels, url, lanEnabled, deployedAt: new Date().toISOString(), autoStartAtLogin: false }, null, 2), { mode: 0o600 })
  if (!await status()) { await stop(); throw new Error('启动后的最终健康检查未通过，请查看本机服务日志。') }
  console.log('关闭终端后仍可使用。重启电脑或退出登录后，双击“启动明码.command”即可恢复。')
  if (openBrowser) execFileSync('/usr/bin/open', [url])
}
async function setLan(enabled) {
  const previous = lanEnabled
  lanEnabled = enabled
  mkdirSync(runtime, { recursive: true, mode: 0o700 })
  writeFileSync(accessFile, JSON.stringify({ lanEnabled }, null, 2), { mode: 0o600 })
  try { await start(true) }
  catch (error) {
    lanEnabled = previous
    writeFileSync(accessFile, JSON.stringify({ lanEnabled }, null, 2), { mode: 0o600 })
    throw error
  }
}
try {
  if (process.platform !== 'darwin') throw new Error('这些双击脚本用于 macOS；其他系统请按各工程 README 启动。')
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('需要 Node.js 24 或更新版本。')
  if (action === 'start') await start()
  else if (action === 'update') await start(true)
  else if (action === 'stop') await stop()
  else if (action === 'status') process.exitCode = await status() ? 0 : 1
  else if (action === 'lan-on') await setLan(true)
  else if (action === 'lan-off') await setLan(false)
  else throw new Error('命令应为 start、stop、status、update、lan-on 或 lan-off。')
} catch (error) {
  console.error(error instanceof Error ? error.message : '本机部署未完成。')
  process.exitCode = 1
}

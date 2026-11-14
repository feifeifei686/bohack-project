const alive = pid => {
  try { process.kill(pid, 0); return true }
  catch (error) { if (error.code === 'ESRCH') return false; throw error }
}

// launchctl bootout may return before a SIGTERM handler finishes. A new
// bootstrap of that label can then fail with I/O error 5 until the PID exits.
export async function waitForProcessesToExit(pids, {
  isAlive = alive, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  now = () => performance.now(), timeoutMs = 20000, intervalMs = 100,
} = {}) {
  const started = now()
  while (pids.some(isAlive)) {
    if (now() - started >= timeoutMs) throw new Error('旧服务进程仍在退出，未启动重复实例。请稍后再运行启动明码。')
    await sleep(intervalMs)
  }
}

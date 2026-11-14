import { createApp } from './app.ts'
import { readConfig } from './config.ts'

try {
  const config = readConfig()
  const server = createApp(config, event => process.stdout.write(`${JSON.stringify(event)}\n`))
  server.on('error', () => { process.stderr.write('AI API failed to listen; check HOST and PORT.\n'); process.exitCode = 1 })
  server.listen(config.port, config.host, () => {
    process.stdout.write(`Mingma AI API listening on ${config.host}:${config.port}; provider configured: ${Boolean(config.apiKey)}\n`)
  })
  const shutdown = () => { server.close(); server.closeAllConnections() }
  process.once('SIGTERM', shutdown)
  process.once('SIGINT', shutdown)
} catch (error) {
  // Configuration errors are authored by this service; never log env values.
  process.stderr.write(`${error instanceof Error ? error.message : 'Invalid service configuration'}\n`)
  process.exitCode = 1
}

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
for (const version of ['atmosphere', 'lucid', 'atelier']) {
  const result = spawnSync(process.execPath, [
    resolve(root, 'node_modules/typescript/bin/tsc'),
    '--noEmit', '-p', resolve(root, 'versions', version, 'tsconfig.json'),
  ], { cwd: root, stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
  process.stdout.write(`${version}: TypeScript passed\n`)
}

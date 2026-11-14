import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
const root = resolve(import.meta.dirname, '..')
const files = ['README.md', 'CONTRIBUTING.md', 'docs/README.md', 'SECURITY.md']
const tracked = new Set(execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean))
const failures = []
for (const file of files) {
  const content = readFileSync(resolve(root, file), 'utf8')
  for (const match of content.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].trim().replace(/^<|>$/g, '').split('#')[0]
    if (!target || /^[a-z]+:/i.test(target)) continue
    const path = resolve(root, dirname(file), decodeURIComponent(target))
    const relative = path.slice(root.length + 1)
    if (!path.startsWith(root + '/') || !existsSync(path)) failures.push(`${file}: missing local link ${target}`)
    else if (!tracked.has(relative) && ![...tracked].some(name => name.startsWith(relative + '/'))) failures.push(`${file}: link is not in Git: ${target}`)
  }
}
if (failures.length) { console.error(failures.join('\n')); process.exit(1) }
console.log(`Repository entry links checked: ${files.length} documents`)

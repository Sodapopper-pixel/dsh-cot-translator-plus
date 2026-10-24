/**
 * Mirror this package into an installed profile copy.
 * `--check` reports differences and exits 1 when the copy is stale; `--apply` writes them.
 * The browser bundle is written last so the running Host republishes the client module.
 */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const args = process.argv.slice(2)
const apply = args.includes('--apply')
const targetIndex = args.indexOf('--target')
const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const target = resolve(targetIndex >= 0 ? args[targetIndex + 1] : join(home, 'profiles', 'web', 'node_modules', 'dsh-cot-translator-plus'))
const SKIP = new Set(['scripts', 'tests', '.gitignore'])

function filesOf(directory) {
  const out = []
  for (const name of readdirSync(directory)) {
    if (SKIP.has(name)) continue
    const path = join(directory, name)
    if (statSync(path).isDirectory()) out.push(...filesOf(path))
    else out.push(path)
  }
  return out
}

function hash(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

const bundle = join(root, 'lib', 'client.js')
const files = filesOf(root).filter(path => path !== bundle).concat(bundle)
const stale = []
for (const source of files) {
  const destination = join(target, relative(root, source))
  if (!existsSync(destination) || hash(source) !== hash(destination)) stale.push(relative(join(root), source))
}

if (!existsSync(target)) {
  console.error(`installed copy not found: ${target}`)
  process.exit(2)
}
if (stale.length === 0) {
  console.log(`installed copy matches ${target}`)
  process.exit(0)
}
if (!apply) {
  console.log(`stale files (${stale.length}): ${stale.join(', ')}`)
  process.exit(1)
}
for (const name of stale) {
  const source = join(root, name)
  const destination = join(target, name)
  mkdirSync(dirname(destination), { recursive: true })
  copyFileSync(source, destination)
}
console.log(`synced ${stale.length} file(s) into ${target}`)

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TranslationCache, cacheKey } from '../src/cache.js'

async function tempFile() {
  const directory = await mkdtemp(join(tmpdir(), 'cot-cache-'))
  return join(directory, 'cache.json')
}

test('cacheKey is stable and separates every input part', () => {
  const base = ['bing', 'recipe', 'auto', 'zh', 'hello']
  assert.equal(cacheKey(base), cacheKey([...base]))
  assert.notEqual(cacheKey(base), cacheKey(['google', 'recipe', 'auto', 'zh', 'hello']))
  assert.notEqual(cacheKey(base), cacheKey(['bing', 'recipe', 'auto', 'zh', 'hello!']))
})

test('a cache retains, reorders, trims, and mirrors entries', async () => {
  const file = await tempFile()
  const cache = new TranslationCache(file, 2)
  await cache.load()
  cache.set('a', 'first')
  cache.set('b', 'second')
  assert.equal(cache.get('a'), 'first')
  cache.set('c', 'third')
  assert.equal(cache.get('b'), undefined, 'the least recently written entry is evicted')
  assert.equal(cache.get('a'), 'first')
  await cache.flush()
  const stored = JSON.parse(await readFile(file, 'utf8'))
  assert.equal(stored.version, 1)
  assert.deepEqual(stored.entries.map(entry => entry[0]).sort(), ['a', 'c'])
})

test('a new cache instance reads the mirrored entries', async () => {
  const file = await tempFile()
  const first = new TranslationCache(file, 10)
  await first.load()
  first.set('key', '译文')
  await first.flush()
  const second = new TranslationCache(file, 10)
  await second.load()
  assert.equal(second.get('key'), '译文')
})

test('cacheMaxEntries 0 disables reads and writes', async () => {
  const file = await tempFile()
  await writeFile(file, JSON.stringify({ version: 1, entries: [['k', 'v']] }))
  const cache = new TranslationCache(file, 0)
  await cache.load()
  assert.equal(cache.get('k'), undefined)
  cache.set('k', 'v')
  await cache.flush()
  const stored = JSON.parse(await readFile(file, 'utf8'))
  assert.deepEqual(stored.entries, [['k', 'v']], 'a disabled cache leaves the mirror untouched')
})

test('invalid mirrors and write failures are reported instead of thrown', async () => {
  const file = await tempFile()
  await writeFile(file, '{not json')
  const warnings = []
  const cache = new TranslationCache(file, 5, message => { warnings.push(message) })
  await cache.load()
  assert.equal(warnings.length, 1)
  assert.equal(cache.get('anything'), undefined)

  const unwritable = new TranslationCache(join(file, 'nested', 'cache.json'), 5, message => { warnings.push(message) })
  await unwritable.load()
  unwritable.set('a', 'b')
  await unwritable.flush()
  assert.equal(warnings.some(message => message.includes('could not write')), true)
})

test('clear drops memory and rewrites the mirror', async () => {
  const file = await tempFile()
  const cache = new TranslationCache(file, 5)
  await cache.load()
  cache.set('a', 'b')
  await cache.flush()
  await cache.clear()
  const stored = JSON.parse(await readFile(file, 'utf8'))
  assert.deepEqual(stored.entries, [])
})

test('a retained-text ceiling evicts oldest entries and refuses oversized ones', async () => {
  const file = await tempFile()
  const cache = new TranslationCache(file, 10, () => {}, 100)
  await cache.load()
  cache.set('a', 'x'.repeat(40))
  cache.set('b', 'y'.repeat(40))
  assert.notEqual(cache.get('a'), undefined)
  cache.set('c', 'z'.repeat(40))
  assert.equal(cache.get('b'), undefined, 'the least recently written entry makes room')
  assert.equal(cache.get('a'), 'x'.repeat(40))
  assert.notEqual(cache.get('c'), undefined)

  cache.set('huge', 'q'.repeat(101))
  assert.equal(cache.get('huge'), undefined, 'an entry above the ceiling cannot displace the working set')
  assert.notEqual(cache.get('a'), undefined)
})

test('loading a mirror above the retained-text ceiling trims it', async () => {
  const file = await tempFile()
  const entries = [['a', 'x'.repeat(40)], ['b', 'y'.repeat(40)], ['c', 'z'.repeat(40)]]
  await writeFile(file, JSON.stringify({ version: 1, entries }))
  const cache = new TranslationCache(file, 10, () => {}, 100)
  await cache.load()
  assert.equal(cache.get('a'), undefined, 'the oldest entry is dropped while loading')
  assert.equal(cache.get('b'), 'y'.repeat(40))
  assert.equal(cache.get('c'), 'z'.repeat(40))
})

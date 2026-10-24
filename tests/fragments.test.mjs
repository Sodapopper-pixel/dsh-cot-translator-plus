import test from 'node:test'
import assert from 'node:assert/strict'
import { ReasoningTranslation, reasoningFragments } from '../src/fragments.js'

test('reasoningFragments keeps paragraph separators and marks completed paragraphs', () => {
  const fragments = reasoningFragments('first\n\nsecond\n\nthird', true, 4000)
  assert.deepEqual(fragments.map(fragment => [fragment.text, fragment.suffix, fragment.complete]), [
    ['first', '\n\n', true],
    ['second', '\n\n', true],
    ['third', '', false],
  ])
})

test('reasoningFragments treats a finished tail as complete', () => {
  const fragments = reasoningFragments('only paragraph', false, 4000)
  assert.deepEqual(fragments, [{ text: 'only paragraph', suffix: '', complete: true }])
})

test('reasoningFragments splits oversized paragraphs at whitespace', () => {
  const text = 'alpha beta gamma delta'
  const fragments = reasoningFragments(text, false, 12)
  assert.equal(fragments.length > 1, true)
  assert.equal(fragments.map(fragment => fragment.text + fragment.suffix).join(''), text)
  for (const fragment of fragments) assert.equal(fragment.text.length <= 12, true)
})

test('reasoningFragments never splits a surrogate pair', () => {
  const text = `${'a'.repeat(11)}😀😀😀`
  const fragments = reasoningFragments(text, false, 12)
  for (const fragment of fragments) {
    assert.equal(fragment.text.length <= 12, true)
    assert.equal(/^[\uDC00-\uDFFF]/.test(fragment.text), false)
  }
  assert.equal(fragments.map(fragment => fragment.text + fragment.suffix).join(''), text)
})

function harness({ failAt = Infinity } = {}) {
  const published = []
  const calls = []
  const selection = { provider: 'demo', targetLanguage: 'zh' }
  const controller = new ReasoningTranslation(selection, 4000, async (request, signal) => {
    calls.push(request.text)
    if (calls.length === failAt) throw new Error('provider failed')
    signal.throwIfAborted()
    return `译:${request.text}`
  }, state => { published.push(state) })
  return { controller, published, calls }
}

test('ReasoningTranslation translates each completed paragraph and publishes as it goes', async () => {
  const { controller, published, calls } = harness()
  controller.update('one\n\ntwo\n\nstreaming', true)
  await new Promise(resolve => { setTimeout(resolve, 20) })
  assert.deepEqual(calls, ['one', 'two'])
  const last = published.at(-1)
  assert.equal(last.text, '译:one\n\n译:two\n\nstreaming')
  assert.equal(last.failed, false)
  assert.equal(last.pending, false)
  controller.dispose()
})

test('ReasoningTranslation reports a failure, then retries the remaining fragments', async () => {
  const { controller, published, calls } = harness({ failAt: 2 })
  controller.update('one\n\ntwo', false)
  await new Promise(resolve => { setTimeout(resolve, 20) })
  assert.equal(published.at(-1).failed, true)
  assert.equal(published.at(-1).text, '译:one\n\ntwo', 'untranslated paragraphs keep their source')
  controller.retry()
  await new Promise(resolve => { setTimeout(resolve, 20) })
  assert.equal(published.at(-1).failed, false)
  assert.equal(published.at(-1).text, '译:one\n\n译:two', 'the retry translates the paragraph that failed')
  assert.equal(calls.length >= 3, true)
  controller.dispose()
})

test('ReasoningTranslation regenerates every paragraph with a cache-bypassing request', async () => {
  const published = []
  const requests = []
  const controller = new ReasoningTranslation({ provider: 'demo', targetLanguage: 'zh' }, 4000, async (request, signal) => {
    requests.push({ text: request.text, refresh: request.refresh === true })
    signal.throwIfAborted()
    return `译${requests.length}:${request.text}`
  }, state => { published.push(state) })
  controller.update('one\n\ntwo', false)
  await new Promise(resolve => { setTimeout(resolve, 20) })
  assert.deepEqual(requests.map(entry => entry.refresh), [false, false], 'a first pass uses the caches')
  assert.equal(published.at(-1).text, '译1:one\n\n译2:two')

  controller.regenerate()
  assert.equal(published.at(-1).text, '译1:one\n\n译2:two', 'the previous translation stays visible while regenerating')
  await new Promise(resolve => { setTimeout(resolve, 20) })
  assert.deepEqual(requests.slice(2).map(entry => entry.refresh), [true, true])
  assert.equal(published.at(-1).text, '译3:one\n\n译4:two')

  controller.dispose()
  controller.regenerate()
  assert.equal(requests.length, 4, 'a disposed disclosure requests nothing')
})

test('ReasoningTranslation drops late results after disposal', async () => {
  const published = []
  let resolveTranslate
  const controller = new ReasoningTranslation({ provider: 'demo', targetLanguage: 'zh' }, 4000,
    () => new Promise((resolve) => { resolveTranslate = resolve }), state => { published.push(state) })
  controller.update('one', false)
  const before = published.length
  controller.dispose()
  resolveTranslate('late')
  await new Promise(resolve => { setTimeout(resolve, 5) })
  assert.equal(published.length, before, 'no publication after disposal')
})

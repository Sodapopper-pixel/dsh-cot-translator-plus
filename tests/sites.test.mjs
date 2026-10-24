import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { expandTemplate, valueAt, buildRequest, extractText, translateWithSite } from '../src/sites.js'
import { normalizeSite, PRESET_SITES } from '../src/config.js'

const bing = PRESET_SITES.find(site => site.id === 'bing')
const google = PRESET_SITES.find(site => site.id === 'google')
const limits = { timeoutMs: 2000, maxResponseBytes: 64 * 1024 }

test('expandTemplate applies url and json filters', () => {
  const values = { text: 'a b&c"d', source: 'auto', target: 'zh-Hans' }
  assert.equal(expandTemplate('q={{text}}&t={{target}}', values), 'q=a b&c"d&t=zh-Hans')
  assert.equal(expandTemplate('q={{ text | url }}', values), 'q=a%20b%26c%22d')
  assert.equal(expandTemplate('[{{text|json}}]', values), '["a b&c\\"d"]')
  assert.equal(expandTemplate('{{unknown}}x', values), '{{unknown}}x', 'unknown placeholders stay literal')
})

test('valueAt walks object keys and array indices', () => {
  const payload = { a: [{ b: 'hit' }, 'second'] }
  assert.equal(valueAt(payload, 'a.0.b'), 'hit')
  assert.equal(valueAt(payload, 'a.1'), 'second')
  assert.equal(valueAt(payload, 'a.2.b'), undefined)
  assert.equal(valueAt(null, 'a'), undefined)
  assert.equal(valueAt('text', 'a'), undefined)
})

test('buildRequest renders preset endpoints', () => {
  const request = { text: 'hello', sourceLanguage: 'zh-CN', targetLanguage: 'en' }
  const bingRequest = buildRequest(bing, request)
  assert.equal(bingRequest.method, 'POST')
  assert.equal(bingRequest.url.searchParams.get('to'), 'en')
  assert.equal(bingRequest.url.searchParams.get('isEnterpriseClient'), 'false')
  assert.equal(bingRequest.body, '["hello"]')
  assert.equal(bingRequest.headers['content-type'], 'application/json')

  const googleRequest = buildRequest(google, request)
  assert.equal(googleRequest.url.searchParams.get('sl'), 'zh-CN')
  assert.equal(googleRequest.url.searchParams.get('tl'), 'en')
  assert.equal(googleRequest.body, 'q=hello')
  assert.equal(googleRequest.headers['content-type'], 'application/x-www-form-urlencoded')
})

test('extractText reads the first matching path, joins segments, or returns text', () => {
  assert.equal(extractText({ data: { text: '译文' } }, normalizeSite({
    id: 'a', label: 'a', endpoint: 'https://x.test', responsePaths: ['missing', 'data.text'],
  }, 'a')), '译文')
  assert.equal(extractText([[['one', 'x'], [' two', 'y']]], google), 'one two')
  assert.equal(extractText('raw body', normalizeSite({
    id: 'b', label: 'b', endpoint: 'https://x.test', responseType: 'text',
  }, 'b')), 'raw body')
  assert.throws(() => extractText({}, normalizeSite({
    id: 'c', label: 'c', endpoint: 'https://x.test', responsePaths: ['nope'],
  }, 'c')), /invalid response/)
  assert.throws(() => extractText('', normalizeSite({
    id: 'd', label: 'd', endpoint: 'https://x.test', responseType: 'text',
  }, 'd')), /empty response/)
})

async function serve(handler) {
  const server = createServer(handler)
  await new Promise(resolve => { server.listen(0, '127.0.0.1', resolve) })
  const { port } = server.address()
  return { server, origin: `http://127.0.0.1:${port}`, async close() { await new Promise(resolve => { server.close(resolve) }) } }
}

test('translateWithSite posts the templated request and parses the response', async () => {
  let observed
  const { origin, close } = await serve((req, res) => {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      observed = { method: req.method, url: req.url, headers: req.headers, body }
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ data: { text: `译文 ${JSON.parse(body).q}` } }))
    })
  })
  try {
    const site = normalizeSite({
      id: 'demo', label: 'Demo', endpoint: `${origin}/t?to={{target}}`,
      contentType: 'application/json', body: '{"q":{{text|json}}}', headers: { authorization: 'Bearer k' },
      responsePaths: ['data.text'],
    }, 'demo')
    const text = await translateWithSite(site, { text: 'hello', sourceLanguage: 'auto', targetLanguage: 'zh' }, limits)
    assert.equal(text, '译文 hello')
    assert.equal(observed.method, 'POST')
    assert.equal(observed.url, '/t?to=zh')
    assert.equal(observed.headers.authorization, 'Bearer k')
    assert.equal(observed.headers['content-type'], 'application/json')
    assert.equal(observed.body, '{"q":"hello"}')
  } finally {
    await close()
  }
})

test('translateWithSite reports HTTP, JSON, and size failures without the source text', async () => {
  const { origin, close } = await serve((req, res) => {
    if (req.url.startsWith('/status')) {
      res.statusCode = 429
      res.end('slow down')
      return
    }
    if (req.url.startsWith('/invalid')) {
      res.end('<html>')
      return
    }
    res.end(JSON.stringify({ text: 'x'.repeat(500) }))
  })
  try {
    const status = normalizeSite({ id: 's', label: 's', endpoint: `${origin}/status`, method: 'GET', responsePaths: ['text'] }, 's')
    await assert.rejects(translateWithSite(status, { text: 'secret', sourceLanguage: 'auto', targetLanguage: 'en' }, limits),
      error => error.code === 'TRANSLATION_HTTP_ERROR' && !error.message.includes('secret'))

    const invalid = normalizeSite({ id: 'i', label: 'i', endpoint: `${origin}/invalid`, method: 'GET', responsePaths: ['text'] }, 'i')
    await assert.rejects(translateWithSite(invalid, { text: 'secret', sourceLanguage: 'auto', targetLanguage: 'en' }, limits),
      error => error.code === 'TRANSLATION_INVALID_RESPONSE')

    const big = normalizeSite({ id: 'b', label: 'b', endpoint: `${origin}/big`, method: 'GET', responsePaths: ['text'] }, 'b')
    await assert.rejects(translateWithSite(big, { text: 'x', sourceLanguage: 'auto', targetLanguage: 'en' }, { ...limits, maxResponseBytes: 64 }),
      error => error.code === 'TRANSLATION_RESPONSE_LIMIT')
  } finally {
    await close()
  }
})

test('translateWithSite reports its own deadline and returns empty input unchanged', async () => {
  const { origin, close } = await serve((_req, res) => {
    setTimeout(() => { res.end(JSON.stringify({ text: 'late' })) }, 500).unref?.()
  })
  try {
    const site = normalizeSite({ id: 'slow', label: 'slow', endpoint: `${origin}/slow`, method: 'GET', responsePaths: ['text'] }, 'slow')
    await assert.rejects(translateWithSite(site, { text: 'x', sourceLanguage: 'auto', targetLanguage: 'en' }, { ...limits, timeoutMs: 50 }),
      error => error.code === 'TRANSLATION_TIMEOUT')
    assert.equal(await translateWithSite(site, { text: '', sourceLanguage: 'auto', targetLanguage: 'en' }, limits), '')
  } finally {
    await close()
  }
})

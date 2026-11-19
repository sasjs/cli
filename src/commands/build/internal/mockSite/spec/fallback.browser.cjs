#!/usr/bin/env node
// The not-found page has to make a cold deep link work, and has to stop when it
// cannot (Node 22+).
// Run: CHROMIUM_PATH=/path/to/chromium npm run test:browser:fallback
//
// What this proves, without a built site and without @sasjs/api: a static host
// answers a path it has no file for with 404.html, the page installs the site's
// worker, and the SAME address then answers from the worker. The worker here is
// a stub that answers everything with one marker page - the point is the
// hand-off, not what a site answers with.
//
// Three cases, because the page has three endings: the worker answers; the
// worker never answers the navigation (the cap is reached, once, with a
// message); and the same, with cookies disabled so the count has to travel in
// the URL instead. The last one is the one that used to loop.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const http = require('node:http')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const os = require('node:os')
const path = require('node:path')
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const ASSETS = path.join(__dirname, '..', 'assets')
const MARKER = 'WORKER ANSWERED'
const SILENT = 'This page is not part of this site.'
const DEEP_LINK = '/Public/app/services/entry.html?x=1'
const HOST_VERSION = 'abc123def4'
// the build substitutes both; the assets themselves carry the placeholders
const BASE = ''

const WORKER_ANSWERS = `self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', (event) => event.respondWith(
  new Response('<!doctype html><title>stub</title><p id="app">${MARKER}</p>',
    { headers: { 'Content-Type': 'text/html' } })))
`

// installs and claims, but never answers a request: the retries are not
// intercepted, so the page has to stop itself
const WORKER_SILENT = `self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
`

function pagesLike(root, hits) {
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8'
  }
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    hits.push(url.pathname + url.search)
    const file = path.join(root, url.pathname)
    let body = null
    try {
      body = await fs.readFile(file)
    } catch (_) {
      body = null
    }
    if (body) {
      res.writeHead(200, {
        'Content-Type': types[path.extname(file)] || 'application/octet-stream'
      })
      return res.end(body)
    }
    // what GitHub Pages does: 404.html, with a 404 status
    const fallback = await fs
      .readFile(path.join(root, '404.html'))
      .catch(() => null)
    if (fallback) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
      return res.end(fallback)
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
  })
}

async function site(workerScript) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sasjs-404-browser-'))
  const page = (
    await fs.readFile(path.join(ASSETS, 'fallback.html'), 'utf8')
  ).replace('src="/404.js"', `src="${BASE}/404.js"`)
  const script = (await fs.readFile(path.join(ASSETS, 'fallback.js'), 'utf8'))
    .replaceAll('__BASE__', BASE)
    .replaceAll('__HOST_VERSION__', HOST_VERSION)
  assert.ok(
    !script.includes('__'),
    'a placeholder survived the build substitution'
  )
  await fs.writeFile(path.join(root, '404.html'), page)
  await fs.writeFile(path.join(root, '404.js'), script)
  await fs.writeFile(path.join(root, 'sw.js'), workerScript)
  const hits = []
  const server = pagesLike(root, hits)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return {
    root,
    server,
    hits,
    origin: `http://localhost:${server.address().port}`
  }
}

async function startBrowser() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sasjs-404-chrome-'))
  const chromium = process.env.CHROMIUM_PATH || 'chromium'
  const browser = spawn(
    chromium,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      `--user-data-dir=${path.join(root, 'profile')}`,
      '--remote-debugging-port=0',
      'about:blank'
    ],
    { stdio: 'ignore' }
  )
  let port
  for (let n = 0; n < 200 && !port; n++) {
    try {
      port = Number(
        (
          await fs.readFile(
            path.join(root, 'profile/DevToolsActivePort'),
            'utf8'
          )
        ).split('\n')[0]
      )
    } catch (_) {
      await sleep(50)
    }
  }
  if (!port) throw new Error('Chromium did not start')
  const info = await (
    await fetch(`http://127.0.0.1:${port}/json/version`)
  ).json()
  const ws = new WebSocket(info.webSocketDebuggerUrl)
  await once(ws, 'open')
  let id = 0
  const pending = new Map()
  ws.addEventListener('message', ({ data }) => {
    const msg = JSON.parse(data)
    if (!pending.has(msg.id)) return
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error
      ? reject(new Error(JSON.stringify(msg.error)))
      : resolve(msg.result)
  })
  const send = (method, params = {}, browserSession) =>
    new Promise((resolve, reject) => {
      const requestId = ++id
      pending.set(requestId, { resolve, reject })
      ws.send(
        JSON.stringify({
          id: requestId,
          method,
          params,
          ...(browserSession || {})
        })
      )
    })
  return { ws, send, browser }
}

// a fresh browser context per case: cookies and worker registrations must not
// leak from one case into the next
async function openCase(browser, { disableCookies }) {
  const { browserContextId } = await browser.send('Target.createBrowserContext')
  const { targetId } = await browser.send('Target.createTarget', {
    url: 'about:blank',
    browserContextId
  })
  const { sessionId } = await browser.send('Target.attachToTarget', {
    targetId,
    flatten: true
  })
  const send = (method, params = {}) =>
    browser.send(method, params, { sessionId })
  const evalJS = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    })
    if (result.exceptionDetails)
      throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  await send('Page.enable')
  if (disableCookies)
    await send('Emulation.setDocumentCookieDisabled', { disabled: true })
  return { browserContextId, send, evalJS }
}

async function settle(evalJS, done) {
  let last = ''
  for (let n = 0; n < 200; n++) {
    last = (await evalJS("document.body ? document.body.innerText : ''")) || ''
    if (done(last)) return last
    await sleep(100)
  }
  return last
}

async function main() {
  const browser = await startBrowser()
  const servers = []
  try {
    // 1. the worker answers the deep link
    {
      const s = await site(WORKER_ANSWERS)
      servers.push(s.server)
      const c = await openCase(browser, { disableCookies: false })
      const url = s.origin + DEEP_LINK
      await c.send('Page.navigate', { url })
      const text = await settle(
        c.evalJS,
        (t) => t.includes(MARKER) || t.includes(SILENT)
      )
      assert.ok(
        text.includes(MARKER),
        `the worker never answered the deep link (page said: ${JSON.stringify(text.slice(0, 80))})`
      )
      assert.equal(
        await c.evalJS('location.search'),
        '?x=1',
        'the address must not gain a marker'
      )
      assert.ok(
        await c.evalJS('navigator.serviceWorker.controller !== null'),
        'the page that loaded is not the one the worker answered'
      )
      const swFetches = s.hits.filter((p) => p.startsWith('/sw.js'))
      assert.ok(
        swFetches.every((p) => p === `/sw.js?v=${HOST_VERSION}`),
        `the worker was fetched by an unstamped URL: ${JSON.stringify(swFetches)}`
      )
      console.log(
        'fallback: a cold deep link reaches the worker at the address it was given'
      )
    }

    // 2. the worker never answers: the cap ends on a message, once
    {
      const s = await site(WORKER_SILENT)
      servers.push(s.server)
      const c = await openCase(browser, { disableCookies: false })
      const url = s.origin + DEEP_LINK
      await c.send('Page.navigate', { url })
      const text = await settle(c.evalJS, (t) => t.includes(SILENT))
      assert.ok(
        text.includes(SILENT),
        `expected the give-up message, got ${JSON.stringify(text.slice(0, 80))}`
      )
      const before = s.hits.filter((p) => p.startsWith('/Public/')).length
      await sleep(1500)
      const after = s.hits.filter((p) => p.startsWith('/Public/')).length
      assert.equal(
        after,
        before,
        `the page kept navigating after it gave up (${before} -> ${after})`
      )
      assert.ok(
        before >= 2 && before <= 5,
        `expected a bounded number of attempts, saw ${before}`
      )
      console.log(
        `fallback: with no worker answering it stops on the message after ${before} attempts`
      )
    }

    // 3. the same, with cookies disabled: the count travels in the URL, so the
    // cap still holds - this is the case that reloaded forever when the count
    // lived in storage alone
    {
      const s = await site(WORKER_SILENT)
      servers.push(s.server)
      const c = await openCase(browser, { disableCookies: true })
      const url = s.origin + DEEP_LINK
      await c.send('Page.navigate', { url })
      const text = await settle(c.evalJS, (t) => t.includes(SILENT))
      assert.ok(
        text.includes(SILENT),
        `expected the give-up message with cookies disabled, got ${JSON.stringify(text.slice(0, 80))}`
      )
      const before = s.hits.filter((p) => p.startsWith('/Public/')).length
      await sleep(1500)
      const after = s.hits.filter((p) => p.startsWith('/Public/')).length
      assert.equal(
        after,
        before,
        `the page kept navigating after it gave up (${before} -> ${after})`
      )
      assert.ok(
        before >= 2 && before <= 5,
        `expected a bounded number of attempts, saw ${before}`
      )
      // the count travelled in the address here, and a stranded visitor must be
      // left with the address they followed, not this page's bookkeeping
      assert.equal(
        await c.evalJS('location.search'),
        '?x=1',
        'the marker must not outlive the give-up'
      )
      assert.equal(
        await c.evalJS('document.title'),
        'Page not found',
        'a stuck tab must not keep a loading title'
      )
      console.log(
        `fallback: with cookies disabled it still stops after ${before} attempts`
      )
    }

    // 4. cookies disabled, worker answering: the count is not needed once the
    // page is controlled, so the app receives the address that was asked for -
    // no ?sasjs404= marker in its query string
    {
      const s = await site(WORKER_ANSWERS)
      servers.push(s.server)
      const c = await openCase(browser, { disableCookies: true })
      await c.send('Page.navigate', { url: s.origin + DEEP_LINK })
      const text = await settle(
        c.evalJS,
        (t) => t.includes(MARKER) || t.includes(SILENT)
      )
      assert.ok(
        text.includes(MARKER),
        `expected the worker's answer, got ${JSON.stringify(text.slice(0, 80))}`
      )
      assert.equal(
        await c.evalJS('location.search'),
        '?x=1',
        'the app was handed a marker its caller never sent'
      )
      console.log(
        'fallback: with cookies disabled the worker answers at the address that was asked for'
      )
    }
  } finally {
    try {
      browser.ws.close()
    } catch (_) {}
    browser.browser.kill()
    for (const server of servers) server.close()
  }
}

main().catch((error) => {
  console.error(
    'fallback browser check failed:',
    error && error.message ? error.message : error
  )
  process.exit(1)
})

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
const fsSync = require('node:fs')
const http = require('node:http')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const os = require('node:os')
const path = require('node:path')
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const ASSETS = path.join(__dirname, '..', 'assets')
const MARKER = 'WORKER ANSWERED'
const SILENT = 'This page is not part of this site.'
/* a published address, not a raw drive path: the worker answers the web tier
 * spellings and leaves drive paths to the static host (case 9) */
const DEEP_LINK = '/StoredProgram?_FILE=/Public/app/services/entry.html'
const DEEP_SEARCH = '?_FILE=/Public/app/services/entry.html'
const TARGET_PATH = '/StoredProgram'
const HOST_VERSION = 'abc123def4'
// the build substitutes both; the assets themselves carry the placeholders
const BASE = ''

/* The stub is shaped like the site's own worker, not like a catch-all: it
 * answers the routes the site publishes and leaves every other path to the
 * static host. Its allow-list is READ OUT OF assets/sw.js rather than copied -
 * a copy drifts, and a stub answering paths the worker refuses would make every
 * case here pass in a world the site does not have. */
const ALLOW_LIST = (() => {
  const source = fsSync.readFileSync(path.join(ASSETS, 'sw.js'), 'utf8')
  const matches = source.match(/\/\^\\\/\([^)]*\)\(\\\/\|\$\)\/i/g) || []
  const found = matches.find((text) => text.includes('StoredProgram'))
  if (!found)
    throw new Error('assets/sw.js no longer carries the web-tier allow-list')
  return found
})()

const WORKER_ANSWERS = `self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', (event) => {
  const path = new URL(event.request.url).pathname
  if (!${ALLOW_LIST}.test(path)) return
  event.respondWith(new Response('<!doctype html><title>stub</title><p id="app">${MARKER}</p>',
    { headers: { 'Content-Type': 'text/html' } }))
})
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

/* workerScript: a worker to serve, or null for a host that has none - the
 * state in which the page never becomes controlled and the count has nowhere
 * to live but the address */
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
  if (workerScript) await fs.writeFile(path.join(root, 'sw.js'), workerScript)
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
async function openCase(
  browser,
  { disableCookies, blockWindowName, appWindowName }
) {
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
  if (appWindowName)
    /* the app has its own value in window.name before this page runs: it is not
     * ours to overwrite, so this must fall through to the next carrier */
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `window.name = ${JSON.stringify(appWindowName)}`
    })
  if (blockWindowName)
    /* runs before every document's own scripts: a window whose name cannot be
     * used as a carrier, which leaves the address as the only one left */
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `Object.defineProperty(window, 'name', {
        configurable: false,
        get: function () { return '' },
        set: function () {}
      })`
    })
  return { browserContextId, send, evalJS }
}

/* the browser percent-encodes the query it navigated to, so compare decoded */
async function searchOf(c) {
  return c.evalJS('decodeURIComponent(location.search)')
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
        await searchOf(c),
        DEEP_SEARCH,
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
      const before = s.hits.filter((p) => p.startsWith(TARGET_PATH)).length
      await sleep(1500)
      const after = s.hits.filter((p) => p.startsWith(TARGET_PATH)).length
      assert.equal(
        after,
        before,
        `the page kept navigating after it gave up (${before} -> ${after})`
      )
      assert.ok(
        before >= 2 && before <= 5,
        `expected a bounded number of attempts, saw ${before}`
      )
      /* the cap bounds one visit, not the address: a reload has to try again
       * rather than refuse at once, which is what a leftover count would do */
      await c.send('Page.reload')
      await settle(c.evalJS, (t) => t.includes(SILENT))
      const second =
        s.hits.filter((q) => q.startsWith(TARGET_PATH)).length - before
      assert.ok(
        second >= 2,
        `a reload after the cap did not retry (only ${second} request(s)) - the count outlived the visit`
      )
      console.log(
        `fallback: with no worker answering it stops on the message after ${before} attempts, and a reload tries again`
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
      const before = s.hits.filter((p) => p.startsWith(TARGET_PATH)).length
      await sleep(1500)
      const after = s.hits.filter((p) => p.startsWith(TARGET_PATH)).length
      assert.equal(
        after,
        before,
        `the page kept navigating after it gave up (${before} -> ${after})`
      )
      assert.ok(
        before >= 2 && before <= 5,
        `expected a bounded number of attempts, saw ${before}`
      )
      // the window name carried the count here, so the address never held it
      assert.equal(
        await searchOf(c),
        DEEP_SEARCH,
        'the count reached the address although the window name could carry it'
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
        await searchOf(c),
        DEEP_SEARCH,
        'the app was handed a marker its caller never sent'
      )
      console.log(
        'fallback: with cookies disabled the worker answers at the address that was asked for'
      )
    }

    // 5. both storage carriers refused, worker claims the page but answers
    // nothing: the page is controlled, so it probes the address instead of
    // marking it - the static host's 404 ends it there
    {
      const s = await site(WORKER_SILENT)
      servers.push(s.server)
      const c = await openCase(browser, {
        disableCookies: true,
        blockWindowName: true
      })
      await c.send('Page.navigate', { url: s.origin + DEEP_LINK })
      const text = await settle(c.evalJS, (t) => t.includes(SILENT))
      assert.ok(
        text.includes(SILENT),
        `expected the give-up message on the address carrier, got ${JSON.stringify(text.slice(0, 80))}`
      )
      const marked = s.hits.filter((p) => p.includes('sasjs404=')).length
      assert.equal(
        marked,
        0,
        `a controlled page must not mark the address (saw ${marked})`
      )
      const before = s.hits.filter((p) => p.startsWith(TARGET_PATH)).length
      await sleep(1500)
      const after = s.hits.filter((p) => p.startsWith(TARGET_PATH)).length
      assert.equal(
        after,
        before,
        `the page kept navigating after it gave up (${before} -> ${after})`
      )
      assert.equal(
        await searchOf(c),
        DEEP_SEARCH,
        'the address must stay clean'
      )
      console.log(
        'fallback: a worker that claims the page but answers nothing stops it on a probe'
      )
    }

    // 6. both storage carriers refused, worker answering: control arrives
    // during the wait, so the retry is the clean address - the app must not be
    // handed a marker it never sent
    {
      const s = await site(WORKER_ANSWERS)
      servers.push(s.server)
      const c = await openCase(browser, {
        disableCookies: true,
        blockWindowName: true
      })
      await c.send('Page.navigate', { url: s.origin + DEEP_LINK })
      const text = await settle(
        c.evalJS,
        (t) => t.includes(MARKER) || t.includes(SILENT)
      )
      assert.ok(
        text.includes(MARKER),
        `expected the worker's answer with no carrier, got ${JSON.stringify(text.slice(0, 80))}`
      )
      assert.equal(
        await searchOf(c),
        DEEP_SEARCH,
        'the app was handed a marker because control was read before the wait'
      )
      console.log(
        'fallback: with no carrier and a controlled page the address stays clean'
      )
    }

    // 7. no worker at all (the host serves no sw.js): the page never becomes
    // controlled and both storage carriers are refused, so the count can only
    // live in the address - and the give-up has to take it out again
    {
      const s = await site(null)
      servers.push(s.server)
      const c = await openCase(browser, {
        disableCookies: true,
        blockWindowName: true
      })
      await c.send('Page.navigate', { url: s.origin + DEEP_LINK })
      const text = await settle(c.evalJS, (t) => t.includes(SILENT))
      assert.ok(
        text.includes(SILENT),
        `expected the give-up message on the address carrier, got ${JSON.stringify(text.slice(0, 80))}`
      )
      const marked = s.hits.filter((p) => p.includes('sasjs404=')).length
      assert.ok(
        marked >= 2,
        `expected the retries to carry the marker, saw ${marked}`
      )
      const before = s.hits.filter((p) => p.startsWith(TARGET_PATH)).length
      await sleep(1500)
      const after = s.hits.filter((p) => p.startsWith(TARGET_PATH)).length
      assert.equal(
        after,
        before,
        `the page kept navigating after it gave up (${before} -> ${after})`
      )
      assert.equal(
        await searchOf(c),
        DEEP_SEARCH,
        'the marker must not outlive the give-up'
      )
      console.log(
        `fallback: with no worker and no carrier it stops after ${before} attempts and cleans the address`
      )
    }

    // 8. the app owns window.name: borrowed carriers must not take it. With the
    // cookie refused too, the count goes to the address, and the app's value is
    // still there afterwards
    {
      const s = await site(null)
      servers.push(s.server)
      const c = await openCase(browser, {
        disableCookies: true,
        appWindowName: 'app-owned-value'
      })
      await c.send('Page.navigate', { url: s.origin + DEEP_LINK })
      const text = await settle(c.evalJS, (t) => t.includes(SILENT))
      assert.ok(
        text.includes(SILENT),
        `expected the give-up message, got ${JSON.stringify(text.slice(0, 80))}`
      )
      assert.equal(
        await c.evalJS('window.name'),
        'app-owned-value',
        'the page overwrote a window.name it did not write'
      )
      const marked = s.hits.filter((p) => p.includes('sasjs404=')).length
      assert.ok(
        marked >= 2,
        `expected the address carrier to take over, saw ${marked}`
      )
      console.log('fallback: an app-owned window.name is left alone')
    }

    // 9. a raw drive path is not an address the site publishes: the worker
    // leaves it to the static host on purpose, so the page gives up rather than
    // pretending - the boundary the docstring names
    {
      const s = await site(WORKER_ANSWERS)
      servers.push(s.server)
      const c = await openCase(browser, { disableCookies: false })
      await c.send('Page.navigate', {
        url: s.origin + '/Public/app/services/web/index.html'
      })
      const text = await settle(
        c.evalJS,
        (t) => t.includes(SILENT) || t.includes(MARKER)
      )
      assert.ok(
        text.includes(SILENT),
        `a raw drive path must not be answered by the worker, got ${JSON.stringify(text.slice(0, 80))}`
      )
      assert.equal(
        await searchOf(c),
        '',
        'a give-up on a raw path must not leave a marker behind'
      )
      console.log(
        'fallback: a raw drive path is left to the static host and gives up'
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

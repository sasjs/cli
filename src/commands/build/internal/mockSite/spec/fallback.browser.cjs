#!/usr/bin/env node
// The not-found page has to make a cold deep link work (Node 22+).
// Run: CHROMIUM_PATH=/path/to/chromium node src/commands/build/internal/mockSite/spec/fallback.browser.cjs
//
// What this proves, without a built site and without @sasjs/api: a static host
// answers a path it has no file for with 404.html, the page installs the site's
// worker, and the SAME address then answers from the worker. The worker here is
// a stub that answers everything with one marker page - the point is the
// hand-off, not what a site answers with.
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
const DEEP_LINK = '/Public/app/services/entry.html?x=1'

function pagesLike(root) {
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8'
  }
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
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
    const fallback = await fs.readFile(path.join(root, '404.html')).catch(() => null)
    if (fallback) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
      return res.end(fallback)
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
  })
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sasjs-404-browser-'))
  const servers = []
  let browser, browserDone = false, browserError, ws
  try {
    // the shipped page and script, under the names a host looks for
    await fs.copyFile(path.join(ASSETS, 'fallback.html'), path.join(root, '404.html'))
    await fs.copyFile(path.join(ASSETS, 'fallback.js'), path.join(root, '404.js'))
    // the stub backend: answers every request once it controls the page
    await fs.writeFile(
      path.join(root, 'sw.js'),
      /* respondWith, not a returned promise: a fetch listener that returns is a
       * listener that passes the request straight through to the network */
      `self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', (event) => event.respondWith(
  new Response('<!doctype html><title>stub</title><p id="app">${MARKER}</p>',
    { headers: { 'Content-Type': 'text/html' } })))
`
    )

    const server = pagesLike(root)
    servers.push(server)
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const origin = `http://localhost:${server.address().port}`
    const deepUrl = origin + DEEP_LINK

    const chromium = process.env.CHROMIUM_PATH || 'chromium'
    browser = spawn(
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
    browser.on('error', (error) => {
      browserError = error
    })
    const browserClosed = new Promise((resolve) =>
      browser.once('close', () => {
        browserDone = true
        resolve()
      })
    )

    let port
    for (let n = 0; n < 200 && !port; n++) {
      if (browserError) throw browserError
      if (browserDone) throw new Error('Chromium exited before startup')
      try {
        port = Number(
          (await fs.readFile(path.join(root, 'profile/DevToolsActivePort'), 'utf8')).split('\n')[0]
        )
      } catch (_) {
        await sleep(50)
      }
    }
    if (!port) throw new Error('Chromium did not start')

    const info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()
    ws = new WebSocket(info.webSocketDebuggerUrl)
    await once(ws, 'open')
    let id = 0
    const pending = new Map()
    ws.addEventListener('message', ({ data }) => {
      const msg = JSON.parse(data)
      if (!pending.has(msg.id)) return
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
    })
    const send = (method, params = {}, sessionId) =>
      new Promise((resolve, reject) => {
        const requestId = ++id
        pending.set(requestId, { resolve, reject })
        ws.send(JSON.stringify({ id: requestId, method, params, sessionId }))
      })
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
    const evalJS = async (expression) => {
      const result = await send(
        'Runtime.evaluate',
        { expression, awaitPromise: true, returnByValue: true },
        sessionId
      )
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
      return result.result.value
    }
    await send('Page.enable', {}, sessionId)

    // a browser that has never loaded the site, straight at the deep link
    await send('Page.navigate', { url: deepUrl }, sessionId)

    let answered = false
    let lastText = ''
    for (let n = 0; n < 200; n++) {
      lastText = (await evalJS("document.body ? document.body.innerText : ''")) || ''
      if (lastText.includes(MARKER)) {
        answered = true
        break
      }
      await sleep(100)
    }
    assert.ok(
      answered,
      `the worker never answered the deep link (page said: ${JSON.stringify(lastText.slice(0, 80))})`
    )
    const href = await evalJS('location.href')
    assert.equal(href, deepUrl, 'the retry must ask for the same address it was given')
    const controlled = await evalJS('navigator.serviceWorker.controller !== null')
    assert.ok(controlled, 'the page that loaded is not the one the worker answered')

    console.log('fallback: a cold deep link reaches the worker at the address it was given')
  } finally {
    try {
      if (ws) ws.close()
    } catch (_) {}
    if (browser) browser.kill()
    for (const server of servers) server.close()
  }
}

main().catch((error) => {
  console.error('fallback browser check failed:', error && error.message ? error.message : error)
  process.exit(1)
})

#!/usr/bin/env node
/*
 * End-to-end startup contract: build a real mock site from the current source,
 * serve its real boot, persistence, bridge and worker, and drive Chromium via
 * CDP. No browser automation dependency is required (Node >=22 has WebSocket).
 *
 * The only fixture is the tiny app. The server delays the worker script and
 * identity response on the first visit to distinguish native page load, worker
 * control, and host readiness. Failure cases return 503 or an invalid identity.
 * The cache-upgrade case primes stale scripts; all actual host booting uses the
 * generated host JS and real worker.
 * BOOT_PATH can select an alternate boot.js, e.g. an untouched git HEAD copy.
 * BROWSER_CASE can select an individual case when diagnosing a failure.
 */
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const fs = require('node:fs/promises')
const http = require('node:http')
const Module = require('node:module')
const os = require('node:os')
const path = require('node:path')
const ts = require('typescript')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const sourceDir = path.resolve(__dirname, '..')

async function buildSite(root, withBase = false) {
  const web = path.join(root, 'web')
  const build = path.join(root, 'sasjsbuild')
  await fs.mkdir(web, { recursive: true })
  await fs.mkdir(build, { recursive: true })
  await fs.writeFile(
    path.join(web, 'index.html'),
    `<!doctype html>
<html><head><title>Startup fixture</title>
${withBase ? '<base href="/app-assets/">' : ''}
<script src="${withBase ? '/' : ''}early.js" data-early></script>
<script src="${withBase ? '/' : ''}app.js"></script>
</head><body><div id="app"></div></body></html>`
  )
  await fs.writeFile(
    path.join(web, 'early.js'),
    `
window.observed = { events: [], errors: [], appCount: 0 };
window.addEventListener('error', e => observed.errors.push(e.message));
window.addEventListener('unhandledrejection', e => observed.errors.push(String(e.reason)));
document.addEventListener('DOMContentLoaded', e => observed.events.push(['early-dom', e.isTrusted]));
window.addEventListener('load', e => observed.events.push(['early-load', e.isTrusted]));
document.documentElement.dataset.early = 'painted';`
  )
  await fs.writeFile(
    path.join(web, 'app.js'),
    `
observed.appCount++;
observed.promiseAtApp = !!window.__sasjsMockReady && typeof window.__sasjsMockReady.then === 'function';
observed.promiseReference = window.__sasjsMockReady;
document.addEventListener('DOMContentLoaded', e => observed.events.push(['app-dom', e.isTrusted]));
window.onload = e => {
  observed.events.push(['app-onload', e.isTrusted]);
  document.querySelector('#app').textContent = 'rendered on native load';
};
window.addEventListener('load', e => observed.events.push(['app-load', e.isTrusted]));`
  )

  // Transpile the actual TypeScript builder, resolving imports from the checkout.
  // Unlike a prebuilt dist this cannot go stale while source is being edited.
  const file = path.join(sourceDir, 'mockSite.ts')
  const source = await fs.readFile(file, 'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true
    }
  }).outputText
  const mod = new Module(file, module)
  mod.filename = file
  mod.paths = Module._nodeModulePaths(path.dirname(file))
  mod._compile(js, file)
  process.projectDir = root
  process.sasjsConstants = { buildDestinationFolder: build }
  process.sasjsConfig = { syncFolder: 'sasjs' }
  process.logger = { warn: () => {}, info: () => {} }
  const result = await mod.exports.buildMockSite({
    appLoc: '/Public/app/test',
    streamConfig: { webSourcePath: './web', mockApi: false }
  })
  return result.outputFolder
}

function serve(site, mode, alternateBoot) {
  let heldWorker
  let heldGate
  let heldIdentity
  let heldPersist
  let workerRequested = false
  let identityRequested = false
  let persistRequested = false
  let networkApiRequests = 0
  let primingCache = true
  const hostRequests = []
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    const pathname = decodeURIComponent(url.pathname)
    // An old real controller answers its own seed handshake immediately. The
    // updated actual worker is held in install so that race is deterministic.
    if (mode.startsWith('old-upgrade') && pathname === '/prime') {
      res
        .writeHead(200, {
          'Content-Type': 'text/html',
          'Cache-Control': 'no-store'
        })
        .end('<!doctype html>prime')
      return
    }
    if (mode === 'old-upgrade' && pathname === '/gate') {
      heldGate = res
      return
    }
    if (
      mode.startsWith('old-upgrade') &&
      pathname === '/sw.js' &&
      url.search === '?v=old'
    ) {
      res.writeHead(200, {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'no-store'
      }).end(`
        self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
        self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
        self.addEventListener('message', event => { if (event.data.type === 'sasjs-seed') event.source.postMessage({type:'sasjs-seed-ack', old:true}); });
      `)
      return
    }
    if (mode === 'old-upgrade-wait' && pathname === '/sw.js') {
      res.writeHead(200, {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'no-store'
      }).end(`
        self.addEventListener('install', () => {});
        self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
      `)
      return
    }
    if (mode === 'old-upgrade' && pathname === '/sw.js') {
      const actual = await fs.readFile(path.join(site, 'sw.js'), 'utf8')
      res
        .writeHead(200, {
          'Content-Type': 'application/javascript',
          'Cache-Control': 'no-store'
        })
        .end(
          actual +
            `\nself.addEventListener('install', event => event.waitUntil(fetch('/gate')));`
        )
      return
    }
    if (pathname === '/cache-prime' && mode === 'cache-upgrade') {
      res.writeHead(200, {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-store'
      })
      res.end(
        '<script src="/host/persist.js"></script><script src="/host/intercept.js"></script>'
      )
      return
    }
    if (/^\/host\/(persist|intercept)\.js$/.test(pathname)) {
      hostRequests.push(pathname + url.search)
      if (mode === 'cache-upgrade' && primingCache) {
        res.writeHead(200, {
          'Content-Type': 'application/javascript',
          'Cache-Control': 'public, max-age=3600'
        })
        res.end('window.staleHostAssetExecuted = true')
        return
      }
    }
    if (/^\/(api|SASjsApi)\//i.test(pathname)) {
      networkApiRequests++
      res.writeHead(404).end('static server has no API')
      return
    }
    if (pathname === '/sw.js' && mode === 'held') {
      workerRequested = true
      heldWorker = res
      res.on('close', () => {
        if (heldWorker === res) heldWorker = null
      })
      return
    }
    if (pathname === '/host/identity.json' && mode === 'held') {
      identityRequested = true
      heldIdentity = res
      res.on('close', () => {
        if (heldIdentity === res) heldIdentity = null
      })
      return
    }
    if (pathname === '/host/identity.json' && mode === 'identity-error') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      })
      res.end('{}')
      return
    }
    if (pathname === '/host/persist.js' && mode === 'persist-held') {
      persistRequested = true
      heldPersist = res
      res.on('close', () => {
        if (heldPersist === res) heldPersist = null
      })
      return
    }
    if (
      (mode === 'worker-error' && pathname === '/sw.js') ||
      (mode === 'persist-error' && pathname === '/host/persist.js') ||
      (mode === 'bridge-error' && pathname === '/host/intercept.js') ||
      (mode === 'config-error' && pathname === '/host/mock-config.json')
    ) {
      res.writeHead(503).end('deliberate host asset failure')
      return
    }
    const name = pathname === '/' ? '/index.html' : pathname
    const file = path.resolve(site, '.' + name)
    if (!file.startsWith(site + path.sep)) return res.writeHead(403).end()
    try {
      const data = await fs.readFile(
        name === '/host/boot.js' && alternateBoot ? alternateBoot : file
      )
      const type = name.endsWith('.js')
        ? 'application/javascript'
        : name.endsWith('.json')
          ? 'application/json'
          : 'text/html'
      res
        .writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' })
        .end(data)
    } catch (_) {
      res.writeHead(404).end('not found')
    }
  })
  server.gateHeld = () => !!heldGate
  server.releaseGate = () => {
    assert.ok(heldGate, 'upgrade installation gate is held')
    heldGate.writeHead(200).end('ok')
    heldGate = null
  }
  server.workerRequested = () => workerRequested
  server.identityRequested = () => identityRequested
  server.persistRequested = () => persistRequested
  server.hostRequests = () => hostRequests.slice()
  server.finishCachePrime = () => {
    primingCache = false
  }
  server.networkApiRequests = () => networkApiRequests
  server.releaseIdentity = async () => {
    assert.ok(heldIdentity, 'worker identity request is held before release')
    const res = heldIdentity
    heldIdentity = null
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    })
    res.end(await fs.readFile(path.join(site, 'host/identity.json')))
  }
  server.releaseWorker = async () => {
    assert.ok(heldWorker, 'real worker request is held before release')
    const res = heldWorker
    heldWorker = null
    res.writeHead(200, {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'no-store'
    })
    res.end(await fs.readFile(path.join(site, 'sw.js')))
  }
  server.releasePersist = async () => {
    assert.ok(
      heldPersist,
      'real persistence script request is held before release'
    )
    const res = heldPersist
    heldPersist = null
    res.writeHead(200, {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'no-store'
    })
    res.end(await fs.readFile(path.join(site, 'host/persist.js')))
  }
  return server
}

async function main() {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), 'sasjs-startup-browser-')
  )
  let chromium, ws, exited, server
  let stderr = ''
  try {
    const site = await buildSite(root)
    const profile = path.join(root, 'profile')
    chromium = spawn(
      process.env.CHROMIUM_PATH || 'chromium',
      [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--remote-debugging-port=0',
        `--user-data-dir=${profile}`,
        'about:blank'
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] }
    )
    chromium.stderr.on('data', (data) => {
      stderr += data.toString()
    })
    let spawnError
    chromium.on('error', (error) => {
      spawnError = error
    })
    exited = new Promise((resolve) => chromium.once('close', resolve))
    let port
    const deadline = Date.now() + 10000
    while (!port && Date.now() < deadline) {
      if (spawnError) throw spawnError
      if (chromium.exitCode !== null)
        throw new Error(`Chromium exited: ${stderr}`)
      try {
        port = Number(
          (
            await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')
          ).split('\n')[0]
        )
      } catch (_) {
        await sleep(50)
      }
    }
    if (!port) throw new Error(`Chromium CDP startup timed out: ${stderr}`)
    const { webSocketDebuggerUrl } = await (
      await fetch(`http://127.0.0.1:${port}/json/version`)
    ).json()
    ws = new WebSocket(webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('CDP websocket open timed out')),
        10000
      )
      ws.addEventListener(
        'open',
        () => {
          clearTimeout(timer)
          resolve()
        },
        { once: true }
      )
      ws.addEventListener(
        'error',
        () => {
          clearTimeout(timer)
          reject(new Error('CDP websocket failed'))
        },
        { once: true }
      )
    })
    let id = 0
    const pending = new Map()
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      const request = pending.get(message.id)
      if (!request) return
      pending.delete(message.id)
      clearTimeout(request.timer)
      if (message.error)
        request.reject(new Error(JSON.stringify(message.error)))
      else request.resolve(message.result)
    })
    const send = (method, params = {}, sessionId) =>
      new Promise((resolve, reject) => {
        const requestId = ++id
        const timer = setTimeout(() => {
          pending.delete(requestId)
          reject(new Error(`CDP ${method} timed out`))
        }, 30000)
        pending.set(requestId, { resolve, reject, timer })
        ws.send(JSON.stringify({ id: requestId, method, params, sessionId }))
      })
    const { targetId } = await send('Target.createTarget', {
      url: 'about:blank'
    })
    const { sessionId } = await send('Target.attachToTarget', {
      targetId,
      flatten: true
    })
    await send('Page.enable', {}, sessionId)
    await send('Runtime.enable', {}, sessionId)
    const evaluate = async (expression) => {
      const result = await send(
        'Runtime.evaluate',
        { expression, returnByValue: true, awaitPromise: true },
        sessionId
      )
      if (result.exceptionDetails)
        throw new Error(JSON.stringify(result.exceptionDetails))
      return result.result.value
    }
    async function waitFor(expression, description, timeout = 10000) {
      const until = Date.now() + timeout
      while (Date.now() < until) {
        if (await evaluate(expression)) return
        await sleep(50)
      }
      throw new Error(`Timed out waiting for ${description}`)
    }
    async function navigate(mode, options = {}) {
      server = serve(options.site || site, mode, process.env.BOOT_PATH)
      server.listen(0, '127.0.0.1')
      await once(server, 'listening')
      await send(
        'Page.navigate',
        {
          url: `http://127.0.0.1:${server.address().port}${options.path || '/'}`
        },
        sessionId
      )
      if (!options.noWait)
        await waitFor(
          'document.readyState === "complete"',
          `${mode}: native page load`
        )
    }
    async function closeServer() {
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
      server = null
    }
    function check(name, actual, expected) {
      assert.deepEqual(actual, expected, `${name}: ${JSON.stringify(actual)}`)
      console.log(`PASS ${name}`)
    }

    const selected = process.env.BROWSER_CASE
    const run = (name) => !selected || selected === name
    if (run('old-upgrade')) {
      await navigate('old-upgrade', { path: '/prime' })
      await evaluate(
        `navigator.serviceWorker.register('/sw.js?v=old').then(() => navigator.serviceWorker.ready)`
      )
      await waitFor('!!navigator.serviceWorker.controller', 'old worker claim')
      await send(
        'Page.navigate',
        { url: `http://127.0.0.1:${server.address().port}/` },
        sessionId
      )
      await waitFor(
        '!!window.observed && document.readyState === "complete"',
        'upgrade page'
      )
      await evaluate(
        `window.upgradeState='pending'; window.__sasjsMockReady.then(x => {window.upgradeState='resolved'; window.bootResult=x}, e=>{window.upgradeState='rejected';window.bootError=String(e)}); void 0`
      )
      const deadline = Date.now() + 10000
      while (!server.gateHeld() && Date.now() < deadline) await sleep(50)
      assert.ok(server.gateHeld(), 'upgrade install must be delayed')
      await sleep(500)
      const before = await evaluate(
        `({state:upgradeState,controller:navigator.serviceWorker.controller.scriptURL, result:window.bootResult})`
      )
      console.log('Upgrade before release:', before)
      check('old worker must not satisfy readiness', before.state, 'pending')
      server.releaseGate()
      await waitFor('upgradeState !== "pending"', 'upgraded readiness', 20000)
      const after = await evaluate(
        `(async()=>({state:upgradeState,error:window.bootError,controller:navigator.serviceWorker.controller.scriptURL, result:window.bootResult, api:(await fetch('/SASjsApi/info')).status, appCount: observed.appCount}))()`
      )
      console.log('Upgrade after release:', after)
      check(
        'upgrade resolves on intended worker',
        [
          after.state,
          after.result && after.result.old,
          after.api,
          after.appCount
        ],
        ['resolved', undefined, 200, 1]
      )
      check(
        'upgrade controller is versioned current worker',
        new URL(after.controller).search,
        await evaluate(
          `new URL(document.querySelector('script[src*="host/boot.js"]').src).search`
        )
      )
      await closeServer()
    }
    if (run('old-upgrade-wait')) {
      await navigate('old-upgrade-wait', { path: '/prime' })
      await evaluate(
        `navigator.serviceWorker.register('/sw.js?v=old').then(() => navigator.serviceWorker.ready)`
      )
      await waitFor('!!navigator.serviceWorker.controller', 'old worker claim')
      await send(
        'Page.navigate',
        { url: `http://127.0.0.1:${server.address().port}/` },
        sessionId
      )
      await waitFor(
        '!!window.observed && document.readyState === "complete"',
        'waiting upgrade page'
      )
      await waitFor(
        `navigator.serviceWorker.getRegistration().then(r => !!r.waiting)`,
        'new worker waiting'
      )
      const outcome = await evaluate(
        `Promise.race([window.__sasjsMockReady.then(() => 'resolved', e => String(e)), new Promise(r => setTimeout(() => r('test timed out'), 25000))])`
      )
      assert.match(
        outcome,
        /controller timed out/,
        'a waiting worker must reject rather than hang or use old controller'
      )
      check(
        'waiting upgrade does not reload the app',
        await evaluate('observed.appCount'),
        1
      )
      console.log('PASS waiting worker readiness rejects:', outcome)
      await closeServer()
    }
    if (run('held')) {
      await navigate('held')
      await waitFor('!!window.observed', 'app fixture')
      const before = await evaluate(`(() => {
      const o = window.observed;
      const promise = window.__sasjsMockReady;
      window.readyStateObserved = 'missing';
      if (promise && typeof promise.then === 'function') {
        window.readyStateObserved = 'pending';
        promise.then(() => { window.readyStateObserved = 'resolved' }, () => { window.readyStateObserved = 'rejected' });
      }
      return { appCount: o.appCount, promiseAtApp: o.promiseAtApp,
        promiseStable: o.promiseReference === promise, early: document.documentElement.dataset.early,
        rendered: document.querySelector('#app').textContent, events: o.events,
        controlled: !!navigator.serviceWorker.controller, errors: o.errors };
    })()`)
      console.log('Before worker release:', JSON.stringify(before))
      check('ordinary app executes during parser load', before.appCount, 1)
      check(
        'stable readiness promise exists before app script',
        before.promiseAtApp && before.promiseStable,
        true
      )
      check('paint-critical script runs early', before.early, 'painted')
      check(
        'onload renders UI before API readiness',
        before.rendered,
        'rendered on native load'
      )
      check(
        'native lifecycle events once, without synthetic delivery',
        before.events,
        [
          ['early-dom', true],
          ['app-dom', true],
          ['early-load', true],
          ['app-onload', true],
          ['app-load', true]
        ]
      )
      check('no controller before worker release', before.controlled, false)
      check(
        'readiness remains pending before worker release',
        await evaluate('window.readyStateObserved'),
        'pending'
      )
      check('no page errors during early render', before.errors, [])
      const requestDeadline = Date.now() + 10000
      while (!server.workerRequested() && Date.now() < requestDeadline)
        await sleep(50)
      check('worker request actually held', server.workerRequested(), true)
      await server.releaseWorker()
      await waitFor(
        '!!navigator.serviceWorker.controller',
        'worker control before persistence',
        15000
      )
      const identityDeadline = Date.now() + 10000
      while (!server.identityRequested() && Date.now() < identityDeadline)
        await sleep(50)
      check(
        'worker identity request actually held',
        server.identityRequested(),
        true
      )
      check(
        'worker is controlled while persistence is still pending',
        await evaluate('!!navigator.serviceWorker.controller'),
        true
      )
      check(
        'control alone does not imply host readiness',
        await evaluate('window.readyStateObserved'),
        'pending'
      )
      await server.releaseIdentity()
      await waitFor(
        'window.readyStateObserved !== "pending"',
        'host readiness settles',
        20000
      )
      check(
        'host readiness succeeds',
        await evaluate('window.readyStateObserved'),
        'resolved'
      )
      const after = await evaluate(`(async () => {
      const ready = await window.__sasjsMockReady;
      const response = await fetch('/SASjsApi/info');
      const body = await response.json();
      const xhr = await new Promise(resolve => {
        const request = new XMLHttpRequest();
        request.open('GET', '/SASjsApi/info');
        request.onload = () => resolve({status: request.status, body: JSON.parse(request.responseText)});
        request.onerror = () => resolve({status: request.status});
        request.send();
      });
      return { ready, controlled: !!navigator.serviceWorker.controller,
        bridge: !!window.__sasjsMockBridgeInstalled, status: response.status, body, xhr,
        events: observed.events, appCount: observed.appCount, errors: observed.errors };
    })()`)
      console.log('After readiness:', JSON.stringify(after))
      check(
        'readiness reports no host error',
        !!(after.ready && after.ready.error),
        false
      )
      check('worker controls page', after.controlled, true)
      check('XHR bridge installed', after.bridge, true)
      check('real worker fetch API succeeds', after.status, 200)
      check('real worker XHR API succeeds', after.xhr.status, 200)
      check('fetch and XHR return same API payload', after.xhr.body, after.body)
      check('API never hit static server', server.networkApiRequests(), 0)
      check(
        'no lifecycle redispatch after readiness',
        after.events,
        before.events
      )
      check('app not rerun after readiness', after.appCount, 1)
      check('no page errors after readiness', after.errors, [])
      await closeServer()
    }

    // A dynamically inserted script can still delay the real window load event.
    // Do not await page load in navigate: inspect it while the server holds the
    // actual generated persistence script, then release it for host readiness.
    if (run('persist-held')) {
      await navigate('persist-held', { noWait: true })
      const persistDeadline = Date.now() + 10000
      while (!server.persistRequested() && Date.now() < persistDeadline)
        await sleep(50)
      check(
        'persistence asset request actually held',
        server.persistRequested(),
        true
      )
      await waitFor(
        '!!window.observed && document.readyState === "complete"',
        'native page load while persistence script is held',
        5000
      )
      const slow = await evaluate(`(() => {
      let state = 'pending';
      window.__sasjsMockReady.then(() => { state = 'resolved' }, () => { state = 'rejected' });
      window.slowReadyState = () => state;
      return {events: observed.events, rendered: document.querySelector('#app').textContent};
    })()`)
      check(
        'native app onload while persistence script is held',
        slow.rendered,
        'rendered on native load'
      )
      check(
        'native load delivered once while persistence script is held',
        slow.events.filter(([name]) => name === 'app-onload'),
        [['app-onload', true]]
      )
      check(
        'host still pending while persistence script is held',
        await evaluate('slowReadyState()'),
        'pending'
      )
      await server.releasePersist()
      await waitFor(
        'slowReadyState() !== "pending"',
        'host readiness after persistence release',
        20000
      )
      check(
        'host succeeds after persistence release',
        await evaluate('slowReadyState()'),
        'resolved'
      )
      await closeServer()
    }

    // Prime Chromium's real HTTP cache with old unversioned host assets, then
    // navigate the generated site on the same origin with that cache intact.
    if (run('cache-upgrade')) {
      await navigate('cache-upgrade', { path: '/cache-prime' })
      check(
        'stale host scripts executed when priming cache',
        await evaluate('window.staleHostAssetExecuted'),
        true
      )
      check('both stale host scripts fetched', server.hostRequests().sort(), [
        '/host/intercept.js',
        '/host/persist.js'
      ])
      server.finishCachePrime()
      const cached = await evaluate(
        `Promise.all(['/host/persist.js', '/host/intercept.js'].map(u => fetch(u).then(r => r.text())))`
      )
      check(
        'browser cache contains stale host scripts',
        cached.every((text) => text.includes('staleHostAssetExecuted')),
        true
      )
      check(
        'primed assets were served from browser cache',
        server.hostRequests().length,
        2
      )
      await send(
        'Page.navigate',
        { url: `http://127.0.0.1:${server.address().port}/` },
        sessionId
      )
      await waitFor(
        '!!window.observed && document.readyState === "complete"',
        'cache-upgrade app load'
      )
      const upgraded = await evaluate(`(async () => {
      const ready = await window.__sasjsMockReady;
      const response = await fetch('/SASjsApi/info');
      return { stale: !!window.staleHostAssetExecuted, controlled: !!navigator.serviceWorker.controller,
        bootSearch: new URL(document.querySelector('script[src*="host/boot.js"]').src).search,
        bridge: !!window.__sasjsMockBridgeInstalled, status: response.status, error: !!(ready && ready.error) };
    })()`)
      check('upgrade avoids stale cached host scripts', upgraded.stale, false)
      check(
        'upgraded real worker serves API',
        [upgraded.controlled, upgraded.bridge, upgraded.status, upgraded.error],
        [true, true, 200, false]
      )
      const upgradedRequests = server.hostRequests().slice(2)
      check(
        'both host assets requested using boot build version',
        upgradedRequests.sort(),
        ['/host/intercept.js', '/host/persist.js'].map(
          (name) => name + upgraded.bootSearch
        )
      )
      assert.match(upgraded.bootSearch, /^\?v=[0-9a-f]{10}$/)
      await closeServer()
    }

    // The generated boot URL must not be redirected under an app's <base>.
    if (run('base-href')) {
      const baseSite = await buildSite(path.join(root, 'base-site'), true)
      await navigate('base-href', { site: baseSite })
      const base = await evaluate(`(async () => {
      const ready = await window.__sasjsMockReady;
      const response = await fetch('/SASjsApi/info');
      return { base: document.baseURI, boot: document.querySelector('script[src*="host/boot.js"]').src,
        readyError: !!(ready && ready.error), controlled: !!navigator.serviceWorker.controller,
        bridge: !!window.__sasjsMockBridgeInstalled, status: response.status, rendered: document.querySelector('#app').textContent };
    })()`)
      check(
        'app base href is preserved',
        new URL(base.base).pathname,
        '/app-assets/'
      )
      check(
        'generated boot URL remains at site root',
        new URL(base.boot).pathname,
        '/host/boot.js'
      )
      check(
        'base href page reaches real worker',
        [
          base.readyError,
          base.controlled,
          base.bridge,
          base.status,
          base.rendered
        ],
        [false, true, true, 200, 'rendered on native load']
      )
      await closeServer()
    }

    for (const mode of [
      'worker-error',
      'persist-error',
      'bridge-error',
      'config-error',
      'identity-error'
    ]) {
      if (!run('failures') && !run(mode)) continue
      await navigate(mode)
      const failure = await evaluate(`(async () => {
        const p = window.__sasjsMockReady;
        if (!p || typeof p.then !== 'function') return { state: 'missing' };
        return await Promise.race([
          p.then(value => ({ state: 'resolved', error: value && value.error ? String(value.error) : '' }),
            error => ({ state: 'rejected', error: String(error) })),
          new Promise(resolve => setTimeout(() => resolve({state: 'timeout'}), 12000))
        ]);
      })()`)
      console.log(`${mode} readiness:`, JSON.stringify(failure))
      assert.ok(
        failure.state === 'rejected' && failure.error,
        `${mode}: readiness must reject with a meaningful error, got ${JSON.stringify(failure)}`
      )
      check(
        `${mode}: app renders despite host failure`,
        await evaluate('document.querySelector("#app").textContent'),
        'rendered on native load'
      )
      console.log(`PASS ${mode}: failure rejects with error`)
      await closeServer()
    }
  } finally {
    if (ws) ws.close()
    if (chromium) {
      if (chromium.exitCode === null && chromium.signalCode === null)
        chromium.kill('SIGTERM')
      if (exited) {
        let timer
        await Promise.race([
          exited,
          new Promise((resolve) => {
            timer = setTimeout(() => {
              chromium.kill('SIGKILL')
              resolve()
            }, 3000)
          })
        ])
        clearTimeout(timer)
        await exited
      }
    }
    if (server && server.listening) {
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    }
    await fs.rm(root, { recursive: true, force: true })
  }
}
main().catch((error) => {
  console.error('Browser regression failed:', error.stack || error)
  process.exitCode = 1
})

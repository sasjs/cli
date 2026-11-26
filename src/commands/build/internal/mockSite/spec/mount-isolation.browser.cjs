#!/usr/bin/env node
// Real generated sites, one origin, one Chromium profile. NEGATIVE_CONTROL=1
// serves the old persistence asset to demonstrate the regression.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const ts = require('typescript')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const mounts = ['', '/sasjs/minimal', '/sas9/minimal', '/viya/minimal']

async function main() {
  const root = await fs.mkdtemp(path.join(os.homedir(), 'sasjs-mount-test-'))
  const source = path.resolve(__dirname, '../mockSite.ts')
  const js = ts.transpileModule(await fs.readFile(source, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true
    }
  }).outputText
  const mod = new Module(source, module)
  mod.filename = source
  mod.paths = Module._nodeModulePaths(path.dirname(source))
  mod._compile(js, source)
  const sites = new Map()
  async function buildSite(i, mount, revision = 0) {
    const project = path.join(root, `project-${i}`)
    const build = path.join(project, 'sasjsbuild')
    await fs.mkdir(path.join(project, 'web'), { recursive: true })
    await fs.mkdir(path.join(build, 'services'), { recursive: true })
    await fs.writeFile(
      path.join(project, 'web/index.html'),
      '<!doctype html><html><head></head><body>mount test</body></html>'
    )
    await fs.writeFile(
      path.join(build, 'services', 'seed.js'),
      `_webout=${JSON.stringify(JSON.stringify({ mount, revision }))};`
    )
    process.projectDir = project
    process.sasjsConstants = { buildDestinationFolder: build }
    process.sasjsConfig = { syncFolder: 'sasjs' }
    process.logger = { warn() {}, info() {} }
    const result = await mod.exports.buildMockSite({
      name: `site-${i}`,
      serverType: 'SASJS',
      appLoc: '/Public/app/test',
      streamConfig: {
        webSourcePath: './web',
        mockWebBasePath: mount,
        mockApi: true
      }
    })
    sites.set(mount, result.outputFolder)
  }
  for (const [i, mount] of mounts.entries()) await buildSite(i, mount)
  await fs.cp(
    path.join(sites.get(''), 'api-console'),
    path.join(sites.get(''), 'tools/api-console'),
    { recursive: true }
  )
  let holdNestedWorker = false
  let releaseNestedWorker
  let nestedWorkerRequested = false
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(
        new URL(req.url, 'http://localhost').pathname
      )
      if (pathname === '/test-worker-gate') {
        nestedWorkerRequested = true
        await new Promise((resolve) => {
          releaseNestedWorker = resolve
        })
        res.end('ok')
        return
      }
      const mount = [...mounts]
        .sort((a, b) => b.length - a.length)
        .find((m) => !m || pathname === m || pathname.startsWith(m + '/'))
      let name = pathname.slice(mount.length) || '/'
      if (name.endsWith('/')) name += 'index.html'
      let data = await fs.readFile(path.join(sites.get(mount), name))
      if (
        process.env.RESET_NEGATIVE_CONTROL &&
        (name === '/host/persist.js' || name === '/sw.js')
      ) {
        data = require('node:child_process').execFileSync(
          'git',
          [
            'show',
            'b24b8d9:src/commands/build/internal/mockSite/assets/' +
              path.basename(name)
          ],
          { cwd: __dirname }
        )
      }
      if (holdNestedWorker && mount === mounts[1] && name === '/sw.js') {
        data = Buffer.from(
          data
            .toString()
            .replace(
              "self.addEventListener('install', () => self.skipWaiting())",
              "self.addEventListener('install', (event) => event.waitUntil(fetch('/test-worker-gate').then(() => self.skipWaiting())))"
            )
        )
      }
      if (process.env.NEGATIVE_CONTROL && name === '/host/persist.js') {
        let text = data.toString()
        text = text
          .replace(
            "const DB_NAME = 'sasjs-mock-host' + suffix",
            "const DB_NAME = 'sasjs-mock-host'"
          )
          .replace(
            "const BUILD_STAMP_KEY = 'sasjs-mock-build' + suffix",
            "const BUILD_STAMP_KEY = 'sasjs-mock-build'"
          )
        data = Buffer.from(text)
      }
      res.setHeader(
        'Content-Type',
        name.endsWith('.js')
          ? 'application/javascript'
          : name.endsWith('.json')
            ? 'application/json'
            : 'text/html'
      )
      res.end(data)
    } catch (_) {
      res.writeHead(404).end('not found')
    }
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const origin = `http://127.0.0.1:${server.address().port}`
  const browser = spawn(
    process.env.CHROMIUM_PATH || 'chromium',
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--remote-debugging-port=0',
      `--user-data-dir=${root}/profile`,
      'about:blank'
    ],
    { stdio: 'ignore' }
  )
  let ws
  try {
    let port
    for (let i = 0; i < 200 && !port; i++) {
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
    assert.ok(port, 'Chromium started')
    const info = await (
      await fetch(`http://127.0.0.1:${port}/json/version`)
    ).json()
    ws = new WebSocket(info.webSocketDebuggerUrl)
    await once(ws, 'open')
    let id = 0
    const pending = new Map()
    ws.addEventListener('message', ({ data }) => {
      const msg = JSON.parse(data)
      if (!pending.has(msg.id)) return
      const p = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error
        ? p.reject(Error(JSON.stringify(msg.error)))
        : p.resolve(msg.result)
    })
    const send = (method, params = {}, sessionId) =>
      new Promise((resolve, reject) => {
        const next = ++id
        pending.set(next, { resolve, reject })
        ws.send(JSON.stringify({ id: next, method, params, sessionId }))
      })
    async function tab() {
      const { targetId } = await send('Target.createTarget', {
        url: 'about:blank'
      })
      const { sessionId } = await send('Target.attachToTarget', {
        targetId,
        flatten: true
      })
      await send('Page.enable', {}, sessionId)
      return sessionId
    }
    async function evaluate(session, expression) {
      const result = await send(
        'Runtime.evaluate',
        { expression, awaitPromise: true, returnByValue: true },
        session
      )
      if (result.exceptionDetails)
        throw Error(JSON.stringify(result.exceptionDetails))
      return result.result.value
    }
    async function navigate(session, mount) {
      await send('Page.navigate', { url: origin + mount + '/' }, session)
      for (let i = 0; i < 300; i++) {
        try {
          if (
            await evaluate(
              session,
              `location.pathname === ${JSON.stringify(mount + '/')} && !!window.__sasjsMockReady`
            )
          )
            break
        } catch (_) {}
        await sleep(50)
      }
      const result = await evaluate(
        session,
        `(async () => { await window.__sasjsMockReady; return {controlled: !!navigator.serviceWorker.controller, script: navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL} })()`
      )
      assert.ok(
        result.controlled &&
          new URL(result.script).pathname === mount + '/sw.js',
        JSON.stringify(result)
      )
    }
    const a = await tab(),
      b = await tab()
    // Start the root worker, then use a copied console two folders down. Drive
    // the console's own UI and inspect the API request, not just a derived URL.
    await navigate(a, '')
    await send('Network.enable', {}, a)
    const requests = []
    ws.addEventListener('message', ({ data }) => {
      const msg = JSON.parse(data)
      if (msg.sessionId === a && msg.method === 'Network.requestWillBeSent')
        requests.push(msg.params.request.url)
    })
    await send('Page.navigate', { url: origin + '/tools/api-console/' }, a)
    for (let i = 0; i < 300; i++) {
      if (
        await evaluate(a, `!!document.querySelector('#routes .route')`).catch(
          () => false
        )
      )
        break
      await sleep(50)
    }
    await evaluate(
      a,
      `document.querySelector('#routes .route').click(); document.querySelector('#send').click()`
    )
    for (let i = 0; i < 200; i++) {
      if (requests.some((url) => url.includes('/SASjsApi/'))) break
      await sleep(50)
    }
    await evaluate(
      a,
      `(async () => { for (let i = 0; i < 200 && document.querySelector('#response').hidden; i++) await new Promise(r => setTimeout(r, 50)); if (document.querySelector('#response').hidden || !document.querySelector('#status').textContent.startsWith('200')) throw Error('console response: ' + document.querySelector('#status').textContent) })()`
    )
    const consoleRequests = requests.filter((url) => url.includes('/SASjsApi/'))
    assert.ok(consoleRequests.length, 'root console sent an API request')
    assert.ok(
      consoleRequests.every((url) =>
        new URL(url).pathname.startsWith('/SASjsApi/')
      ),
      JSON.stringify(consoleRequests)
    )
    // The root worker initially controls the nested page. Hold installation to
    // ensure the console never boots persistence or issues calls against it.
    requests.length = 0
    holdNestedWorker = true
    await send(
      'Page.navigate',
      { url: origin + mounts[1] + '/api-console/' },
      a
    )
    for (let i = 0; i < 200 && !nestedWorkerRequested; i++) await sleep(50)
    assert.ok(nestedWorkerRequested, 'nested worker requested')
    assert.equal(
      new URL(await evaluate(a, 'navigator.serviceWorker.controller.scriptURL'))
        .pathname,
      '/sw.js'
    )
    assert.ok(
      !requests.some((url) => url.includes('/host/persist.js')),
      'persistence waits for nested controller'
    )
    assert.ok(
      !requests.some((url) => url.includes('/SASjsApi/')),
      'no API calls while old worker controls page'
    )
    holdNestedWorker = false
    releaseNestedWorker()
    for (let i = 0; i < 300; i++) {
      if (
        await evaluate(a, `!!document.querySelector('#routes .route')`).catch(
          () => false
        )
      )
        break
      await sleep(50)
    }
    assert.equal(
      new URL(await evaluate(a, 'navigator.serviceWorker.controller.scriptURL'))
        .pathname,
      mounts[1] + '/sw.js'
    )
    await evaluate(
      a,
      `document.querySelector('#routes .route').click(); document.querySelector('#send').click()`
    )
    for (let i = 0; i < 200; i++) {
      if (requests.some((url) => url.includes('/SASjsApi/'))) break
      await sleep(50)
    }
    await evaluate(
      a,
      `(async () => { for (let i = 0; i < 200 && document.querySelector('#response').hidden; i++) await new Promise(r => setTimeout(r, 50)); if (document.querySelector('#response').hidden || !document.querySelector('#status').textContent.startsWith('200')) throw Error('console response: ' + document.querySelector('#status').textContent) })()`
    )
    const nestedCalls = requests.filter((url) => url.includes('/SASjsApi/'))
    assert.ok(
      nestedCalls.length &&
        nestedCalls.every((url) =>
          new URL(url).pathname.startsWith(mounts[1] + '/SASjsApi/')
        ),
      JSON.stringify(nestedCalls)
    )
    for (const [i, mount] of mounts.entries()) {
      await navigate(a, mount)
      await evaluate(
        a,
        `window.SASjsMock.writeFiles({'/isolation-marker': ${JSON.stringify('value-' + i)}})`
      )
      const got = await evaluate(a, `window.SASjsMock.readAll()`)
      assert.equal(got['/isolation-marker'], 'value-' + i)
    }
    for (const [i, mount] of mounts.entries()) {
      await navigate(a, mount)
      const got = await evaluate(a, `window.SASjsMock.readAll()`)
      assert.equal(
        got['/isolation-marker'],
        'value-' + i,
        `drive for ${mount || '/'}`
      )
    }
    for (const [i, mount] of mounts.entries()) {
      await navigate(a, mount)
      const result = await evaluate(
        a,
        `(async () => { const form = new FormData(); form.set('file', new Blob([${JSON.stringify('api-')} + ${i}]), 'mount.txt'); const r = await fetch(${JSON.stringify(mount + '/SASjsApi/drive/file?_filePath=')} + encodeURIComponent('/Public/app/test/mount.txt'), { method: 'POST', body: form }); return { status: r.status, body: await r.text() } })()`
      )
      assert.equal(result.status, 200, JSON.stringify(result))
    }
    for (const [i, mount] of mounts.entries()) {
      await navigate(a, mount)
      const result = await evaluate(
        a,
        `(async () => { const r = await fetch(${JSON.stringify(mount + '/SASjsApi/drive/file?_filePath=')} + encodeURIComponent('/Public/app/test/mount.txt')); return {status:r.status, body:await r.text()} })()`
      )
      assert.equal(result.body, 'api-' + i, `API drive for ${mount || '/'}`)
    }
    await navigate(a, mounts[1])
    await navigate(b, mounts[2])
    await evaluate(a, `window.SASjsMock.writeFiles({'/concurrent': 'a'})`)
    await evaluate(b, `window.SASjsMock.writeFiles({'/concurrent': 'b'})`)
    assert.equal(
      (await evaluate(a, 'window.SASjsMock.readAll()'))['/concurrent'],
      'a'
    )
    assert.equal(
      (await evaluate(b, 'window.SASjsMock.readAll()'))['/concurrent'],
      'b'
    )
    await evaluate(a, `window.SASjsMock.as('sasjsuser')`)
    await sleep(300)
    await navigate(a, mounts[1])
    assert.equal(
      (await evaluate(a, 'window.SASjsMock.identity()')).subject,
      'sasjsuser'
    )
    assert.equal(await evaluate(b, 'window.SASjsMock.identity()'), null)
    await buildSite(2, mounts[2], 1)
    await navigate(b, mounts[2])
    assert.equal(
      (await evaluate(b, 'window.SASjsMock.readAll()'))['/concurrent'],
      undefined,
      'rebuilt mount reseeds'
    )
    await navigate(a, mounts[1])
    assert.equal(
      (await evaluate(a, 'window.SASjsMock.readAll()'))['/concurrent'],
      'a',
      'other mount survives rebuild'
    )
    assert.equal(
      (await evaluate(a, 'window.SASjsMock.identity()')).subject,
      'sasjsuser'
    )
    await navigate(b, mounts[1])
    for (const session of [a, b]) {
      await evaluate(
        session,
        `(() => {
        const open = indexedDB.open.bind(indexedDB);
        window.allowPersistence = false;
        window.allowOldWrite = false;
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function(value, key) {
          if (!window.allowOldWrite && typeof key === 'string' && key.endsWith('/before-reset.txt')) throw Error('test old write outage');
          return put.call(this, value, key);
        };
        indexedDB.open = (...args) => {
          if (!window.allowPersistence) throw Error('test storage outage');
          return open(...args);
        };
      })()`
      )
    }
    const write = async (name, value) =>
      evaluate(
        a,
        `(async () => { const form = new FormData(); form.set('file', new Blob([${JSON.stringify(value)}]), ${JSON.stringify(name)}); const r = await fetch(${JSON.stringify(mounts[1] + '/SASjsApi/drive/file?_filePath=')} + encodeURIComponent(${JSON.stringify('/Public/app/test/')} + ${JSON.stringify(name)}), {method:'POST', body:form}); return r.status })()`
      )
    assert.equal(await write('before-reset.txt', 'stale'), 200)
    await sleep(200)
    for (const session of [a, b])
      await evaluate(session, 'window.allowPersistence = true')
    await evaluate(a, 'window.SASjsMock.reset()')
    await sleep(300)
    for (const session of [a, b])
      await evaluate(session, 'window.allowOldWrite = true')
    assert.equal(await write('after-reset.txt', 'valid'), 200)
    await sleep(400)
    for (const session of [a, b]) {
      const drive = await evaluate(session, 'window.SASjsMock.readAll()')
      assert.ok(
        !Object.keys(drive).some((p) => p.endsWith('/before-reset.txt')),
        JSON.stringify(drive)
      )
      assert.ok(
        Object.entries(drive).some(
          ([p, v]) =>
            p.endsWith('/after-reset.txt') && v === '\u0000base64:dmFsaWQ='
        ),
        JSON.stringify(drive)
      )
    }
    console.log(
      'PASS reset: two pages with failed old reports retain post-reset write'
    )
    console.log(
      'PASS generated mounts: root and three nested sites, switching, concurrent tabs, identity and rebuild'
    )
  } finally {
    if (ws) ws.close()
    browser.kill()
    server.close()
  }
}
main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})

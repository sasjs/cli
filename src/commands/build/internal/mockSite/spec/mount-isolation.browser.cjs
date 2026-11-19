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
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(
        new URL(req.url, 'http://localhost').pathname
      )
      const mount = [...mounts]
        .sort((a, b) => b.length - a.length)
        .find((m) => !m || pathname === m || pathname.startsWith(m + '/'))
      let name = pathname.slice(mount.length) || '/'
      if (name.endsWith('/')) name += 'index.html'
      let data = await fs.readFile(path.join(sites.get(mount), name))
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

#!/usr/bin/env node
/* Real adapter + generated mock site + real Chromium service worker.
 * Run: ADAPTER_BUNDLE=/path/to/sasjs-adapter.js /opt/node-hermes/bin/node src/commands/build/internal/mockSite/spec/sas9-adapter.browser.cjs
 * The default installed adapter must include mock readiness (adapter PR #979).
 * The getdata fixture is copied unchanged from minimal-seed-app; its SAS twin
 * uses %webout(FETCH). No application or adapter code is patched. */
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const fs = require('node:fs/promises')
const http = require('node:http')
const Module = require('node:module')
const os = require('node:os')
const path = require('node:path')
const ts = require('typescript')

const dir = path.resolve(__dirname, '..')
const fixtures = path.join(__dirname, 'fixtures/sas9-adapter')
const appLoc = '/Public/app/test'
const values = ['Alder Basin', 'café, "spring"\nnext; line', 'tab\there']
const springs = values.map((AREA, i) => ({ AREA, NAME: `spring-${i}` }))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function buildSite(root, targetType, basePath) {
  const web = path.join(root, 'web')
  const build = path.join(root, 'sasjsbuild')
  const services = path.join(build, 'services/common')
  await fs.mkdir(web, { recursive: true })
  await fs.mkdir(services, { recursive: true })
  await fs.copyFile(
    path.join(fixtures, 'getdata.js'),
    path.join(services, 'getdata.js')
  )
  await fs.writeFile(
    path.join(services, 'springs.json'),
    JSON.stringify(springs)
  )
  // An extra independent service verifies both uploaded files, not just areas.
  await fs.writeFile(
    path.join(services, 'uploads.js'),
    `
    const files = [];
    for (let i = 1; i <= _WEBIN_FILE_COUNT; i++) {
      files.push({name: eval('_WEBIN_NAME' + i), filename: eval('_WEBIN_FILENAME' + i), csv: String(eval('_WEBIN_FILEREF' + i))});
    }
    webout('OPEN'); webout('OBJ', 'files', files); webout('CLOSE');`
  )
  await fs.writeFile(
    path.join(services, 'fetch.js'),
    `
    const inputs = webout('FETCH');
    webout('OPEN'); webout('OBJ', 'areas', inputs.areas);
    webout('OBJ', 'extra', inputs.extra); webout('CLOSE');`
  )
  await fs.copyFile(
    process.env.ADAPTER_BUNDLE ||
      require.resolve('@sasjs/adapter/dist/sasjs-adapter.js'),
    path.join(web, 'adapter.js')
  )
  await fs.writeFile(
    path.join(web, 'early.js'),
    `window.mountEarly = { config: !!document.querySelector('sasjs'), observer: !!window.__sasjsMountObserver };`
  )
  await fs.writeFile(
    path.join(web, 'late.js'),
    `window.mountLate = document.querySelector('sasjs').getAttribute('serverurl');`
  )
  await fs.writeFile(
    path.join(web, 'app.js'),
    `
    window.startup = { sent: false, readySettledAtSend: false };
    window.__sasjsMockReady.then(() => { startup.readySettled = true }, () => { startup.readySettled = true });
    window.addEventListener('load', () => {
      const el = document.querySelector('sasjs');
      const sas = new SASjs.default({ serverUrl: el.getAttribute('serverurl'), serverType: el.getAttribute('servertype'), appLoc: el.getAttribute('apploc') });
      startup.readySettledAtSend = !!startup.readySettled;
      startup.sent = true;
      const data = { areas: ${JSON.stringify(values.map((AREA) => ({ AREA })))}, extra: [{ NOTE: 'second, "table"\\n雪; ok' }] };
      startup.request = Promise.all([
        sas.request('services/common/getdata', data),
        sas.request('services/common/fetch', data)
      ]).then(([value, fetched]) => ({value, fetched}), error => ({error: String(error && (error.message || error)), detail: JSON.stringify(error)})).then(value => { startup.settled = true; return value });
    });`
  )
  await fs.writeFile(
    path.join(web, 'index.html'),
    `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="script-src 'self'"><script src="early.js"></script></head><body><sasjs serverurl="https://example.invalid" apploc="/Public/app/test" servertype="SASJS" loginmechanism="Redirected"></sasjs><script src="late.js"></script><script src="adapter.js"></script><script src="app.js"></script>adapter fixture</body></html>`
  )
  const file = path.join(dir, 'mockSite.ts')
  const js = ts.transpileModule(await fs.readFile(file, 'utf8'), {
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
  process.logger = { warn() {}, info() {} }
  const site = await mod.exports.buildMockSite({
    name: targetType,
    serverType: targetType,
    appLoc,
    streamConfig: {
      webSourcePath: './web',
      mockApi: false,
      mockWebBasePath: basePath
    }
  })
  return site.outputFolder
}

function serve(site, basePath) {
  const network = []
  let releasePersist
  const persistHold = new Promise((resolve) => {
    releasePersist = resolve
  })
  let persistRequested
  const persistStarted = new Promise((resolve) => {
    persistRequested = resolve
  })
  const server = http.createServer(async (req, res) => {
    const pathname = decodeURIComponent(
      new URL(req.url, 'http://localhost').pathname
    )
    const apiPath =
      basePath && pathname.startsWith(basePath + '/')
        ? pathname.slice(basePath.length)
        : pathname
    if (/(^|\/)(SASStoredProcess|SASjsApi|api)(\/|$)/i.test(apiPath)) {
      network.push(req.url)
      res.writeHead(404).end('no network API')
      return
    }
    if (basePath && !pathname.startsWith(basePath + '/'))
      return res.writeHead(404).end('outside mount')
    const relativePath = basePath ? pathname.slice(basePath.length) : pathname
    const name = relativePath === '/' ? '/index.html' : relativePath
    if (name === '/host/persist.js') {
      persistRequested()
      await persistHold
    }
    const file = path.resolve(site, '.' + name)
    if (!file.startsWith(site + path.sep)) return res.writeHead(403).end()
    try {
      const data = await fs.readFile(file)
      const type = name.endsWith('.js')
        ? 'application/javascript'
        : name.endsWith('.json')
          ? 'application/json'
          : 'text/html'
      res
        .writeHead(200, {
          'Content-Type': `${type}; charset=utf-8`,
          'Cache-Control': 'no-store'
        })
        .end(data)
    } catch (_) {
      res.writeHead(404).end('not found')
    }
  })
  server.network = network
  server.persistStarted = persistStarted
  server.releasePersist = releasePersist
  return server
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sas9-adapter-browser-'))
  let chromium, ws, server, exited
  const failures = []
  try {
    const sites = []
    for (const type of ['SASJS', 'SAS9']) {
      for (const basePath of ['', '/demo/nested']) {
        sites.push({
          target: type,
          basePath,
          site: await buildSite(
            path.join(root, type, basePath ? 'nested' : 'root'),
            type,
            basePath
          )
        })
      }
    }
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
    let stderr = ''
    chromium.stderr.on('data', (data) => {
      stderr += data
    })
    let spawnError
    chromium.on('error', (err) => {
      spawnError = err
    })
    exited = once(chromium, 'close')
    let port
    for (let i = 0; i < 200 && !port; i++) {
      if (spawnError) throw spawnError
      if (chromium.exitCode !== null) throw new Error(stderr)
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
    if (!port) throw new Error('Chromium startup timed out: ' + stderr)
    const version = await (
      await fetch(`http://127.0.0.1:${port}/json/version`)
    ).json()
    ws = new WebSocket(version.webSocketDebuggerUrl)
    await once(ws, 'open')
    let id = 0
    const pending = new Map()
    const apiRequests = []
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (
        message.method === 'Network.requestWillBeSent' &&
        /\/(SASjsApi|SASStoredProcess)\//.test(message.params.request.url)
      )
        apiRequests.push(message.params.request.url)
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
    await send('Network.enable', {}, sessionId)
    const evaluate = async (expression) => {
      const result = await send(
        'Runtime.evaluate',
        { expression, awaitPromise: true, returnByValue: true },
        sessionId
      )
      if (result.exceptionDetails)
        throw new Error(JSON.stringify(result.exceptionDetails))
      return result.result.value
    }
    for (const { target, basePath, site } of sites) {
      const mountLabel = basePath || '/'
      console.log(`SITE ${target} mount=${mountLabel}`)
      apiRequests.length = 0
      server = serve(site, basePath)
      server.listen(0, '127.0.0.1')
      await once(server, 'listening')
      await send(
        'Page.navigate',
        { url: `http://127.0.0.1:${server.address().port}${basePath}/` },
        sessionId
      )
      let loaded = false
      for (let i = 0; i < 200; i++) {
        if (
          await evaluate(
            'document.readyState === "complete" && !!window.__sasjsMockReady && !!window.SASjs'
          )
        ) {
          loaded = true
          break
        }
        await sleep(50)
      }
      assert.ok(loaded, `${target} fixture loaded`)
      await Promise.race([
        server.persistStarted,
        sleep(10000).then(() => {
          throw new Error(
            `${target} ${mountLabel}: persistence request timed out`
          )
        })
      ])
      await sleep(250)
      const held = await evaluate(
        '({ sent: !!window.startup?.sent, settled: !!window.startup?.settled, ready: !!window.startup?.readySettled })'
      )
      const sentWhileHeld = [...apiRequests]
      server.releasePersist()
      try {
        assert.deepEqual(
          held,
          { sent: true, settled: false, ready: false },
          `${target} ${mountLabel}: native load sent requests while readiness was held`
        )
        assert.deepEqual(
          sentWhileHeld,
          [],
          `${target} ${mountLabel}: adapter must not send API traffic before readiness`
        )
        console.log(`PASS ${target} readiness gate held startup transport`)
      } catch (error) {
        failures.push(error.stack)
        console.error(`FAIL ${target} readiness gate: ${error.message}`)
      }
      for (const visit of ['first navigation', 'reload']) {
        if (visit === 'reload') {
          const previous = await evaluate('performance.timeOrigin')
          await send('Page.reload', {}, sessionId)
          for (let i = 0; i < 200; i++) {
            if (
              await evaluate(
                `performance.timeOrigin !== ${previous} && document.readyState === "complete" && !!window.startup && !!startup.request`
              )
            )
              break
            await sleep(50)
          }
        }
        const mount = await evaluate(
          `({early: window.mountEarly, late: window.mountLate, tags: document.querySelectorAll('script[src*="/host/mount-config.js?"]').length})`
        )
        assert.deepEqual(
          mount.early,
          { config: false, observer: !!basePath },
          `${target} ${visit}: early app script`
        )
        assert.equal(
          mount.late,
          basePath
            ? `http://127.0.0.1:${server.address().port}${basePath}`
            : '',
          `${target} ${visit}: synchronous late app script`
        )
        assert.equal(
          mount.tags,
          basePath ? 1 : 0,
          `${target} ${visit}: mount script count`
        )
        const startup = await evaluate(`(async()=>{
          if (!window.startup || !startup.request) return {missing: true};
          const response = await Promise.race([startup.request, new Promise(r => setTimeout(() => r({timeout:true}), 15000))]);
          return { response, readySettledAtSend: startup.readySettledAtSend };
        })()`)
        try {
          assert.deepEqual(
            startup.response.value && startup.response.value.springs,
            springs,
            `${target} ${visit}: native-load request before awaiting readiness; result ${JSON.stringify(startup)}`
          )
          assert.deepEqual(
            startup.response.fetched && startup.response.fetched.areas,
            values.map((AREA) => ({ AREA })),
            `${target} ${visit}: native-load webout(FETCH) areas`
          )
          assert.deepEqual(
            startup.response.fetched && startup.response.fetched.extra,
            [{ NOTE: 'second, "table"\n雪; ok' }],
            `${target} ${visit}: native-load webout(FETCH) extra`
          )
          assert.deepEqual(
            server.network,
            [],
            `${target} ${visit}: no static API fallthrough`
          )
          console.log(
            `PASS ${target} ${visit} native-load adapter request (ready at send: ${startup.readySettledAtSend})`
          )
        } catch (error) {
          failures.push(error.stack)
          console.error(
            `FAIL ${target} ${visit}: ${error.message}; static API requests: ${JSON.stringify(server.network)}`
          )
        }
      }
      const boot = await evaluate(
        `(async()=>{ await window.__sasjsMockReady; const el = document.querySelector('sasjs'); return { controlled: !!navigator.serviceWorker.controller, bridge: !!window.__sasjsMockBridgeInstalled, adapter: typeof SASjs.default, serverType: el.getAttribute('servertype'), appLoc: el.getAttribute('apploc'), serverUrl: el.getAttribute('serverurl') }; })()`
      )
      assert.equal(
        boot.controlled,
        true,
        `${target}: service worker controls page`
      )
      assert.equal(boot.bridge, true, `${target}: XHR bridge installed`)
      assert.equal(
        boot.adapter,
        'function',
        `${target}: real adapter constructor`
      )
      console.log(`PASS ${target} worker control and real adapter`)

      try {
        const expectedServerUrl = basePath
          ? `http://127.0.0.1:${server.address().port}${basePath}`
          : ''
        assert.deepEqual(
          [boot.serverType, boot.appLoc, boot.serverUrl],
          [target, appLoc, expectedServerUrl],
          `${target}: generated target configuration`
        )
        console.log(`PASS ${target} generated target configuration`)
      } catch (error) {
        failures.push(error.stack)
        console.error('FAIL target configuration: ' + error.message)
      }
      // The frontend uses the generated tag unchanged, as consuming apps do.
      // Semicolon makes SASJS choose the multipart file-upload transport.
      for (const debug of [false, true]) {
        const label = `${target} target / debug=${debug}`
        try {
          const result = await evaluate(`(async()=>{
            const el = document.querySelector('sasjs');
            const sas = new SASjs.default({ serverUrl: el.getAttribute('serverurl'), serverType: el.getAttribute('servertype'), appLoc: el.getAttribute('apploc'), debug: ${debug} });
            const data = { areas: ${JSON.stringify(values.map((AREA) => ({ AREA })))}, extra: [{ NOTE: 'second, "table"\\n雪; ok' }] };
            try {
              const getdata = await sas.request('services/common/getdata', data);
              const uploads = await sas.request('services/common/uploads', data);
              const fetched = await sas.request('services/common/fetch', data);
              let missing;
              try { missing = { resolved: await sas.request('services/common/does-not-exist', data) }; }
              catch(e) { missing = { rejected: true, error: String(e && (e.message || e)) }; }
              return { getdata, uploads, fetched, missing };
            } catch(e) { return { error: String(e && (e.message || e)), detail: JSON.stringify(e) }; }
          })()`)
          assert.equal(
            result.error,
            undefined,
            `${label}: ${JSON.stringify(result)}`
          )
          assert.deepEqual(
            result.getdata.springs,
            springs,
            `${label}: existing mock selected all special-character rows`
          )
          assert.deepEqual(
            result.uploads.files.map((f) => [f.name, f.filename]),
            [
              ['areas', 'areas.csv'],
              ['extra', 'extra.csv']
            ],
            `${label}: both named uploads`
          )
          assert.match(
            result.uploads.files[0].csv,
            /café, ""spring""\nnext; line/
          )
          assert.match(result.uploads.files[0].csv, /tab\there/)
          assert.match(result.uploads.files[1].csv, /second, ""table""\n雪; ok/)
          assert.deepEqual(
            result.fetched.areas,
            values.map((AREA) => ({ AREA })),
            `${label}: webout(FETCH) parsed areas`
          )
          assert.deepEqual(
            result.fetched.extra,
            [{ NOTE: 'second, "table"\n雪; ok' }],
            `${label}: webout(FETCH) parsed second table`
          )
          assert.deepEqual(
            result.missing.resolved,
            {
              status: 'failure',
              message: 'Job execution failed.',
              error: `Error: Program not found in drive: ${appLoc}/services/common/does-not-exist`
            },
            `${label}: missing mock reports the missing program, not success: ${JSON.stringify(result.missing)}`
          )
          assert.deepEqual(
            server.network,
            [],
            `${label}: no API request may fall through to static host`
          )
          console.log('PASS ' + label)
        } catch (error) {
          failures.push(`${label}: ${error.stack || error}`)
          console.error('FAIL ' + label + ': ' + error.message)
        }
      }
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
      server = null
    }
    if (failures.length)
      throw new Error(
        `${failures.length} browser cases failed:\n${failures.join('\n')}`
      )
  } finally {
    if (ws) ws.close()
    if (chromium) {
      if (chromium.exitCode === null && chromium.signalCode === null)
        chromium.kill('SIGTERM')
      if (exited)
        await Promise.race([
          exited,
          sleep(3000).then(() => chromium.kill('SIGKILL'))
        ])
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

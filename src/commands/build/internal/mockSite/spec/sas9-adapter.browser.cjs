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
const edgeSprings = [
  { AREA: 'null', NAME: 'literal-null' },
  { AREA: '0', NAME: 'character-zero' },
  { AREA: '.A', NAME: 'literal-special' },
  { AREA: ' A', NAME: 'leading' },
  { AREA: 'A  ', NAME: 'trailing' },
  { AREA: '  ', NAME: 'missing-character' }
]
const allSprings = [
  ...springs,
  { AREA: 'undefined', NAME: 'missing-column' },
  ...edgeSprings
]
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
    JSON.stringify(allSprings)
  )
  // An extra independent service verifies both uploaded files, not just areas.
  await fs.writeFile(
    path.join(services, 'nestedapi.js'),
    `const headers = fs.readFileSync(_SASJS_TOKENFILE, 'utf8');
     const response = await fetch(_SASJS_APISERVERURL + '/SASjsApi/info/myAuthorizedRoutes');
     const session = await fetch(_SASJS_APISERVERURL + '/SASjsApi/session', {headers: Object.fromEntries(headers ? [headers.split(/: +/)] : [])});
     _webout = JSON.stringify({url: _SASJS_APISERVERURL, status: response.status, paths: (await response.json()).paths, username: _SASJS_USERNAME, session: (await session.json()).username, hasBearer: headers.startsWith('Authorization: Bearer ')});`
  )
  await fs.writeFile(
    path.join(services, 'uploads.js'),
    `
    const files = [];
    for (let i = 1; i <= _WEBIN_FILE_COUNT; i++) {
      files.push({name: eval('_WEBIN_NAME' + i), filename: eval('_WEBIN_FILENAME' + i), csv: fs.readFileSync(eval('_WEBIN_FILEREF' + i), 'utf8')});
    }
    webout('OPEN'); webout('OBJ', 'files', files); webout('CLOSE');`
  )
  await fs.writeFile(
    path.join(services, 'byteuploads.js'),
    `_webout = JSON.stringify({count: _WEBIN_FILE_COUNT, aliases: _WEBIN_FILE_COUNT ? [_WEBIN_NAME, _WEBIN_FILENAME, _WEBIN_FILEREF === _WEBIN_FILEREF1] : [typeof _WEBIN_NAME, typeof _WEBIN_FILENAME, typeof _WEBIN_FILEREF], files: Array.from({length: _WEBIN_FILE_COUNT}, (_, i) => ({name: eval('_WEBIN_NAME' + (i + 1)), filename: eval('_WEBIN_FILENAME' + (i + 1)), path: eval('_WEBIN_FILEREF' + (i + 1)), hex: fs.readFileSync(eval('_WEBIN_FILEREF' + (i + 1))).toString('hex')}))});`
  )
  await fs.writeFile(
    path.join(services, 'fetch.js'),
    `
    const inputs = webout('FETCH');
    webout('OPEN'); webout('OBJ', 'areas', inputs.areas);
    webout('OBJ', 'extra', inputs.extra); webout('CLOSE');`
  )
  await fs.writeFile(
    path.join(services, 'lazyfetch.js'),
    `const first = webout('FETCH').input; fs.writeFileSync(_WEBIN_FILEREF1, 'VALUE:best.\\n99'); const second = webout('FETCH').input; fs.unlinkSync(_WEBIN_FILEREF1); let error; try { webout('FETCH'); } catch (e) { error = e.code; } _webout = JSON.stringify({first, second, error});`
  )
  await fs.writeFile(
    path.join(services, 'mutateupload.js'),
    `const dir = require('path').dirname(_WEBIN_FILEREF1); const copy = dir + '/copy'; fs.writeFileSync(_WEBIN_FILEREF1, 'abc'); const text = fs.readFileSync(_WEBIN_FILEREF1); fs.writeFileSync(_WEBIN_FILEREF1, Buffer.from([0,255,128])); fs.copyFileSync(_WEBIN_FILEREF1, copy); const binary = fs.readFileSync(copy).toString('hex'); fs.unlinkSync(_WEBIN_FILEREF1); let error; try { fs.readFileSync(_WEBIN_FILEREF1); } catch(e) { error=e.code; } _webout=JSON.stringify({buffer:Buffer.isBuffer(text),hex:text.toString('hex'),binary,error,copy,stream:typeof fs.createReadStream});`
  )
  await fs.writeFile(
    path.join(services, 'uploadprobe.js'),
    `_webout=JSON.stringify({exists:fs.existsSync(file)});`
  )
  await fs.writeFile(
    path.join(services, 'caseparams.js'),
    `_webout = JSON.stringify({ SaSjS1DaTa, sasjs1data, Ordinary, SASJS_TABLES });`
  )
  await fs.writeFile(
    path.join(services, 'casefetch.js'),
    `_webout = JSON.stringify(webout('FETCH'));`
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
      const nestedApi = await evaluate(`(async () => {
        const path = ${JSON.stringify(basePath + '/SASjsApi/stp/execute')} + '?_program=' + encodeURIComponent(${JSON.stringify(appLoc + '/services/common/nestedapi')});
        const as = username => new Promise((resolve, reject) => {
          const listener = event => { if (event.data && event.data.type === 'sasjs-as-ack') { navigator.serviceWorker.removeEventListener('message', listener); event.data.error ? reject(Error(event.data.error)) : resolve(event.data); } };
          navigator.serviceWorker.addEventListener('message', listener);
          navigator.serviceWorker.controller.postMessage({type: 'sasjs-as', username});
        });
        const admin = await as('sasjsadmin');
        const user = await as('sasjsuser');
        const execute = async token => { const response = await fetch(path, {headers: {Authorization: 'Bearer ' + token}}); return {status: response.status, body: await response.json()}; };
        const results = await Promise.all([execute(admin.accessToken), execute(user.accessToken)]);
        await as('admin');
        return {results, origin: location.origin};
      })()`)
      for (const [i, username] of ['sasjsadmin', 'sasjsuser'].entries()) {
        const result = nestedApi.results[i]
        assert.equal(result.status, 200, JSON.stringify(result))
        assert.equal(result.body.url, nestedApi.origin + basePath)
        assert.equal(result.body.status, 200)
        assert.equal(result.body.username, username)
        assert.equal(result.body.session, username)
        assert.equal(result.body.hasBearer, true)
        assert.equal(result.body.paths.includes('/SASjsApi/code/execute'), i === 0)
      }
      assert.deepEqual(server.network, [], `${target}: nested API did not reach static server`)
      console.log(`PASS ${target} service-to-mock API`)

      for (const route of ['/api/stp/execute//', '/SASjsApi/code/execute///', '/SASStoredProcess/do//']) {
        const denied = await evaluate(`(async () => {
          let reads = 0;
          const original = Blob.prototype.arrayBuffer;
          Blob.prototype.arrayBuffer = function () { reads++; return original.call(this); };
          try {
            const form = new FormData();
            form.append('upload', new Blob(['private']), 'private.csv');
            return await new Promise((resolve, reject) => {
              const xhr = new XMLHttpRequest();
              xhr.open('POST', ${JSON.stringify(basePath)} + ${JSON.stringify(route)} + '?_program=' + encodeURIComponent(${JSON.stringify(appLoc + '/services/common/uploads')}));
              xhr.setRequestHeader('Authorization', 'Bearer invalid-token');
              xhr.onload = () => resolve({ status: xhr.status, reads });
              xhr.onerror = reject; xhr.send(form);
            });
          } finally { Blob.prototype.arrayBuffer = original; }
        })()`)
        assert.deepEqual(denied, { status: 401, reads: 0 }, `${target} ${route}: denied before reading`)
      }
      console.log(`PASS ${target} slash-suffixed denied uploads before page file read`)

      for (const route of ['/SASjsApi/code/execute', '/api/CODE/EXECUTE///']) {
        const granted = await evaluate(`(async () => {
          let reads = 0;
          const original = Blob.prototype.arrayBuffer;
          Blob.prototype.arrayBuffer = function () { reads++; return original.call(this); };
          try {
            const grant = await fetch(${JSON.stringify(basePath + '/SASjsApi/info/myAuthorizedRoutes')});
            const paths = (await grant.json()).paths;
            const form = new FormData();
            form.append('code', '_webout = JSON.stringify(Array.from(fs.readFileSync(_WEBIN_FILEREF1)));');
            form.append('runTime', 'js');
            form.append('upload', new Blob([new Uint8Array([239,187,191,0,255])]), 'bytes.bin');
            return await new Promise((resolve, reject) => {
              const xhr = new XMLHttpRequest();
              xhr.open('POST', ${JSON.stringify(basePath)} + ${JSON.stringify(route)});
              xhr.onload = () => resolve({ status: xhr.status, reads, paths, body: xhr.responseText });
              xhr.onerror = reject; xhr.send(form);
            });
          } finally { Blob.prototype.arrayBuffer = original; }
        })()`)
        assert.ok(granted.paths.includes('/SASjsApi/code/execute'), `${target} code route grant`)
        assert.equal(granted.status, 200, `${target} ${route}: ${granted.body}`)
        assert.equal(granted.reads, 1, `${target} ${route}: reads upload`)
        assert.ok(granted.body.includes('[239,187,191,0,255]'), `${target} ${route}: ${granted.body}`)
      }
      console.log(`PASS ${target} authorized code execute XHR exact bytes`)

      const limitProbe = await evaluate(`(async () => {
        const grant = await fetch(${JSON.stringify(basePath + '/SASjsApi/info/myAuthorizedRoutes')});
        const limit = Number(grant.headers.get('x-sasjs-mock-max-upload-bytes'));
        let reads = 0;
        const original = Blob.prototype.arrayBuffer;
        Blob.prototype.arrayBuffer = function () { reads++; return original.call(this); };
        try {
          const form = new FormData();
          form.append('upload', new Blob([new Uint8Array(limit + 1)]), 'large.csv');
          const path = ${JSON.stringify(basePath + '/SASStoredProcess/do')} + '?_program=' + encodeURIComponent(${JSON.stringify(appLoc + '/services/common/uploads')});
          return await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest(); xhr.open('POST', path);
            xhr.onload = () => resolve({status: xhr.status, reads, limit});
            xhr.onerror = reject; xhr.send(form);
          });
        } finally { Blob.prototype.arrayBuffer = original; }
      })()`)
      assert.deepEqual(
        limitProbe,
        { status: 413, reads: 0, limit: 10 * 1024 * 1024 },
        `${target}: advertised worker limit refuses before reading`
      )
      console.log(`PASS ${target} worker upload limit before page file read`)

      for (const transport of ['sas9-fetch', 'sasjs-fetch', 'sas9-xhr', 'sasjs-xhr']) {
        for (const count of [0, 1, 3]) {
          const actual = await evaluate(`(async () => {
            const form = new FormData();
            const samples = [[0xef,0xbb,0xbf,65], [0,255,128,65], []];
            for (let i = 0; i < ${count}; i++) form.append('field' + i, new Blob([new Uint8Array(samples[i])]), 'original' + i + '.bin');
            const url = ${JSON.stringify(basePath)} + (${JSON.stringify(transport)}.startsWith('sas9') ? '/SASStoredProcess/do' : '/SASjsApi/stp/execute') + '?_program=' + encodeURIComponent(${JSON.stringify(appLoc + '/services/common/byteuploads')});
            if (${JSON.stringify(transport)}.endsWith('fetch')) { const r = await fetch(url, {method:'POST', body:form}); return {status:r.status, body:await r.json()}; }
            return await new Promise((resolve,reject) => { const x = new XMLHttpRequest(); x.open('POST',url); x.onload = () => resolve({status:x.status,body:JSON.parse(x.responseText)}); x.onerror=reject; x.send(form); });
          })()`)
          assert.equal(actual.status, 200, JSON.stringify(actual))
          assert.equal(actual.body.count, count)
          assert.deepEqual(
            actual.body.aliases,
            count
              ? ['field0', 'original0.bin', true]
              : ['undefined', 'undefined', 'undefined']
          )
          assert.deepEqual(
            actual.body.files.map((f) => [f.name, f.filename, f.hex]),
            [
              ['field0', 'original0.bin', 'efbbbf41'],
              ['field1', 'original1.bin', '00ff8041'],
              ['field2', 'original2.bin', '']
            ].slice(0, count)
          )
          for (const file of actual.body.files)
            assert.match(file.path, /^\/sasjs\/sessions\//)
          assert.equal(
            new Set(actual.body.files.map((f) => f.path)).size,
            count
          )
          console.log(`PASS ${target} ${transport} ${count} exact-byte uploads`)
        }
        const lazy = await evaluate(`(async () => {
          const form = new FormData();
          form.append('input', new Blob(['VALUE:best.\\r\\n42']), 'input.csv');
          const path = ${JSON.stringify(basePath)} + (${JSON.stringify(transport)}.startsWith('sas9') ? '/SASStoredProcess/do' : '/SASjsApi/stp/execute') + '?_program=' + encodeURIComponent(${JSON.stringify(appLoc + '/services/common/lazyfetch')});
          if (${JSON.stringify(transport)}.endsWith('fetch')) { const r = await fetch(path, {method:'POST', body:form}); return {status:r.status, body:await r.json()}; }
          return await new Promise((resolve,reject) => { const x = new XMLHttpRequest(); x.open('POST',path); x.onload = () => resolve({status:x.status,body:JSON.parse(x.responseText)}); x.onerror=reject; x.send(form); });
        })()`)
        assert.deepEqual(lazy, {status: 200, body: {first: [{VALUE: 42}], second: [{VALUE: 99}], error: 'ENOENT'}}, `${target} ${transport}: FETCH re-reads edited and deleted file`)
        console.log(`PASS ${target} ${transport} lazy FETCH after edit and delete`)
        const mutation = await evaluate(`(async () => {
          const form = new FormData(); form.append('input', new Blob(['initial']), 'input.bin');
          const path = ${JSON.stringify(basePath)} + (${JSON.stringify(transport)}.startsWith('sas9') ? '/SASStoredProcess/do' : '/SASjsApi/stp/execute') + '?_program=' + encodeURIComponent(${JSON.stringify(appLoc + '/services/common/mutateupload')});
          if (${JSON.stringify(transport)}.endsWith('fetch')) { const r = await fetch(path, {method:'POST', body:form}); return {status:r.status, body:await r.json()}; }
          return await new Promise((resolve,reject) => { const x = new XMLHttpRequest(); x.open('POST',path); x.onload = () => resolve({status:x.status,body:JSON.parse(x.responseText)}); x.onerror=reject; x.send(form); });
        })()`)
        assert.equal(mutation.status, 200)
        assert.deepEqual({...mutation.body, copy: undefined}, {buffer:true,hex:'616263',binary:'00ff80',error:'ENOENT',copy:undefined,stream:'undefined'}, `${target} ${transport}: mutation parity and stream limitation`)
        const probe = await evaluate(`(async () => { const url = ${JSON.stringify(basePath + '/SASjsApi/stp/execute')} + '?_program=' + encodeURIComponent(${JSON.stringify(appLoc + '/services/common/uploadprobe')}) + '&file=' + encodeURIComponent(${JSON.stringify(mutation.body.copy)}); const r = await fetch(url); return {status:r.status, body:await r.json()}; })()`)
        assert.deepEqual(probe, {status:200,body:{exists:false}}, `${target} ${transport}: derived upload is transient`)
        console.log(`PASS ${target} ${transport} mutation and cleanup`)
        const result = await evaluate(`(async () => {
          const form = new FormData();
          form.append('SaSjS1DaTa', 'first');
          form.append('sasjs1data', 'lower');
          form.append('SaSjS1DaTa', 'second');
          form.append('Ordinary', 'one');
          form.append('Ordinary', 'two');
          form.append('SASJS_TABLES', 'input');
          const path = ${JSON.stringify(basePath)} + (${JSON.stringify(transport)}.startsWith('sas9') ? '/SASStoredProcess/do' : '/SASjsApi/stp/execute') + '?_program=' + encodeURIComponent(${JSON.stringify(appLoc + '/services/common/caseparams')});
          if (${JSON.stringify(transport)}.endsWith('fetch')) {
            const response = await fetch(path, { method: 'POST', body: form });
            return { status: response.status, body: await response.json() };
          }
          return await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', path);
            xhr.onload = () => resolve({status: xhr.status, body: JSON.parse(xhr.responseText)});
            xhr.onerror = reject;
            xhr.send(form);
          });
        })()`)
        assert.deepEqual(
          result,
          {
            status: 200,
            body: {
              SaSjS1DaTa: 'firstsecond',
              sasjs1data: 'lower',
              Ordinary: 'two',
              SASJS_TABLES: 'input'
            }
          },
          `${target} ${transport}: mixed-case chunks retain caller keys`
        )
        console.log(`PASS ${target} ${transport} mixed-case chunks`)

        const fetched = await evaluate(`(async () => {
          const form = new FormData();
          form.append('SaSjS1DaTa', 'X:$20.\\r\\n');
          form.append('SaSjS1DaTa', 'first');
          form.append('SaSjS1DaTa', 'second');
          form.append('SASJS_TABLES', 'MixedTable');
          const path = ${JSON.stringify(basePath)} + (${JSON.stringify(transport)}.startsWith('sas9') ? '/SASStoredProcess/do' : '/SASjsApi/stp/execute') + '?_program=' + encodeURIComponent(${JSON.stringify(appLoc + '/services/common/casefetch')});
          if (${JSON.stringify(transport)}.endsWith('fetch')) {
            const response = await fetch(path, {method: 'POST', body: form});
            return {status: response.status, body: await response.json()};
          }
          return await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest(); xhr.open('POST', path);
            xhr.onload = () => resolve({status: xhr.status, body: JSON.parse(xhr.responseText)});
            xhr.onerror = reject; xhr.send(form);
          });
        })()`)
        assert.deepEqual(
          fetched,
          {
            status: 200,
            body: { MixedTable: [{ X: 'firstsecond' }] }
          },
          `${target} ${transport}: webout FETCH reads mixed-case chunks`
        )
        console.log(`PASS ${target} ${transport} mixed-case webout FETCH`)

        for (const [csv, expected] of [
          ['AREA:best32.\r\n.\r\n0', []],
          ['AREA:$char40.\r\nnull', [edgeSprings[0]]],
          ['AREA:$char40.\r\n.A', [edgeSprings[2]]],
          ['AREA:$char40.\r\n" A "', [edgeSprings[3]]],
          ['AREA:$char40.\r\nA', [edgeSprings[4]]],
          ['AREA:$char40.\r\n" "', [edgeSprings[5]]]
        ]) {
          const selected = await evaluate(`(async () => {
            const form = new FormData();
            form.append('sasjs1data', ${JSON.stringify(csv)});
            form.append('sasjs_tables', 'areas');
            const url = ${JSON.stringify(basePath)} + (${JSON.stringify(transport)} === 'fetch' ? '/SASjsApi/stp/execute' : '/SASStoredProcess/do') + '?_program=' + encodeURIComponent(${JSON.stringify(appLoc + '/services/common/getdata')});
            if (${JSON.stringify(transport)} === 'fetch') {
              const response = await fetch(url, {method: 'POST', body: form});
              return {status: response.status, body: await response.json()};
            }
            return await new Promise((resolve, reject) => {
              const xhr = new XMLHttpRequest(); xhr.open('POST', url);
              xhr.onload = () => resolve({status: xhr.status, body: JSON.parse(xhr.responseText)});
              xhr.onerror = reject; xhr.send(form);
            });
          })()`)
          assert.equal(selected.status, 200, `${target} ${transport}: ${csv}`)
          assert.deepEqual(
            selected.body.springs,
            expected,
            `${target} ${transport}: ${csv}`
          )
        }
        console.log(
          `PASS ${target} ${transport} character AREA and numeric coercion`
        )
      }

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
              const absentArea = await sas.request('services/common/getdata', {areas: [{OTHER: 'test; file'}]});
              const unrelated = await sas.request('services/common/getdata', {unrelated: [{AREA: 'undefined'}]});
              const uploads = await sas.request('services/common/uploads', data);
              const fetched = await sas.request('services/common/fetch', data);
              const caseResults = [];
              for (const column of ['area', 'AREA', 'ArEa']) {
                const input = { areas: ${JSON.stringify(values)}.map(value => ({ [column]: value })), extra: [{ NOTE: 'second; table' }] };
                caseResults.push({ column, getdata: await sas.request('services/common/getdata', input), fetched: await sas.request('services/common/fetch', input) });
              }
              let missing;
              try { missing = { resolved: await sas.request('services/common/does-not-exist', data) }; }
              catch(e) { missing = { rejected: true, error: String(e && (e.message || e)) }; }
              return { getdata, absentArea, unrelated, uploads, fetched, caseResults, missing };
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
            result.absentArea.springs,
            [],
            `${label}: missing AREA`
          )
          assert.deepEqual(
            result.unrelated.springs,
            [],
            `${label}: unrelated table`
          )
          for (const { column, getdata, fetched } of result.caseResults) {
            assert.deepEqual(
              fetched.areas,
              values.map((value) => ({ [column]: value })),
              `${label}: FETCH preserves ${column} column spelling`
            )
            assert.deepEqual(
              getdata.springs,
              springs,
              `${label}: getdata matches ${column} case-insensitively`
            )
          }
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

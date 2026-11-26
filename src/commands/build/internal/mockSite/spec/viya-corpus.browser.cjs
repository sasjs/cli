#!/usr/bin/env node
/* istanbul ignore file -- browser harness, not unit-test coverage */
// Builds the actual mock host, then replays captured response *shapes* in real
// Chromium. This is not SAS execution, full response parity or authentication
// security testing. All requests target the local worker; no backend is used.
// Run: TMPDIR=/path/to/writable/tmp npm run test:browser:viya-corpus
// Requires Node 24+, Chromium (CHROMIUM_PATH overrides the default).
const assert = require('node:assert/strict')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const http = require('node:http')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const os = require('node:os')
const { waitForDevToolsPort } = require('./devToolsPort.cjs')
const {
  buildMockSite
} = require('../../../../../../build/commands/build/internal/mockSite/mockSite')
const api = require('@sasjs/api')
const { VIYA_CORPUS, VIYA_OVERLAY, requestFor, shapeMismatches } = api
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const expected = new Set([
  'GET /compute/contexts',
  'POST /compute/contexts/{}/sessions',
  'DELETE /compute/sessions/{}',
  'POST /compute/sessions/{}/jobs',
  'GET /compute/sessions/{}/jobs/{}',
  'GET /compute/sessions/{}/jobs/{}/log/content',
  'GET /compute/sessions/{}/jobs/{}/state',
  'GET /compute/sessions/{}/state',
  'POST /folders/folders',
  'GET /folders/folders/{}',
  'GET /folders/folders/{}/members',
  'PATCH /folders/folders/{}',
  'POST /files/files',
  'GET /files/files/{}',
  'PATCH /files/files/{}',
  'GET /files/files/{}/content',
  'PUT /files/files/{}/content',
  'GET /jobDefinitions/definitions/{}',
  'POST /jobExecution/jobs',
  'GET /jobExecution/jobs/{}',
  'GET /jobExecution/jobs/{}/state',
  'GET /folders/folders/@item',
  'GET /folders/folders/@myRecycleBin',
  'GET /identities/users/@currentUser',
  'POST /SASLogon/oauth/token',
  'GET /types/types'
])
const expectedSkip = new Set([
  'GET /compute/sessions/{}/variables/{}',
  'GET /launcher/contexts',
  'POST /jobDefinitions/definitions'
])
// The API declines session variables, launcher and definition creation. The CLI
// serves registered JS jobs but its three JES JSON bodies differ from the real
// captured shapes; report those exact differences rather than count them as parity.
// These are real shapeMismatches against the captured corpus, not invented shapes.
// Exact allowlisting makes a changed or newly missing field visible.
const jesShapeRoutes = new Set([
  'GET /jobDefinitions/definitions/{}',
  'POST /jobExecution/jobs',
  'GET /jobExecution/jobs/{}'
])
const knownJesShapeDrift = [
  'GET /jobDefinitions/definitions/{}.code: missing from the answer',
  'GET /jobDefinitions/definitions/{}.createdBy: missing from the answer',
  'GET /jobDefinitions/definitions/{}.creationTimeStamp: missing from the answer',
  'GET /jobDefinitions/definitions/{}.links: missing from the answer',
  'GET /jobDefinitions/definitions/{}.modifiedBy: missing from the answer',
  'GET /jobDefinitions/definitions/{}.modifiedTimeStamp: missing from the answer',
  'GET /jobDefinitions/definitions/{}.parameters: missing from the answer',
  'GET /jobDefinitions/definitions/{}.type: missing from the answer',
  'GET /jobDefinitions/definitions/{}.version: missing from the answer',
  'POST /jobExecution/jobs.createdBy: missing from the answer',
  'POST /jobExecution/jobs.creationTimeStamp: missing from the answer',
  'POST /jobExecution/jobs.elapsedTime: missing from the answer',
  'POST /jobExecution/jobs.heartbeatInterval: missing from the answer',
  'POST /jobExecution/jobs.heartbeatTimeStamp: missing from the answer',
  'POST /jobExecution/jobs.jobRequest: missing from the answer',
  'POST /jobExecution/jobs.links[0].method: missing from the answer',
  'POST /jobExecution/jobs.links[0].type: missing from the answer',
  'POST /jobExecution/jobs.links[0].uri: missing from the answer',
  'POST /jobExecution/jobs.modifiedBy: missing from the answer',
  'POST /jobExecution/jobs.modifiedTimeStamp: missing from the answer',
  'POST /jobExecution/jobs.state: missing from the answer',
  'POST /jobExecution/jobs.submittedByApplication: missing from the answer',
  'POST /jobExecution/jobs.version: missing from the answer',
  'GET /jobExecution/jobs/{}.createdBy: missing from the answer',
  'GET /jobExecution/jobs/{}.creationTimeStamp: missing from the answer',
  'GET /jobExecution/jobs/{}.elapsedTime: missing from the answer',
  'GET /jobExecution/jobs/{}.endTimeStamp: missing from the answer',
  'GET /jobExecution/jobs/{}.heartbeatInterval: missing from the answer',
  'GET /jobExecution/jobs/{}.heartbeatTimeStamp: missing from the answer',
  'GET /jobExecution/jobs/{}.jobRequest: missing from the answer',
  'GET /jobExecution/jobs/{}.links[0].method: missing from the answer',
  'GET /jobExecution/jobs/{}.links[0].type: missing from the answer',
  'GET /jobExecution/jobs/{}.links[0].uri: missing from the answer',
  'GET /jobExecution/jobs/{}.logLocation: missing from the answer',
  'GET /jobExecution/jobs/{}.modifiedBy: missing from the answer',
  'GET /jobExecution/jobs/{}.modifiedTimeStamp: missing from the answer',
  'GET /jobExecution/jobs/{}.results.COMPUTE_CONTEXT: missing from the answer',
  'GET /jobExecution/jobs/{}.results.COMPUTE_JOB: missing from the answer',
  'GET /jobExecution/jobs/{}.results.COMPUTE_SESSION: missing from the answer',
  'GET /jobExecution/jobs/{}.results.{}.log: missing from the answer',
  'GET /jobExecution/jobs/{}.results.{}.log.txt: missing from the answer',
  'GET /jobExecution/jobs/{}.state: missing from the answer',
  'GET /jobExecution/jobs/{}.submittedByApplication: missing from the answer',
  'GET /jobExecution/jobs/{}.version: missing from the answer'
]
// The password is the generated host's public demo identity, not a credential.
const password = new URLSearchParams({
  grant_type: 'password',
  client_id: 'sas.cli',
  username: 'sasjsadmin',
  password: 'Orion123'
}).toString()
const queries = {
  'GET /compute/contexts': {
    filter: "eq(name,'Compute Reusable')",
    limit: '10000'
  },
  'GET /compute/sessions/{}/jobs/{}/log/content': { limit: '1000', start: '0' },
  'GET /compute/sessions/{}/jobs/{}/state': { _action: 'wait', wait: '5' },
  'GET /compute/sessions/{}/state': { wait: '5' },
  'GET /folders/folders/{}/members': { limit: '100' },
  'POST /files/files': { typeDefName: 'file' },
  'POST /jobExecution/jobs': { _action: 'wait' },
  'GET /jobExecution/jobs/{}/state': { _action: 'wait', wait: '5' },
  'GET /folders/folders/@item': { path: '/' },
  'GET /types/types': { limit: '100' }
}
const bodies = {
  'POST /compute/contexts/{}/sessions': {
    type: 'application/json',
    body: '{}'
  },
  'POST /compute/sessions/{}/jobs': {
    type: 'application/json',
    // The adapter sends SAS program lines and macro variables as an object.
    // This host returns a simulated log; it does not execute these lines.
    body: JSON.stringify({
      name: 'corpus-replay',
      description: 'Powered by SASjs',
      code: ['%put NOTE: Browser corpus replay;'],
      variables: { SYS_JES_JOB_URI: '', _program: '/Public/app/corpus/job' },
      version: 2
    })
  },
  'POST /folders/folders': {
    type: 'application/json',
    body: JSON.stringify({ name: 'corpus-replay', type: 'folder' })
  },
  'PATCH /folders/folders/{}': {
    type: 'application/json',
    body: JSON.stringify({ name: 'corpus-renamed' })
  },
  'PATCH /files/files/{}': {
    type: 'application/json',
    body: JSON.stringify({ name: 'renamed.txt' })
  },
  'PUT /files/files/{}/content': {
    type: 'text/plain',
    body: 'replacement contents'
  }
  // POST's body is assembled from the actual definition read in the browser.
}
async function main() {
  assert.equal(VIYA_CORPUS.length, 29)
  assert.equal(new Set(VIYA_CORPUS.map((c) => c.route)).size, 29)
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sasjs-viya-corpus-'))
  const profile = path.join(root, 'chrome')
  await fsp.mkdir(profile)
  const web = path.join(root, 'web')
  const build = path.join(root, 'sasjsbuild')
  await fsp.mkdir(web)
  await fsp.copyFile(
    require.resolve('@sasjs/adapter/dist/sasjs-adapter.js'),
    path.join(web, 'adapter.js')
  )
  await fsp.mkdir(build)
  await fsp.cp(path.join(__dirname, 'fixtures', 'viya-corpus'), build, {
    recursive: true
  })
  await fsp.writeFile(
    path.join(web, 'index.html'),
    '<!doctype html><html><head><title>Viya corpus replay</title><sasjs></sasjs><script src="adapter.js"></script><script>window.corpusFixture = true</script></head><body></body></html>'
  )
  process.projectDir = root
  process.sasjsConstants = { buildDestinationFolder: build }
  process.sasjsConfig = { syncFolder: 'sasjs' }
  process.logger = { info: () => {}, warn: (...args) => console.warn(...args) }
  let chrome, ws, server
  let stderr = ''
  const events = []
  const netRequests = []
  try {
    const { outputFolder: site } = await buildMockSite({
      appLoc: '/Public/app/corpus',
      serverType: 'SASVIYA',
      streamConfig: { webSourcePath: 'web', mockApi: false }
    })
    server = http.createServer((req, res) => {
      netRequests.push(req.url)
      let p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
      if (p.endsWith('/')) p += 'index.html'
      const target = path.resolve(site, '.' + p)
      if (!target.startsWith(site + path.sep)) {
        res.writeHead(403).end()
        return
      }
      try {
        const bytes = fs.readFileSync(target)
        const ext = path.extname(target)
        res
          .writeHead(200, {
            'content-type':
              {
                '.html': 'text/html',
                '.js': 'application/javascript',
                '.json': 'application/json'
              }[ext] || 'application/octet-stream'
          })
          .end(bytes)
      } catch {
        res.writeHead(404).end('not found')
      }
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const origin = `http://127.0.0.1:${server.address().port}`
    chrome = spawn(
      process.env.CHROMIUM_PATH || 'chromium',
      [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--no-proxy-server',
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
        '--remote-debugging-port=0',
        `--user-data-dir=${profile}`,
        'about:blank'
      ],
      {
        stdio: ['ignore', 'ignore', 'pipe'],
        env: { ...process.env, TMPDIR: root }
      }
    )
    chrome.stderr.on('data', (b) => {
      stderr += b.toString()
      if (stderr.length > 50000) stderr = stderr.slice(-50000)
    })
    let spawnError
    chrome.on('error', (error) => {
      spawnError = error
    })
    const port = await waitForDevToolsPort(
      profile,
      chrome,
      () => spawnError,
      () => stderr
    )
    const version = await (
      await fetch(`http://127.0.0.1:${port}/json/version`)
    ).json()
    ws = new WebSocket(version.webSocketDebuggerUrl)
    await once(ws, 'open')
    let next = 0
    const pending = new Map()
    const reqs = new Map()
    const allRequests = []
    ws.onmessage = ({ data }) => {
      const m = JSON.parse(data)
      if (pending.has(m.id)) {
        const p = pending.get(m.id)
        pending.delete(m.id)
        m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result)
        return
      }
      if (m.method === 'Network.requestWillBeSent') {
        const request = {
          url: m.params.request.url,
          method: m.params.request.method
        }
        allRequests.push(request)
        reqs.set(m.params.requestId, request)
      }
      if (m.method === 'Network.responseReceived') {
        const r = reqs.get(m.params.requestId)
        if (r)
          events.push({
            ...r,
            status: m.params.response.status,
            fromServiceWorker: m.params.response.fromServiceWorker,
            headers: m.params.response.headers
          })
      }
    }
    const send = (method, params = {}, sessionId) =>
      new Promise((resolve, reject) => {
        const id = ++next
        pending.set(id, { resolve, reject })
        ws.send(JSON.stringify({ id, method, params, sessionId }))
      })
    const { targetId } = await send('Target.createTarget', {
      url: 'about:blank'
    })
    const { sessionId } = await send('Target.attachToTarget', {
      targetId,
      flatten: true
    })
    const ev = async (expression) => {
      const out = await send(
        'Runtime.evaluate',
        { expression, awaitPromise: true, returnByValue: true },
        sessionId
      )
      if (out.exceptionDetails)
        throw Error(JSON.stringify(out.exceptionDetails))
      return out.result.value
    }
    await send('Page.enable', {}, sessionId)
    await send('Runtime.enable', {}, sessionId)
    await send('Network.enable', {}, sessionId)
    await send('Page.navigate', { url: origin + '/' }, sessionId)
    let ready = false
    for (let i = 0; i < 400; i++) {
      try {
        if (
          await ev(
            `location.origin===${JSON.stringify(origin)} && !!window.__sasjsMockReady`
          )
        ) {
          ready = true
          break
        }
      } catch {}
      await sleep(50)
    }
    assert.ok(ready, 'generated host did not expose its readiness promise')
    await ev(
      `Promise.race([window.__sasjsMockReady, new Promise((_, reject) => setTimeout(() => reject(Error('host readiness timed out')), 20000))])`
    )
    // Reload and await the real host's full seed/persistence readiness again.
    await send('Page.reload', {}, sessionId)
    let controlled
    for (let i = 0; i < 400; i++) {
      try {
        controlled = await ev(
          `(async()=>{if (!window.__sasjsMockReady) return null; await Promise.race([window.__sasjsMockReady, new Promise((_, reject) => setTimeout(() => reject(Error('reload readiness timed out')), 20000))]);return {controlled:!!navigator.serviceWorker.controller,script:navigator.serviceWorker.controller?.scriptURL}})()`
        )
        if (controlled?.controlled) break
      } catch (error) {
        if (i === 399) throw error
      }
      await sleep(50)
    }
    assert.equal(controlled.controlled, true)
    // Exercise the unchanged, installed adapter in the controlled page, not a
    // hand-written approximation of its JES protocol.
    const beforeAdapter = events.length
    const adapterResult = await ev(`(async()=>{
      const s = new SASjs.default({serverType:'SASVIYA', serverUrl:location.origin,
        appLoc:'/Public/app/corpus', useComputeApi:false, runAsTask:true,
        contextName:'Compute Reusable', debug:true});
      const call = (debug) => Promise.race([
        s.request('services/case', null, {debug}, undefined, undefined, ['log']),
        new Promise((_,reject)=>setTimeout(()=>reject(Error('adapter timed out')), 20000))
      ]);
      return {debug:await call(true), normal:await call(false)};
    })()`)
    assert.deepEqual(adapterResult.debug.result, { answer: 42 })
    assert.equal(
      adapterResult.debug.log,
      '[sasjs mock: JavaScript console output, not a SAS log]\nfixture job log'
    )
    assert.deepEqual(adapterResult.normal.result, { answer: 42 })
    assert.equal(adapterResult.normal.log, undefined)
    const adapterEvents = events.slice(beforeAdapter)
    const logs = adapterEvents.filter((event) =>
      /\/jobExecution\/jobs\/[^/]+\/log\/content/.test(
        new URL(event.url).pathname
      )
    )
    assert.equal(logs.length, 1, 'only debug requests fetch the log')
    assert.equal(logs[0].status, 200)
    assert.equal(logs[0].fromServiceWorker, true)
    assert.match(
      String(
        Object.entries(logs[0].headers).find(
          ([name]) => name.toLowerCase() === 'x-sasjs-emulated'
        )?.[1]
      ),
      /^viya@/
    )
    console.log(
      'PASS unchanged adapter JES debug and non-debug; log served by emulated worker'
    )
    const fetchInPage = async (method, url, body, type) => {
      const r = await ev(
        `(async()=>{const r=await fetch(${JSON.stringify(url)},{method:${JSON.stringify(method)},headers:${JSON.stringify(type ? { 'content-type': type } : {})},${body === undefined ? '' : `body:${JSON.stringify(body)},`}cache:'no-store'});return {status:r.status,emulated:r.headers.get('x-sasjs-emulated'),text:await r.text()}})()`
      )
      let parsed
      try {
        parsed = JSON.parse(r.text)
      } catch {}
      return { ...r, body: parsed }
    }
    const bootAuth = await fetchInPage(
      'POST',
      '/SASLogon/oauth/token',
      password,
      'application/x-www-form-urlencoded'
    )
    assert.equal(bootAuth.status, 200)
    assert.ok(bootAuth.body.refresh_token)
    const parent = await fetchInPage('GET', '/folders/folders/@item?path=%2F')
    assert.equal(parent.status, 200)
    assert.ok(parent.body.id)
    queries['POST /folders/folders'] = {
      parentFolderUri: `/folders/folders/${parent.body.id}`
    }
    bodies['POST /SASLogon/oauth/token'] = {
      type: 'application/x-www-form-urlencoded',
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: 'sas.cli',
        refresh_token: bootAuth.body.refresh_token
      }).toString()
    }
    const state = {
        variable: 'SYSJOBID',
        definition: encodeURIComponent('/Public/app/corpus/services/case')
      },
      failures = [],
      skipped = {},
      replayed = [],
      covered = [],
      missing = [],
      jesShapeDrift = []
    const ordered = [
      ...VIYA_CORPUS.filter((c) => c.route === 'POST /folders/folders'),
      ...VIYA_CORPUS.filter(
        (c) =>
          !c.route.startsWith('DELETE ') &&
          !c.route.startsWith('PATCH ') &&
          c.route !== 'POST /folders/folders'
      ),
      ...VIYA_CORPUS.filter((c) => c.route.startsWith('PATCH ')),
      ...VIYA_CORPUS.filter((c) => c.route.startsWith('DELETE '))
    ]
    for (const item of ordered) {
      if (item.route === 'PATCH /files/files/{}') {
        // Extra probes prove that the registered twin actually ran and PUT changed
        // the original file; these are not additional captured corpus cases.
        const probes = [
          {
            path: `/files/files/${state.file}/content`,
            expected: 'replacement contents'
          },
          {
            path: `/jobExecution/jobs/${state.job}/results/webout/content`,
            expected: '{\"answer\":42}'
          }
        ]
        for (const probe of probes) {
          const eventStart = events.length
          const result = await fetchInPage('GET', probe.path)
          assert.equal(result.status, 200, probe.path)
          assert.equal(result.text, probe.expected, probe.path)
          assert.ok(result.emulated?.startsWith('viya@'), probe.path)
          covered.push({
            route: `GET ${probe.path}`,
            eventStart,
            path: probe.path,
            status: result.status,
            emulated: result.emulated,
            body: result.text,
            fixtureProbe: true
          })
        }
      }
      const decl = VIYA_OVERLAY[item.route]
      if (expectedSkip.has(item.route)) {
        skipped[item.route] =
          decl?.implemented === false
            ? 'API overlay marks unimplemented (host support may differ): ' +
              decl.reason
            : 'not replayed: no complete request fixture/state for this captured case'
        continue
      }
      assert.ok(
        expected.has(item.route),
        `unclassified corpus route: ${item.route}`
      )
      if (item.route === 'POST /files/files')
        queries[item.route].parentFolderUri = '/folders/folders/' + state.folder
      const request = requestFor(item, state, queries[item.route] || {})
      assert.deepEqual(request.unresolved, [], `${item.route}: unresolved path`)
      const payload = bodies[item.route]
      assert.ok(
        payload ||
          item.route === 'POST /files/files' ||
          !['POST', 'PATCH', 'PUT'].includes(request.method),
        `${item.route}: missing request fixture`
      )
      if (request.omittedQueries.length)
        failures.push(
          `${item.route}: omitted queries ${request.omittedQueries.join(', ')}`
        )
      const eventStart = events.length
      let result
      if (item.route === 'POST /files/files') {
        const r = await ev(
          `(async()=>{const form=new FormData();form.append('file',new Blob(['fixture contents'],{type:'text/plain'}),'fixture.txt');const r=await fetch(${JSON.stringify(request.path)},{method:'POST',body:form});return {status:r.status,text:await r.text(),emulated:r.headers.get('x-sasjs-emulated')}})()`
        )
        result = { ...r, body: JSON.parse(r.text) }
      } else
        result = await fetchInPage(
          request.method,
          request.path,
          payload?.body,
          payload?.type
        )
      if (result.status !== item.expected)
        failures.push(
          `${item.route}: expected captured status ${item.expected}, got ${result.status}: ${result.text.slice(0, 300)}`
        )
      if (!result.emulated?.startsWith('viya@'))
        failures.push(`${item.route}: no Viya emulator header`)
      if (item.shape !== undefined) {
        for (const m of shapeMismatches(item.shape, result.body, item.route)) {
          if (m === `${item.route}.id_token: missing from the answer`) {
            missing.push(m)
            continue
          }
          if (jesShapeRoutes.has(item.route)) jesShapeDrift.push(m)
          else failures.push(m)
        }
      }
      if (item.route === 'GET /folders/folders/{}/members') {
        const file = result.body?.items?.find(
          (member) => member.name === 'fixture.txt'
        )
        assert.ok(file, 'captured members shape requires the uploaded file')
        for (const mismatch of shapeMismatches(
          item.shape.items[0],
          file,
          `${item.route}.items[fixture]`
        ))
          failures.push(mismatch)
      }
      if (item.route === 'GET /compute/contexts')
        state.context = result.body?.items?.[0]?.id
      if (item.route === 'POST /compute/contexts/{}/sessions')
        state.session = result.body?.id
      if (item.route === 'POST /compute/sessions/{}/jobs')
        state.job = result.body?.id
      if (item.route === 'POST /folders/folders') state.folder = result.body?.id
      if (item.route === 'POST /files/files') state.file = result.body?.id
      if (item.route === 'GET /jobDefinitions/definitions/{}') {
        assert.equal(result.body?.program, '/Public/app/corpus/services/case')
        bodies['POST /jobExecution/jobs'] = {
          type: 'application/json',
          body: JSON.stringify({
            name: 'exec-case',
            description: 'Powered by SASjs',
            jobDefinition: result.body,
            arguments: {
              _contextName: 'Compute Reusable',
              _program: result.body.program,
              _webin_file_count: '0',
              _OMITJSONLISTING: 'true',
              _OMITJSONLOG: 'true',
              _omitSessionResults: 'false',
              _OMITTEXTLISTING: 'true',
              _OMITTEXTLOG: 'true'
            }
          })
        }
      }
      if (item.route === 'POST /jobExecution/jobs') state.job = result.body?.id
      if (item.route === 'GET /files/files/{}/content')
        assert.equal(result.text, 'fixture contents')
      if (item.route === 'PATCH /files/files/{}')
        assert.equal(result.body?.name, 'renamed.txt')
      if (item.route === 'PATCH /folders/folders/{}')
        assert.equal(result.body?.name, 'corpus-renamed')
      if (
        item.route === 'GET /compute/contexts' ||
        item.route === 'GET /types/types'
      )
        assert.ok(result.body?.items?.length, `${item.route}: empty collection`)
      if (item.route === 'GET /compute/sessions/{}/jobs/{}/log/content')
        assert.ok(result.body?.items?.length, 'simulated log must be non-empty')
      if (item.route === 'GET /jobExecution/jobs/{}/state')
        assert.equal(result.text, 'completed')
      replayed.push(item.route)
      covered.push({
        route: item.route,
        eventStart,
        path: request.path,
        status: result.status,
        emulated: result.emulated,
        body:
          item.route === 'POST /SASLogon/oauth/token'
            ? '[token response redacted]'
            : result.text.slice(0, 120)
      })
    }
    await sleep(250)
    for (const call of covered) {
      const canonical = new URL(origin + call.path).href.replaceAll("'", '%27')
      const matches = events
        .slice(call.eventStart)
        .filter(
          (e) =>
            e.url === canonical &&
            e.method === call.route.split(' ')[0] &&
            e.status === call.status
        )
      if (
        !matches.some(
          (e) =>
            e.fromServiceWorker === true &&
            Object.entries(e.headers).some(
              ([name, value]) =>
                name.toLowerCase() === 'x-sasjs-emulated' &&
                String(value).startsWith('viya@')
            )
        )
      )
        failures.push(
          call.route + ': no matching CDP worker response with Viya header'
        )
    }
    const foreignRequests = allRequests.filter(
      (r) =>
        !r.url.startsWith(origin + '/') &&
        !r.url.startsWith('data:') &&
        !r.url.startsWith('blob:')
    )
    if (foreignRequests.length)
      failures.push(
        'unexpected non-local browser requests: ' +
          JSON.stringify(foreignRequests)
      )
    const apiLeak = netRequests.filter((u) =>
      /^\/(compute|folders|identities|types|SASLogon|files|jobDefinitions|jobExecution|launcher|SASJobExecution|SASjsApi|StoredProgram|SASStoredProcess|api|app)(\/|\?|$)/.test(
        u
      )
    )
    const summary = {
      controlled,
      apiVersion: require('../../../../../../package.json').dependencies[
        '@sasjs/api'
      ],
      coverage: covered.filter((call) => !call.fixtureProbe),
      fixtureProbes: covered.filter((call) => call.fixtureProbe),
      fullShapeCases: replayed.filter((route) => !jesShapeRoutes.has(route)),
      skipped,
      allowedMissing: missing,
      jesShapeDrift,
      failures,
      apiLeak,
      events: events
        .filter((e) => e.fromServiceWorker)
        .map((e) => ({
          url: e.url,
          method: e.method,
          status: e.status,
          fromServiceWorker: e.fromServiceWorker
        }))
    }
    console.log(JSON.stringify(summary, null, 2))
    assert.deepEqual([...new Set(replayed)].sort(), [...expected].sort())
    assert.deepEqual(Object.keys(skipped).sort(), [...expectedSkip].sort())
    assert.equal(replayed.length, 26)
    assert.equal(Object.keys(skipped).length, 3)
    assert.deepEqual(missing, [
      'POST /SASLogon/oauth/token.id_token: missing from the answer'
    ])
    assert.deepEqual(apiLeak, [])
    assert.deepEqual(jesShapeDrift.sort(), knownJesShapeDrift.slice().sort())
    assert.deepEqual(failures, [])
  } finally {
    if (ws) ws.close()
    if (chrome) {
      chrome.kill()
      await Promise.race([once(chrome, 'close'), sleep(3000)])
    }
    if (server) await new Promise((r) => server.close(r))
    await fsp.rm(root, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100
    })
  }
}
main().catch((e) => {
  console.error(e.stack)
  process.exitCode = 1
})

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
  'GET /folders/folders/@item',
  'GET /folders/folders/@myRecycleBin',
  'GET /identities/users/@currentUser',
  'POST /SASLogon/oauth/token',
  'GET /types/types'
])
const expectedSkip = new Set([
  'GET /compute/sessions/{}/variables/{}',
  'GET /files/files/{}',
  'GET /files/files/{}/content',
  'GET /jobDefinitions/definitions/{}',
  'GET /jobExecution/jobs/{}',
  'GET /jobExecution/jobs/{}/state',
  'GET /launcher/contexts',
  'PATCH /files/files/{}',
  'PATCH /folders/folders/{}',
  'POST /files/files',
  'POST /jobDefinitions/definitions',
  'POST /jobExecution/jobs',
  'PUT /files/files/{}/content'
])
// These skips are not claims that the endpoint is unsupported in this host:
// files and folder PATCH lack complete captured request/state fixtures; the API
// overlay marks variables, launcher and job definitions/executions unimplemented.
// The CLI can opt in to registered jobs even though the overlay declines them.
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
  }
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
  await fsp.mkdir(build)
  await fsp.writeFile(
    path.join(web, 'index.html'),
    '<!doctype html><html><head><title>Viya corpus replay</title><sasjs></sasjs><script>window.corpusFixture = true</script></head><body></body></html>'
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
    const state = { variable: 'SYSJOBID' },
      failures = [],
      skipped = {},
      replayed = [],
      covered = [],
      missing = []
    const ordered = [
      ...VIYA_CORPUS.filter((c) => !c.route.startsWith('DELETE ')),
      ...VIYA_CORPUS.filter((c) => c.route.startsWith('DELETE '))
    ]
    for (const item of ordered) {
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
      const request = requestFor(item, state, queries[item.route] || {})
      assert.deepEqual(request.unresolved, [], `${item.route}: unresolved path`)
      const payload = bodies[item.route]
      assert.ok(
        payload || !['POST', 'PATCH', 'PUT'].includes(request.method),
        `${item.route}: missing request fixture`
      )
      if (request.omittedQueries.length)
        failures.push(
          `${item.route}: omitted queries ${request.omittedQueries.join(', ')}`
        )
      if (item.route === 'GET /folders/folders/{}/members') {
        // The captured members case belongs to files/content: use an actual file, not an empty collection or folder.
        const uploadPath = `/files/files?parentFolderUri=${encodeURIComponent('/folders/folders/' + state.folder)}&typeDefName=file`
        const upload = await ev(
          `(async()=>{const form=new FormData();form.append('file',new Blob(['fixture contents'],{type:'text/plain'}),'fixture.txt');const r=await fetch(${JSON.stringify(uploadPath)},{method:'POST',body:form});return {status:r.status,body:await r.text(),emulated:r.headers.get('x-sasjs-emulated')}})()`
        )
        assert.equal(
          upload.status,
          201,
          `multipart fixture creation: ${upload.body}`
        )
        assert.ok(upload.emulated?.startsWith('viya@'))
        assert.ok(
          JSON.parse(upload.body).id,
          'file upload fixture must create a real file record'
        )
      }
      const eventStart = events.length
      const result = await fetchInPage(
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
          failures.push(m)
        }
      }
      if (item.route === 'GET /folders/folders/{}/members')
        assert.ok(
          result.body?.items?.length,
          'member fixture must be non-empty'
        )
      if (item.route === 'GET /compute/contexts')
        state.context = result.body?.items?.[0]?.id
      if (item.route === 'POST /compute/contexts/{}/sessions')
        state.session = result.body?.id
      if (item.route === 'POST /compute/sessions/{}/jobs')
        state.job = result.body?.id
      if (item.route === 'POST /folders/folders') state.folder = result.body?.id
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
      coverage: covered,
      skipped,
      allowedMissing: missing,
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
    assert.equal(replayed.length, 16)
    assert.equal(Object.keys(skipped).length, 13)
    assert.deepEqual(missing, [
      'POST /SASLogon/oauth/token.id_token: missing from the answer'
    ])
    assert.deepEqual(apiLeak, [])
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

#!/usr/bin/env node
// The released adapter serializes actual table objects; the generated worker and
// installed webout prelude parse them. No adapter or host implementation is patched.
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const fs = require('node:fs/promises')
const http = require('node:http')
const Module = require('node:module')
const os = require('node:os')
const path = require('node:path')
const ts = require('typescript')

const appLoc = '/Public/app/test'
const missing = [
  null,
  '._',
  ...Array.from('abcdefghijklmnopqrstuvwxyz', (c) => `.${c}`)
]
const rows = missing.map((N, i) => ({
  N,
  C: i === 0 ? '.A' : i === 1 ? '._' : `.${String.fromCharCode(97 + i - 2)}`
}))
const expected = rows.map(({ N, C }) => ({ N, C }))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function build(root, type) {
  const web = path.join(root, 'web')
  const destination = path.join(root, 'sasjsbuild')
  const services = path.join(destination, 'services/common')
  await fs.mkdir(web, { recursive: true })
  await fs.mkdir(services, { recursive: true })
  await fs.writeFile(
    path.join(services, 'missing.js'),
    `
    const input = webout('FETCH');
    webout('OPEN'); webout('OBJ', 'missing', input.missing); webout('CLOSE');
  `
  )
  await fs.copyFile(
    require.resolve('@sasjs/adapter/dist/sasjs-adapter.js'),
    path.join(web, 'adapter.js')
  )
  await fs.writeFile(
    path.join(web, 'index.html'),
    `<!doctype html><html><body><sasjs serverurl="" apploc="${appLoc}" servertype="SASJS"></sasjs><script src="adapter.js"></script></body></html>`
  )
  const file = path.resolve(__dirname, '../mockSite.ts')
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
  process.sasjsConstants = { buildDestinationFolder: destination }
  process.sasjsConfig = { syncFolder: 'sasjs' }
  process.logger = { warn() {}, info() {} }
  const site = await mod.exports.buildMockSite({
    name: type,
    serverType: type,
    appLoc,
    streamConfig: { webSourcePath: './web', mockApi: false }
  })
  return site.outputFolder
}

function serve(site) {
  const network = []
  const server = http.createServer(async (req, res) => {
    let pathname
    try {
      pathname = decodeURIComponent(
        new URL(req.url, 'http://localhost').pathname
      )
    } catch {
      return res.writeHead(400).end('bad request')
    }
    if (/^\/(SASStoredProcess|SASjsApi|api)(\/|$)/i.test(pathname)) {
      network.push(req.url)
      return res.writeHead(404).end('API fallthrough')
    }
    const name = pathname === '/' ? '/index.html' : pathname
    const file = path.resolve(site, '.' + name)
    if (!file.startsWith(site + path.sep)) return res.writeHead(403).end()
    try {
      const body = await fs.readFile(file)
      const type = name.endsWith('.js')
        ? 'application/javascript'
        : name.endsWith('.json')
          ? 'application/json'
          : 'text/html'
      res
        .writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' })
        .end(body)
    } catch {
      res.writeHead(404).end('not found')
    }
  })
  server.network = network
  return server
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'missing-adapter-'))
  let browser, ws, server, exited, deadlineTimer
  let stage = 'building sites'
  let timedOut = false
  const abort = new AbortController()
  const pending = new Map()
  const deadlineMs = Number(process.env.SASJS_BROWSER_DEADLINE_MS || 90000)
  const deadline = new Promise((_, reject) => {
    deadlineTimer = setTimeout(() => {
      timedOut = true
      abort.abort()
      reject(
        new Error(`Browser deadline exceeded during ${stage} (${deadlineMs}ms)`)
      )
    }, deadlineMs)
  })
  const checkDeadline = () => {
    if (timedOut) throw new Error(`Browser deadline exceeded during ${stage}`)
  }
  try {
    await Promise.race([
      (async () => {
        const sites = []
        for (const type of ['SAS9', 'SASJS']) {
          sites.push({ type, site: await build(path.join(root, type), type) })
          checkDeadline()
        }
        const profile = path.join(root, 'profile')
        stage = 'Chromium startup'
        browser = spawn(
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
        let stderr = '',
          spawnError
        browser.stderr.on('data', (chunk) => {
          stderr += chunk
        })
        browser.on('error', (error) => {
          spawnError = error
        })
        exited = new Promise((resolve) => browser.once('close', resolve))
        let port
        for (let i = 0; i < 200 && !port; i++) {
          checkDeadline()
          if (spawnError) throw spawnError
          if (browser.exitCode !== null) throw new Error(stderr)
          try {
            port = Number(
              (
                await fs.readFile(
                  path.join(profile, 'DevToolsActivePort'),
                  'utf8'
                )
              ).split('\n')[0]
            )
          } catch {
            await sleep(50)
          }
        }
        if (!port) throw new Error('Chromium startup timed out: ' + stderr)
        stage = 'Chromium DevTools discovery'
        const version = await (
          await fetch(`http://127.0.0.1:${port}/json/version`, {
            signal: abort.signal
          })
        ).json()
        checkDeadline()
        stage = 'Chromium WebSocket connection'
        ws = new WebSocket(version.webSocketDebuggerUrl)
        await once(ws, 'open')
        checkDeadline()
        let id = 0
        ws.addEventListener('message', ({ data }) => {
          const message = JSON.parse(data),
            request = pending.get(message.id)
          if (!request) return
          pending.delete(message.id)
          clearTimeout(request.timer)
          if (message.error)
            request.reject(new Error(JSON.stringify(message.error)))
          else request.resolve(message.result)
        })
        const send = (method, params = {}, sessionId) =>
          new Promise((resolve, reject) => {
            checkDeadline()
            stage = `CDP ${method}`
            const requestId = ++id
            const timer = setTimeout(() => {
              pending.delete(requestId)
              reject(new Error(`CDP ${method} timed out`))
            }, 30000)
            pending.set(requestId, { resolve, reject, timer })
            ws.send(
              JSON.stringify({ id: requestId, method, params, sessionId })
            )
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
            { expression, awaitPromise: true, returnByValue: true },
            sessionId
          )
          if (result.exceptionDetails)
            throw new Error(JSON.stringify(result.exceptionDetails))
          return result.result.value
        }
        for (const { type, site } of sites) {
          checkDeadline()
          stage = `${type} HTTP server startup`
          server = serve(site)
          server.listen(0, '127.0.0.1')
          await once(server, 'listening')
          checkDeadline()
          await send(
            'Page.navigate',
            { url: `http://127.0.0.1:${server.address().port}/` },
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
          assert.ok(loaded, `${type}: page load`)
          assert.deepEqual(
            await evaluate(
              `(async () => { await window.__sasjsMockReady; const el = document.querySelector('sasjs'); return { controlled: !!navigator.serviceWorker.controller, type: el.getAttribute('servertype') }; })()`
            ),
            { controlled: true, type }
          )
          for (const debug of [false, true]) {
            const result = await evaluate(`(async () => {
          const el = document.querySelector('sasjs');
          const sas = new SASjs.default({ serverUrl: el.getAttribute('serverurl'), serverType: el.getAttribute('servertype'), appLoc: el.getAttribute('apploc'), debug: ${debug} });
          const captured = [];
          const append = FormData.prototype.append;
          FormData.prototype.append = function (name, value, ...rest) {
            if (value instanceof Blob) captured.push({ name, filename: rest[0] || value.name, value: value.text() });
            return append.call(this, name, value, ...rest);
          };
          try {
            const response = await sas.request('services/common/missing', {
              missing: ${JSON.stringify(rows)},
              $missing: { formats: { N: 'best.', C: '$char8.' } },
              force: [{ TEXT: 'multipart;' }]
            });
            return { response, uploads: await Promise.all(captured.map(async ({ name, filename, value }) => ({ name, filename, csv: await value }))) };
          } finally { FormData.prototype.append = append; }
        })()`)
            const input = result.uploads.find(
              (upload) => upload.name.toLowerCase() === 'missing'
            )
            assert.ok(
              input,
              `${type} debug=${debug}: real adapter multipart upload: ${JSON.stringify(result)}`
            )
            assert.equal(input.filename, 'missing.csv')
            const lines = input.csv.split(/\r?\n/)
            assert.equal(lines[0], 'N:best. C:$char8.')
            assert.deepEqual(
              lines.slice(1).filter((line) => line !== ''),
              rows.map(({ N, C }) => `${N === null ? '.' : N},${C}`)
            )
            assert.deepEqual(
              result.response.missing,
              expected,
              `${type} debug=${debug}: all 28 FETCH → webout rows`
            )
            const metadata = result.response
            assert.equal(metadata._DEBUG, debug ? '131' : '')
            assert.equal(
              metadata._PROGRAM,
              '/sasjs/drive/files/Public/app/test/services/common/missing.js'
            )
            assert.equal(metadata.SYSCC, '0')
            assert.equal(metadata.SYSERRORTEXT, '')
            assert.equal(metadata.SYSWARNINGTEXT, '')
            assert.deepEqual(
              server.network,
              [],
              `${type} debug=${debug}: no static-host API fallthrough`
            )
            console.log(
              `PASS ${type} debug=${debug}: 28 numeric missing states, character literals, adapter CSV, FETCH and webout`
            )
          }
          server.closeAllConnections()
          await new Promise((resolve) => server.close(resolve))
          server = null
        }
      })(),
      deadline
    ])
  } finally {
    clearTimeout(deadlineTimer)
    abort.abort()
    for (const request of pending.values()) clearTimeout(request.timer)
    if (ws) ws.close()
    if (browser) {
      if (browser.exitCode === null && browser.signalCode === null)
        browser.kill('SIGTERM')
      if (exited) {
        const killTimer = setTimeout(() => browser.kill('SIGKILL'), 3000)
        try {
          await exited
        } finally {
          clearTimeout(killTimer)
        }
      }
    }
    if (server && server.listening) {
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    }
    await fs.rm(root, { recursive: true, force: true })
  }
}
if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error)
    process.exitCode = 1
  })
}
module.exports = { serve }

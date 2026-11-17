#!/usr/bin/env node
// Real XMLHttpRequest regression checks against the shipped bridge (Node 22+).
// Run: CHROMIUM_PATH=/path/to/chromium npm run test:browser:xhr
// CHROMIUM_PATH defaults to chromium; CI detects Chrome/Chromium on PATH.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const http = require('node:http')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const os = require('node:os')
const path = require('node:path')
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sasjs-xhr-browser-'))
  const requests = []
  const servers = []
  let browser,
    browserClosed,
    browserDone = false,
    browserError,
    ws
  try {
    for (let n = 0; n < 2; n++) {
      const server = http.createServer((req, res) => {
        const request = {
          server: n,
          url: req.url,
          method: req.method,
          auth: req.headers.authorization || null,
          body: ''
        }
        requests.push(request)
        req.setEncoding('utf8')
        req.on('data', (chunk) => {
          request.body += chunk
        })
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Headers', '*')
        res.setHeader('Access-Control-Allow-Methods', '*')
        if (req.url === '/hold' || req.url === '/api/slow')
          return setTimeout(() => res.end('late'), 300)
        res.end(req.url === '/' ? '<!doctype html><title>XHR</title>' : '{}')
      })
      server.listen(0, '127.0.0.1')
      await once(server, 'listening')
      servers.push(server)
    }
    const origins = servers.map((s) => `http://127.0.0.1:${s.address().port}`)
    browser = spawn(
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
    browser.on('error', (error) => {
      browserError = error
    })
    browserClosed = new Promise((resolve) =>
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
    ws = new WebSocket(info.webSocketDebuggerUrl)
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
    const send = (method, params = {}, sessionId) =>
      new Promise((resolve, reject) => {
        const requestId = ++id
        pending.set(requestId, { resolve, reject })
        ws.send(JSON.stringify({ id: requestId, method, params, sessionId }))
      })
    const { targetId } = await send('Target.createTarget', {
      url: 'about:blank'
    })
    const { sessionId } = await send('Target.attachToTarget', {
      targetId,
      flatten: true
    })
    const evalJS = async (expression) => {
      const result = await send(
        'Runtime.evaluate',
        { expression, awaitPromise: true, returnByValue: true },
        sessionId
      )
      if (result.exceptionDetails)
        throw new Error(JSON.stringify(result.exceptionDetails))
      return result.result.value
    }
    await send('Page.enable', {}, sessionId)
    await send('Page.navigate', { url: origins[0] + '/' }, sessionId)
    for (let n = 0; n < 200; n++) {
      if (
        await evalJS(
          `location.origin === ${JSON.stringify(origins[0])} && document.readyState === 'complete'`
        )
      )
        break
      await sleep(25)
    }
    let bridge = await fs.readFile(
      process.env.INTERCEPT_PATH ||
        path.join(__dirname, '../assets/intercept.js'),
      'utf8'
    )
    // First prove that undoing both security guards leaks to the second origin.
    // The default invocation must pass with the exact same assertions.
    if (process.env.INJECT_LEAK) {
      bridge = bridge
        .replace(
          'if (xhr.__sasjsMockGeneration !== generation) return\n        const init',
          'const init'
        )
        .replace('signal: generation.controller.signal,', '')
        .replace("mode: 'same-origin',", '')
        .replace(
          'await fetch(url, init)',
          'await fetch(xhr.__sasjsMockUrl, init)'
        )
    }
    // Mutation probe: remove the post-body generation checks to prove the
    // stale-response assertion fails even if the transport ignores abort.
    if (process.env.INJECT_STALE)
      bridge = bridge
        .replaceAll(
          'if (xhr.__sasjsMockGeneration !== generation) return\n          if (res.status',
          'if (res.status'
        )
        .replace(
          'if (xhr.__sasjsMockGeneration !== generation) return\n        if (res.status',
          'if (res.status'
        )
    await evalJS(bridge)
    const result = await evalJS(`(async () => {
      const cross = ${JSON.stringify(origins[1])};
      const load = xhr => new Promise((resolve, reject) => { xhr.addEventListener('load', resolve, {once:true}); xhr.addEventListener('error', reject, {once:true}); });
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const eventXhr = new XMLHttpRequest();
      eventXhr.addEventListener('readystatechange', () => { if (eventXhr.readyState === 1) { eventXhr.setRequestHeader('Authorization', ' \\tBearer event\\t '); eventXhr.setRequestHeader('Authorization', '\\tsecond '); } });
      const done = load(eventXhr); eventXhr.open('GET', '/api/event'); eventXhr.send(); await done;
      const firstStatus = eventXhr.status;
      const states = []; eventXhr.addEventListener('readystatechange', () => states.push(eventXhr.readyState));
      eventXhr.open('GET', '/api/second'); const reopenedStatus = eventXhr.status;
      const second = load(eventXhr); eventXhr.send(); await second;
      let doubleSend, lateHeader;
      const stateXhr = new XMLHttpRequest(); stateXhr.open('POST', '/api/state'); stateXhr.send('{}');
      try { stateXhr.send('{}'); } catch(e) { doubleSend = e.name; }
      try { stateXhr.setRequestHeader('Authorization', 'late'); } catch(e) { lateHeader = e.name; }
      const leak = new XMLHttpRequest(); leak.open('POST', '/api/original'); leak.setRequestHeader('Authorization', 'Bearer secret'); leak.send('{}'); leak.open('GET', cross + '/api/steal');
      const abortTrace = (url) => {
        const xhr = new XMLHttpRequest(); const events = [];
        for (const type of ['readystatechange', 'abort', 'loadend']) xhr.addEventListener(type, () => events.push([type, xhr.readyState, xhr.status]));
        xhr.open('POST', url); xhr.send('{}'); events.length = 0; xhr.abort();
        return {events, finalState: xhr.readyState, status: xhr.status};
      };
      const nativeAbort = abortTrace('/hold');
      const bridgedAbort = abortTrace('/api/aborted');
      const nestedAbortTrace = (url) => {
        const xhr = new XMLHttpRequest(); const events = []; let nested = false;
        for (const type of ['readystatechange', 'abort', 'loadend']) xhr.addEventListener(type, () => {
          events.push([type, xhr.readyState, xhr.status]);
          if (type === 'readystatechange' && xhr.readyState === 4 && !nested) { nested = true; xhr.abort(); }
        });
        xhr.open('POST', url); xhr.send('{}'); events.length = 0; xhr.abort();
        return {events, finalState: xhr.readyState, status: xhr.status};
      };
      const nativeNestedAbort = nestedAbortTrace('/hold');
      const bridgedNestedAbort = nestedAbortTrace('/api/nested-abort');
      const failedOpenAfterAbort = (url) => {
        const xhr = new XMLHttpRequest(); xhr.open('POST', url); xhr.send('{}'); xhr.abort();
        let error; try { xhr.open('INVALID METHOD', '/health'); } catch(e) { error = e.name; }
        return {error, state: xhr.readyState, status: xhr.status};
      };
      const nativeFailedOpen = failedOpenAfterAbort('/hold');
      const bridgedFailedOpen = failedOpenAfterAbort('/api/failed-open');
      const reopenOnAbort = (url) => {
        const xhr = new XMLHttpRequest(); const events = [];
        for (const type of ['readystatechange', 'abort', 'loadend']) xhr.addEventListener(type, () => {
          events.push([type, xhr.readyState]);
          if (type === 'readystatechange' && xhr.readyState === 4) xhr.open('GET', '/health');
        });
        xhr.open('POST', url); xhr.send('{}'); events.length = 0; xhr.abort();
        return {events, finalState: xhr.readyState};
      };
      const nativeReopen = reopenOnAbort('/hold');
      const bridgedReopen = reopenOnAbort('/api/reopen');
      const completed = new XMLHttpRequest(); const completedDone = load(completed);
      completed.open('GET', '/api/completed'); completed.send(); await completedDone;
      const beforeAbort = { status: completed.status, responseText: completed.responseText };
      completed.abort();
      const afterAbort = { readyState: completed.readyState, status: completed.status, responseText: completed.responseText, response: completed.response, headers: completed.getAllResponseHeaders() };
      const form = new FormData(); form.append('file', new Blob(['file']), 'file.txt'); form.append('field', 'original');
      const upload = new XMLHttpRequest(); const uploaded = load(upload); upload.open('POST', '/api/upload'); upload.send(form);
      form.set('field', 'changed'); form.append('late', 'not sent'); await uploaded;
      // Even a transport that ignores abort and completes late must not deliver
      // its old result onto a reused XHR.
      const realFetch = window.fetch;
      let slowStarted; const started = new Promise(r => { slowStarted = r });
      window.fetch = (url, init) => {
        if (url.endsWith('/api/slow')) { const copy = {...init}; delete copy.signal; slowStarted(); return realFetch(url, copy); }
        return realFetch(url, init);
      };
      const stale = new XMLHttpRequest(); const staleEvents = [];
      stale.addEventListener('load', () => staleEvents.push([stale.status, stale.responseText]));
      stale.open('GET', '/api/slow'); stale.send(); await started;
      const currentDone = load(stale); stale.open('GET', '/api/current'); stale.send(); await currentDone;
      await wait(400); window.fetch = realFetch;
      const staleResult = {events: staleEvents, status: stale.status, responseText: stale.responseText, readyState: stale.readyState};
      return { firstStatus, reopenedStatus, states, doubleSend, lateHeader, nativeAbort, bridgedAbort, nativeNestedAbort, bridgedNestedAbort, nativeFailedOpen, bridgedFailedOpen, nativeReopen, bridgedReopen, beforeAbort, afterAbort, staleResult };
    })()`)
    await sleep(100)
    console.log(JSON.stringify({ result, requests }, null, 2))
    assert.equal(result.firstStatus, 200)
    assert.equal(result.reopenedStatus, 0)
    assert.equal(result.states[0], 1)
    assert.equal(result.doubleSend, 'InvalidStateError')
    assert.equal(result.lateHeader, 'InvalidStateError')
    assert.deepEqual(result.bridgedAbort, result.nativeAbort)
    assert.deepEqual(result.bridgedNestedAbort, result.nativeNestedAbort)
    assert.deepEqual(result.bridgedReopen, result.nativeReopen)
    assert.deepEqual(result.bridgedFailedOpen, result.nativeFailedOpen)
    assert.deepEqual(result.beforeAbort, { status: 200, responseText: '{}' })
    assert.deepEqual(result.afterAbort, {
      readyState: 0,
      status: 0,
      responseText: '',
      response: '',
      headers: ''
    })
    assert.deepEqual(result.staleResult, {
      events: [[200, '{}']],
      status: 200,
      responseText: '{}',
      readyState: 4
    })
    const uploadRequests = requests.filter((r) => r.url === '/api/upload')
    assert.equal(uploadRequests.length, 1)
    assert.deepEqual(JSON.parse(uploadRequests[0].body), {
      params: { field: 'original' },
      tables: [{ name: 'file', filename: 'file.txt', csv: 'file' }]
    })
    assert.equal(requests.filter((r) => r.url === '/api/slow').length, 1)
    const eventRequests = requests.filter(
      (r) => r.url === '/api/event' && r.method === 'GET'
    )
    assert.equal(eventRequests.length, 1)
    assert.equal(eventRequests[0].auth, 'Bearer event, second')
    assert.equal(
      requests.filter(
        (r) =>
          r.url === '/api/steal' ||
          r.url === '/api/original' ||
          r.url === '/api/aborted'
      ).length,
      0
    )
    console.log('PASS Chromium XHR bridge regressions')
  } finally {
    if (ws) ws.close()
    if (browser && !browserDone) {
      browser.kill('SIGTERM')
      let timer
      await Promise.race([
        browserClosed,
        new Promise((resolve) => {
          timer = setTimeout(resolve, 3000)
        })
      ])
      clearTimeout(timer)
      if (!browserDone) browser.kill('SIGKILL')
      await browserClosed
    }
    for (const server of servers) {
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    }
    await fs.rm(root, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100
    })
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const harness = path.join(__dirname, 'missing-adapter.browser.cjs')

test('malformed URL is a 400 and the server remains usable', () => {
  // Load the real server without starting the browser entry point.
  const code = `
    const http = require('node:http');
    const file = process.argv[1];
    const server = require(file).serve(require('node:path').dirname(file));
    server.listen(0, '127.0.0.1', () => {
      const request = (path, done) => http.get({host:'127.0.0.1', port:server.address().port, path}, res => { res.resume(); res.on('end', () => done(res.statusCode)); });
      request('/%zz', status => { console.log('malformed=' + status); request('/missing-adapter.browser.cjs', status => { console.log('valid=' + status); server.close(); }); });
    });
  `
  const result = spawnSync(process.execPath, ['-e', code, harness], {
    encoding: 'utf8',
    timeout: 5000
  })
  assert.equal(result.status, 0, result.stderr || String(result.error))
  assert.match(result.stdout, /malformed=400/)
  assert.match(result.stdout, /valid=200/)
})

test('overall deadline reports the stalled stage and cleans up Chromium', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-stall-'))
  const fake = path.join(dir, 'chromium')
  const pidFile = path.join(dir, 'pid')
  try {
    fs.writeFileSync(
      fake,
      `#!/usr/bin/env node\nrequire('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)\n`,
      { mode: 0o755 }
    )
    const result = spawnSync(process.execPath, [harness], {
      encoding: 'utf8',
      timeout: 8000,
      env: {
        ...process.env,
        CHROMIUM_PATH: fake,
        SASJS_BROWSER_DEADLINE_MS: '1500'
      }
    })
    assert.equal(result.status, 1, result.stderr || String(result.error))
    assert.match(result.stderr, /deadline.*Chromium startup/i)
    assert.ok(fs.existsSync(pidFile), 'fake Chromium started')
    const pid = Number(fs.readFileSync(pidFile, 'utf8'))
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
  } finally {
    if (fs.existsSync(pidFile)) {
      try {
        process.kill(Number(fs.readFileSync(pidFile, 'utf8')), 'SIGKILL')
      } catch {}
    }
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('overall deadline names a stalled CDP command and reaps Chromium', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-cdp-stall-'))
  const fake = path.join(dir, 'chromium')
  const pidFile = path.join(dir, 'pid')
  try {
    const fakeCode = `#!/usr/bin/env node
const fs = require('node:fs'), http = require('node:http'), path = require('node:path');
const { WebSocketServer } = require(${JSON.stringify(require.resolve('ws'))});
fs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
const profile = process.argv.find(arg => arg.startsWith('--user-data-dir=')).split('=')[1];
const server = http.createServer((req, res) => res.end(JSON.stringify({webSocketDebuggerUrl:'ws://127.0.0.1:' + server.address().port})));
new WebSocketServer({server}).on('connection', ws => ws.on('message', () => {}));
server.listen(0, '127.0.0.1', () => { fs.mkdirSync(profile, {recursive:true}); fs.writeFileSync(path.join(profile, 'DevToolsActivePort'), String(server.address().port)); });
`
    fs.writeFileSync(fake, fakeCode, { mode: 0o755 })
    const result = spawnSync(process.execPath, [harness], {
      encoding: 'utf8',
      timeout: 8000,
      env: {
        ...process.env,
        CHROMIUM_PATH: fake,
        SASJS_BROWSER_DEADLINE_MS: '1500'
      }
    })
    assert.equal(result.status, 1, result.stderr || String(result.error))
    assert.match(result.stderr, /deadline.*CDP Target.createTarget/i)
    const pid = Number(fs.readFileSync(pidFile, 'utf8'))
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
  } finally {
    if (fs.existsSync(pidFile)) {
      try {
        process.kill(Number(fs.readFileSync(pidFile, 'utf8')), 'SIGKILL')
      } catch {}
    }
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

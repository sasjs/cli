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

// Fire the actual deadline callback only when the selected stage is reached.
// The outer timeout is a safety net, not the condition being tested.
function runControlled(stage, pidFile, fake) {
  const code = `
    const fs = require('node:fs');
    const { main } = require(process.argv[1]);
    const stageToStop = process.argv[2], pidFile = process.argv[3];
    const buildSite = stageToStop === 'building sites'
      ? () => new Promise(() => {}) : async () => '/unused';
    const scheduleDeadline = (expire, getStage) => {
      const timer = setInterval(() => {
        if (getStage() === stageToStop && (!pidFile || fs.existsSync(pidFile))) {
          clearInterval(timer); expire();
        }
      }, 10);
      return () => clearInterval(timer);
    };
    main({ buildSite, scheduleDeadline }).catch(error => {
      console.error(error.stack || error); process.exitCode = 1;
    });
  `
  return spawnSync(
    process.execPath,
    ['-e', code, harness, stage, pidFile || ''],
    {
      encoding: 'utf8',
      timeout: 15000,
      env: { ...process.env, CHROMIUM_PATH: fake || '/nonexistent/chromium' }
    }
  )
}

test('deadline reports a build that has not finished', () => {
  const result = runControlled('building sites')
  assert.equal(result.status, 1, result.stderr || String(result.error))
  assert.match(result.stderr, /deadline.*building sites/i)
})

test('real timer bounds a stalled site build', () => {
  const code = `
    require(process.argv[1]).main({ buildSite: () => new Promise(() => {}) })
      .catch(error => { console.error(error.message); process.exitCode = 1; });
  `
  const result = spawnSync(process.execPath, ['-e', code, harness], {
    encoding: 'utf8',
    timeout: 5000,
    env: { ...process.env, SASJS_BROWSER_DEADLINE_MS: '50' }
  })
  assert.equal(result.status, 1, result.stderr || String(result.error))
  assert.match(result.stderr, /deadline.*building sites/i)
})

function testBrowserStall(stage, fakeCode) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-stall-'))
  const fake = path.join(dir, 'chromium')
  const pidFile = path.join(dir, 'pid')
  try {
    fs.writeFileSync(fake, fakeCode(pidFile), { mode: 0o755 })
    const result = runControlled(stage, pidFile, fake)
    assert.equal(result.status, 1, result.stderr || String(result.error))
    assert.match(result.stderr, new RegExp(`deadline.*${stage}`, 'i'))
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
}

test('deadline reports Chromium startup and reaps a SIGTERM-resistant browser', () => {
  testBrowserStall(
    'Chromium startup',
    (pidFile) => `#!/usr/bin/env node
process.on('SIGTERM', () => {});
require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
setInterval(() => {}, 1000);
`
  )
})

test('deadline reports the stalled CDP command and reaps its fake server', () => {
  testBrowserStall(
    'CDP Target.createTarget',
    (pidFile) => `#!/usr/bin/env node
const fs = require('node:fs'), http = require('node:http'), path = require('node:path'), crypto = require('node:crypto');
fs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
const profile = process.argv.find(arg => arg.startsWith('--user-data-dir=')).slice('--user-data-dir='.length);
const server = http.createServer((req, res) => res.end(JSON.stringify({webSocketDebuggerUrl:'ws://127.0.0.1:' + server.address().port})));
server.on('upgrade', (req, socket) => {
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\\r\\nUpgrade: websocket\\r\\nConnection: Upgrade\\r\\nSec-WebSocket-Accept: ' + accept + '\\r\\n\\r\\n');
  socket.on('data', () => {});
});
server.listen(0, '127.0.0.1', () => { fs.mkdirSync(profile, {recursive:true}); fs.writeFileSync(path.join(profile, 'DevToolsActivePort'), String(server.address().port)); });
`
  )
})

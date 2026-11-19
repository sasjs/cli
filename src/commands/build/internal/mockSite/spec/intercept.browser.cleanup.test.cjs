// Exercise cleanup with a real child that refuses graceful termination.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { once } = require('node:events')

const harness = path.join(__dirname, 'intercept.browser.cjs')

test(
  'cleanup kills and waits for an unresponsive browser before removing its profile',
  { timeout: 25000 },
  async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xhr-cleanup-test-'))
    const executable = path.join(dir, 'chromium')
    const marker = path.join(dir, 'child.json')
    let childInfo
    try {
      await fs.writeFile(
        executable,
        `#!${process.execPath}\n` +
          `
const fs = require('node:fs');
process.on('SIGTERM', () => {});
const profile = process.argv.find(arg => arg.startsWith('--user-data-dir=')).split('=')[1];
fs.writeFileSync(process.env.XHR_CLEANUP_MARKER, JSON.stringify({ pid: process.pid, profile }));
setInterval(() => {}, 1000);
`,
        { mode: 0o755 }
      )
      const runner = spawn(process.execPath, [harness], {
        env: {
          ...process.env,
          CHROMIUM_PATH: executable,
          XHR_CLEANUP_MARKER: marker
        },
        stdio: 'ignore'
      })
      const timer = setTimeout(() => runner.kill('SIGKILL'), 16000)
      const [code, signal] = await once(runner, 'close')
      clearTimeout(timer)
      childInfo = JSON.parse(await fs.readFile(marker, 'utf8'))
      assert.equal(
        signal,
        null,
        'harness must finish rather than hang on the browser'
      )
      assert.equal(code, 1, 'fake browser should fail to start CDP')
      assert.throws(
        () => process.kill(childInfo.pid, 0),
        { code: 'ESRCH' },
        'child must have exited before cleanup completes'
      )
      await assert.rejects(fs.access(path.dirname(childInfo.profile)), {
        code: 'ENOENT'
      })
    } finally {
      if (childInfo) {
        try {
          process.kill(childInfo.pid, 'SIGKILL')
        } catch (error) {
          if (error.code !== 'ESRCH') throw error
        }
        await fs.rm(path.dirname(childInfo.profile), {
          recursive: true,
          force: true
        })
      }
      await fs.rm(dir, { recursive: true, force: true })
    }
  }
)

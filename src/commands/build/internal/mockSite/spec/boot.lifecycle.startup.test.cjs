const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { waitForDevToolsPort } = require('./boot.lifecycle.browser.cjs')

const profile = path.join('/tmp', 'browser-profile')
const portFile = path.join(profile, 'DevToolsActivePort')
const chromium = { exitCode: null }

function clock() {
  let time = 0
  return {
    now: () => time,
    sleep: async (ms) => {
      time += ms
    }
  }
}

function missingPort() {
  return Object.assign(new Error('port file missing'), { code: 'ENOENT' })
}

test('port published after the old 10-second deadline is accepted', async () => {
  const timer = clock()
  const reads = []
  const port = await waitForDevToolsPort(
    profile,
    chromium,
    () => null,
    () => '',
    {
      ...timer,
      readFile: async (file) => {
        assert.equal(file, portFile)
        reads.push(timer.now())
        if (timer.now() < 11000) throw missingPort()
        return '9222\n/devtools/browser/example\n'
      }
    }
  )
  assert.equal(port, 9222)
  assert.equal(timer.now(), 11000)
  assert.ok(reads.includes(10000))
})

test('late and invalid port files are not accepted', async () => {
  const timer = clock()
  let reads = 0
  await assert.rejects(
    waitForDevToolsPort(
      profile,
      chromium,
      () => null,
      () => '',
      {
        ...timer,
        readFile: async () => {
          reads++
          if (reads === 1) return '0\n'
          await timer.sleep(30000)
          return '9222\n'
        }
      }
    ),
    /timed out after 30000ms.*invalid or late port/
  )
  assert.equal(reads, 2)
})

test('spawn errors and browser exits fail without waiting for the deadline', async () => {
  const timer = clock()
  const spawnError = new Error('spawn failed')
  const options = {
    ...timer,
    readFile: async () => {
      throw missingPort()
    }
  }
  await assert.rejects(
    waitForDevToolsPort(
      profile,
      chromium,
      () => spawnError,
      () => '',
      options
    ),
    (error) => error === spawnError
  )
  await assert.rejects(
    waitForDevToolsPort(
      profile,
      { exitCode: 1 },
      () => null,
      () => 'crashed',
      options
    ),
    /Chromium exited: crashed/
  )
  assert.equal(timer.now(), 0)
})

test('missing port times out at 30 seconds with file and Chromium diagnostics', async () => {
  const timer = clock()
  let reads = 0
  await assert.rejects(
    waitForDevToolsPort(
      profile,
      chromium,
      () => null,
      () => 'browser stderr',
      {
        ...timer,
        readFile: async () => {
          reads++
          throw missingPort()
        }
      }
    ),
    (error) => {
      assert.match(error.message, /timed out after 30000ms/)
      assert.ok(error.message.includes(portFile))
      assert.match(error.message, /ENOENT.*port file missing/)
      assert.match(error.message, /browser stderr/)
      return true
    }
  )
  assert.equal(timer.now(), 30000)
  assert.equal(reads, 600)
})

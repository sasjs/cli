// The Chromium startup wait shared by the browser harnesses. Kept as its own
// small module so a spec can use it without pulling the whole driver into the
// jest coverage denominator.
const fs = require('node:fs/promises')
const path = require('node:path')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitForDevToolsPort(
  profile,
  chromium,
  getSpawnError,
  getStderr = () => '',
  options = {}
) {
  const now = options.now || Date.now
  const readFile = options.readFile || fs.readFile
  const wait = options.sleep || sleep
  const portFile = path.join(profile, 'DevToolsActivePort')
  const timeout = 30000
  const deadline = now() + timeout
  let lastError = 'port file not yet read'
  while (now() < deadline) {
    const spawnError = getSpawnError()
    if (spawnError) throw spawnError
    if (chromium.exitCode != null || chromium.signalCode != null)
      throw new Error(`Chromium exited: ${getStderr()}`)
    try {
      const content = await readFile(portFile, 'utf8')
      const port = Number(content.split('\n')[0])
      if (
        Number.isInteger(port) &&
        port > 0 &&
        port <= 65535 &&
        now() < deadline
      )
        return port
      lastError = `invalid or late port: ${JSON.stringify(content)}`
    } catch (error) {
      lastError = `${error.code || error.name}: ${error.message}`
    }
    await wait(50)
  }
  throw new Error(
    `Chromium CDP startup timed out after ${timeout}ms waiting for ${portFile}; last read: ${lastError}; Chromium stderr: ${getStderr() || '(empty)'}`
  )
}

module.exports = { waitForDevToolsPort }

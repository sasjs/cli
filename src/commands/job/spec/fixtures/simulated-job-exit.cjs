'use strict'
// Child process: the real executor/command, with only adapter and target lookup simulated.
const path = require('node:path')
require('ts-node/register/transpile-only')
const { executeJobViya } = require('../../internal/execute/viya')
const { JobCommand } = require('../../jobCommand')
const config = require('../../../../utils/config')
const { setLogCheckMode } = require('../../../../utils/logcheck')

const captureErrors = process.argv[7] === 'capture'
process.logger = {
  success() {},
  error(...args) {
    if (captureErrors) console.error(...args)
  },
  warn() {},
  info() {},
  log() {}
}
process.projectDir = process.argv[2]
setLogCheckMode('off')
const target = {
  name: 'simulated',
  appLoc: '/Public/mock',
  serverType: 'SASVIYA',
  serverUrl: 'http://mock.invalid',
  contextName: 'SIMULATED'
}
const auth = { access_token: 'SIMULATED' }
const job = {
  id: 'SIMULATED',
  state: 'failed',
  links:
    process.argv[5] === 'no-links'
      ? undefined
      : [{ rel: 'log', method: 'GET', href: '/SIMULATED/log' }],
  logStatistics: { lineCount: 1 }
}
const adapter = {
  async startComputeJob() {
    if (process.argv[4] === 'reject')
      throw Object.assign(new Error('SIMULATED failed'), { job })
    return process.argv[9] === 'wrapped' ? { job } : job
  },
  async fetchLogFileContent() {
    return JSON.stringify({ items: [{ line: 'SIMULATED log' }] })
  }
}
const status =
  process.argv[8] === 'no-status'
    ? undefined
    : path.join(process.projectDir, 'status.txt')
const wait = process.argv[6] === 'wait'
const options = {
  log: path.join(process.projectDir, 'job.log'),
  output: path.join(process.projectDir, 'output.json')
}
async function main() {
  if (process.argv[3] === 'executor') {
    await executeJobViya(
      adapter,
      auth,
      '/Public/mock/jobs/demo',
      target,
      wait,
      options.output,
      options.log,
      status,
      true,
      undefined,
      false
    )
    process.exit(0)
  }
  config.getSASjsAndAuthConfig = async () => ({
    sasjs: adapter,
    authConfig: auth
  })
  const command = new JobCommand([
    'node',
    'sasjs',
    'job',
    'execute',
    'jobs/demo',
    ...(wait ? ['--wait'] : []),
    '--ignoreWarnings',
    '--no-logcheck',
    ...(status ? ['--statusFile', status] : []),
    '--output',
    options.output
  ])
  command.getTargetInfo = async () => ({ target, isLocal: true })
  process.exit(await command.execute())
}
main().catch((error) => {
  console.error(error)
  process.exit(99)
})

// Run the real CLI and deploy helper, replacing only the remote adapter boundary.
const path = require('path')
// The CLI calls process.exit, so flush piped output before exiting.
process.stdout._handle?.setBlocking?.(true)
process.stderr._handle?.setBlocking?.(true)
const root = process.env.SASJS_CLI_TEST_ROOT
const config = require(path.join(root, 'src/utils/config.ts'))
config.getAuthConfig = async () => ({ access_token: 'test-token' })
config.getSASjs = () => ({
  deployServicePack: async () => {
    if (process.env.SASJS_CLI_TEST_FAILURE === '1') {
      throw new Error('simulated redeployment conflict')
    }
    return {}
  }
})
require(path.join(root, 'src/index.ts'))

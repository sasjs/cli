import { folder } from '../../../src/sasjs-folder/index'
import { generateTimestamp } from '../../../src/utils/utils'

const createConfig = (targetName, timestamp) => ({
  name: targetName,
  serverType: process.env.SERVER_TYPE,
  serverUrl: process.env.SERVER_URL,
  appLoc: `/Public/app/cli-tests-${timestamp}`,
  useComputeApi: true,
  contextName: 'SAS Studio compute context', // FIXME: should not be hard coded
  tgtServices: ['../test/commands/request/runRequest'],
  authInfo: {
    client: process.env.CLIENT,
    secret: process.env.SECRET,
    access_token: process.env.ACCESS_TOKEN,
    refresh_token: process.env.REFRESH_TOKEN
  },
  tgtDeployVars: {
    client: process.env.CLIENT,
    secret: process.env.SECRET
  },
  deployServicePack: true,
  tgtDeployScripts: []
})

describe('sasjs folder delete', () => {
  let config
  const timestamp = generateTimestamp()
  const targetName = 'cli-tests-folder-delete'
  config = createConfig(targetName, timestamp)

  beforeAll(async (done) => {
    dotenv.config()
    await addToGlobalConfigs(config)
    done()
  })

  it('should delete folders when a relative path is provided', async (done) => {
    await folder(`folder create ${config.appLoc}/test-${timestamp}`)

    await expect(folder(`folder delete test-${timestamp}`)).resolves.toEqual(
      true
    )
    done()
  })

  it('should delete folders when an absolute path is provided', async (done) => {
    await folder(`folder create ${config.appLoc}/test-${timestamp}`)

    await expect(
      folder(`folder delete ${config.appLoc}/test-${timestamp}`)
    ).resolves.toEqual(true)
    done()
  })
})

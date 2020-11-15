import dotenv from 'dotenv'
import { folder } from '../../../src/sasjs-folder/index'
import * as removeModule from '../../../src/sasjs-folder/remove'
import { generateTimestamp } from '../../../src/utils/utils'

const createConfig = (targetName, timestamp) => ({
  name: targetName,
  serverType: process.env.SERVER_TYPE,
  serverUrl: process.env.SERVER_URL,
  appLoc: `/Public/app/cli-tests-folder-remove-${timestamp}`,
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

jest.mock('../../../src/sasjs-folder/remove')

describe('sasjs folder delete', () => {
  let config
  const timestamp = generateTimestamp()
  const targetName = 'cli-tests-folder-delete'
  config = createConfig(targetName, timestamp)
  process.projectDir = process.cwd()

  beforeAll(async (done) => {
    dotenv.config()
    await addToGlobalConfigs(config)
    removeModule.remove.mockImplementation((folderPath, adapter, _) =>
      Promise.resolve(folderPath)
    )
    done()
  })

  afterAll(async (done) => {
    await removeFromGlobalConfigs(targetName)
    done()
  })

  it(
    'should append appLoc to relative folder paths',
    async (done) => {
      const relativeFolderPath = `test-${timestamp}`

      await expect(
        folder(['folder', 'delete', relativeFolderPath, '-t', targetName])
      ).resolves.toEqual(`${config.appLoc}/test-${timestamp}`)
      done()
    },
    120 * 1000
  )

  it('should leave absolute file paths unaltered', async (done) => {
    const absoluteFolderPath = `${config.appLoc}/test-${timestamp}`

    await expect(
      folder(['folder', 'delete', absoluteFolderPath])
    ).resolves.toEqual(`${config.appLoc}/test-${timestamp}`)
    done()
  })
})

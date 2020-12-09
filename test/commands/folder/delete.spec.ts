import dotenv from 'dotenv'
import { folder } from '../../../src/commands/folder/index'
import * as removeModule from '../../../src/commands/folder/remove'
import { generateTimestamp } from '../../../src/utils/utils'
import { ServerType, Target } from '@sasjs/utils/types'

const createConfig = (targetName: string, timestamp: string): Target => {
  const serverType: ServerType =
    process.env.SERVER_TYPE === ServerType.SasViya
      ? ServerType.SasViya
      : ServerType.Sas9
  return {
    name: targetName,
    serverType: serverType,
    serverUrl: process.env.SERVER_URL as string,
    appLoc: `/Public/app/cli-tests/${targetName}-${timestamp}`,
    useComputeApi: true,
    contextName: 'SAS Studio compute context', // FIXME: should not be hard coded
    tgtServices: ['../test/commands/request/runRequest'],
    authInfo: {
      client: process.env.CLIENT as string,
      secret: process.env.SECRET as string,
      access_token: process.env.ACCESS_TOKEN as string,
      refresh_token: process.env.REFRESH_TOKEN as string
    },
    tgtDeployVars: {
      client: process.env.CLIENT as string,
      secret: process.env.SECRET as string
    },
    deployServicePack: true,
    tgtDeployScripts: []
  }
}

jest.mock('../../../src/commands/folder/remove')

describe('sasjs folder delete', () => {
  const timestamp = generateTimestamp()
  const targetName = 'cli-tests-folder-delete'
  const config = createConfig(targetName, timestamp)
  process.projectDir = process.cwd()

  beforeAll(async (done) => {
    dotenv.config()
    await addToGlobalConfigs(config)
    jest
      .spyOn(removeModule, 'remove')
      .mockImplementation((folderPath, adapter, _) =>
        Promise.resolve(folderPath as any)
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

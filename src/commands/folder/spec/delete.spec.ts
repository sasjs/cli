import dotenv from 'dotenv'
import { folder } from '../index'
import * as deleteFolderModule from '../delete'
import { generateTimestamp } from '../../../utils/utils'
import { ServerType, Target } from '@sasjs/utils/types'
import {
  removeFromGlobalConfig,
  saveToGlobalConfig
} from '../../../utils/config'
import { Command } from '../../../utils/command'

const createTarget = (targetName: string, timestamp: string): Target => {
  const serverType: ServerType =
    process.env.SERVER_TYPE === ServerType.SasViya
      ? ServerType.SasViya
      : ServerType.Sas9
  return new Target({
    name: targetName,
    serverType: serverType,
    serverUrl: process.env.SERVER_URL as string,
    appLoc: `/Public/app/cli-tests/${targetName}-${timestamp}`,
    contextName: 'SAS Studio compute context', // FIXME: should not be hard coded
    serviceConfig: {
      serviceFolders: ['../test/commands/request/runRequest'],
      macroVars: {},
      initProgram: '',
      termProgram: ''
    },
    authConfig: {
      client: process.env.CLIENT as string,
      secret: process.env.SECRET as string,
      access_token: process.env.ACCESS_TOKEN as string,
      refresh_token: process.env.REFRESH_TOKEN as string
    },
    deployConfig: {
      deployServicePack: true,
      deployScripts: []
    }
  })
}

jest.mock('../delete')

describe('sasjs folder delete', () => {
  const timestamp = generateTimestamp()
  const targetName = 'cli-tests-folder-delete'
  let target: Target
  process.projectDir = process.cwd()

  beforeAll(async (done) => {
    dotenv.config()
    target = createTarget(targetName, timestamp)
    await saveToGlobalConfig(target)
    jest
      .spyOn(deleteFolderModule, 'deleteFolder')
      .mockImplementation((folderPath, adapter, _) =>
        Promise.resolve(folderPath as any)
      )
    done()
  })

  afterAll(async (done) => {
    await removeFromGlobalConfig(targetName)
    done()
  })

  it(
    'should append appLoc to relative folder paths',
    async (done) => {
      const relativeFolderPath = `test-${timestamp}`

      await expect(
        folder(
          new Command([
            'folder',
            'delete',
            relativeFolderPath,
            '-t',
            targetName
          ])
        )
      ).resolves.toEqual(`${target.appLoc}/test-${timestamp}`)
      done()
    },
    120 * 1000
  )

  it('should leave absolute file paths unaltered', async (done) => {
    const absoluteFolderPath = `${target.appLoc}/test-${timestamp}`

    await expect(
      folder(new Command(['folder', 'delete', absoluteFolderPath]))
    ).resolves.toEqual(`${target.appLoc}/test-${timestamp}`)
    done()
  })
})

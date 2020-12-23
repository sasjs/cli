import dotenv from 'dotenv'
import path from 'path'
import { processServicepack } from '..'
import { folder } from '../../folder/index'
import { generateTimestamp } from '../../../utils/utils'
import { ServerType, Target } from '@sasjs/utils/types'
import { TargetJson } from '../../../types/configuration'
import {
  removeFromGlobalConfig,
  saveToGlobalConfig
} from '../../../utils/config-utils'

describe('sasjs servicepack', () => {
  let config: TargetJson
  const targetName = 'cli-tests-servicepack'

  beforeAll(async () => {
    dotenv.config()
    const timestamp = generateTimestamp()
    const serverType: ServerType =
      process.env.SERVER_TYPE === ServerType.SasViya
        ? ServerType.SasViya
        : ServerType.Sas9
    config = {
      name: targetName,
      serverType: serverType,
      serverUrl: process.env.SERVER_URL as string,
      appLoc: `/Public/app/cli-tests/${targetName}-${timestamp}`,
      authConfig: {
        client: process.env.CLIENT as string,
        secret: process.env.SECRET as string,
        access_token: process.env.ACCESS_TOKEN as string,
        refresh_token: process.env.REFRESH_TOKEN as string
      },
      macroFolders: [],
      programFolders: []
    }
    await saveToGlobalConfig(new Target(config))

    process.projectDir = path.join(process.cwd())
  })

  describe('processServicepack', () => {
    it(
      'should deploy servicepack',
      async () => {
        const command = [
          'servicepack',
          'deploy',
          '-s',
          'src/commands/servicepack/spec/testServicepack.json',
          '-f',
          '-t',
          targetName
        ]

        await expect(processServicepack(command)).resolves.toEqual(true)
      },
      60 * 1000
    )

    it(
      'should fail because servicepack already been deployed',
      async () => {
        const command = [
          'servicepack',
          'deploy',
          '-s',
          'test/commands/servicepack/testServicepack.json',
          '-t',
          targetName
        ]

        await expect(processServicepack(command)).resolves.toEqual(false)
      },
      60 * 1000
    )
  })

  afterAll(async () => {
    await removeFromGlobalConfig(targetName)

    await folder(`folder delete ${config.appLoc} -t ${targetName}`)
  }, 60 * 1000)
})

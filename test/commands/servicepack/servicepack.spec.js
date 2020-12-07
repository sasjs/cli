import dotenv from 'dotenv'
import path from 'path'
import { processServicepack } from '../../../src/commands/servicepack'
import { generateTimestamp } from '../../../src/utils/utils'

describe('sasjs servicepack', () => {
  let config
  const targetName = 'cli-tests-servicepack'

  beforeAll(async () => {
    dotenv.config()
    const timestamp = generateTimestamp()
    config = {
      name: targetName,
      serverType: process.env.SERVER_TYPE,
      serverUrl: process.env.SERVER_URL,
      appLoc: `/Public/app/cli-tests/${targetName}-${timestamp}`,
      authInfo: {
        client: process.env.CLIENT,
        secret: process.env.SECRET,
        access_token: process.env.ACCESS_TOKEN,
        refresh_token: process.env.REFRESH_TOKEN
      },
      tgtDeployVars: {
        client: process.env.CLIENT,
        secret: process.env.SECRET
      }
    }
    await addToGlobalConfigs(config)

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
          'test/commands/servicepack/testServicepack.json',
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
    await folder(`folder delete ${config.appLoc} -t ${targetName}`)

    await removeFromGlobalConfigs(targetName)
  }, 60 * 1000)
})

import dotenv from 'dotenv'
import path from 'path'
import { ServerType, Target, generateTimestamp } from '@sasjs/utils'
import { contextName, setConstants } from '../../../utils'
import { servicePackDeploy } from '../deploy'
import { removeTestServerFolder } from '../../../utils/test'

describe('sasjs servicepack', () => {
  let target: Target

  beforeAll(async () => {
    dotenv.config()

    await setConstants()

    const targetName = 'cli-tests-servicepack-' + generateTimestamp()
    target = new Target({
      name: targetName,
      serverType: ServerType.SasViya,
      serverUrl: process.env.VIYA_SERVER_URL as string,
      httpsAgentOptions: {
        allowInsecureRequests: false
      },
      appLoc: `/Public/app/cli-tests/${targetName}`,
      contextName,
      authConfig: {
        client: process.env.CLIENT as string,
        secret: process.env.SECRET as string,
        access_token: process.env.ACCESS_TOKEN as string,
        refresh_token: process.env.REFRESH_TOKEN as string
      },
      macroFolders: [],
      programFolders: []
    })

    process.projectDir = path.join(process.cwd())
    process.currentDir = process.projectDir
  })

  describe('processServicepack', () => {
    it(
      'should deploy servicepack',
      async () => {
        await expect(
          servicePackDeploy(
            target,
            false,
            'src/commands/servicepack/spec/testServicepack.json',
            true
          )
        ).resolves.toEqual(true)
      },
      60 * 1000
    )

    it(
      'should fail because servicepack already been deployed',
      async () => {
        await expect(
          servicePackDeploy(
            target,
            false,
            'src/commands/servicepack/spec/testServicepack.json'
          )
        ).resolves.toEqual(false)
      },
      60 * 1000
    )
  })

  afterAll(async () => {
    await removeTestServerFolder(target.appLoc, target)
  }, 60 * 1000)
})

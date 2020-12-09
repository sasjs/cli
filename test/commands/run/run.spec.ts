import dotenv from 'dotenv'
import path from 'path'
import { execPath } from 'process'
import { runSasCode } from '../../../src/commands'
import { exportContext } from '../../../src/commands/context/export'
import { deleteFolder } from '../../../src/utils/file'
import { generateTimestamp } from '../../../src/utils/utils'
import { ServerType, Target } from '@sasjs/utils/types'

describe('sasjs run', () => {
  const timestamp = generateTimestamp()
  const targetName = `cli-tests-run-${timestamp}`

  beforeAll(async () => {
    process.projectDir = path.join(process.cwd())

    dotenv.config()

    const serverType: ServerType =
      process.env.SERVER_TYPE === ServerType.SasViya
        ? ServerType.SasViya
        : ServerType.Sas9
    const config = {
      serverType: serverType,
      serverUrl: process.env.SERVER_URL as string,
      appLoc: '/Public/app/cli-tests',
      authInfo: {
        client: process.env.CLIENT as string,
        secret: process.env.SECRET as string,
        access_token: process.env.ACCESS_TOKEN as string,
        refresh_token: process.env.REFRESH_TOKEN as string
      }
    }

    await addToGlobalConfigs({
      name: targetName,
      ...config
    })
  })

  describe('runSasCode', () => {
    it('should throw an error if file type is not *.sas', async () => {
      const file = 'test.sas.txt'
      const error = new Error(`'sasjs run' command supports only *.sas files.`)

      await expect(runSasCode(`run ${file}`)).rejects.toEqual(error)
    })

    it(
      'should get the log on successfull execution',
      async () => {
        const logPart = `1    data;\n2      do x=1 to 100;\n3        output;\n4      end;\n5    run;`

        let result: any = await runSasCode(
          `run test/commands/run/testServices/logJob.sas`
        )

        expect(result.log.includes(logPart)).toBeTruthy()
      },

      60 * 1000
    )
  })

  afterAll(async () => {
    await deleteFolder('./sasjs-run-*')
    await removeFromGlobalConfigs(targetName)
  })
})

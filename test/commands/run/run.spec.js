import dotenv from 'dotenv'
import path from 'path'
import { execPath } from 'process'
import { runSasCode } from '../../../src/commands'
import { exportContext } from '../../../src/commands/context/export'

describe('sasjs run', () => {
  const targetName = 'cli-tests-job'

  beforeAll(async () => {
    process.projectDir = path.join(process.cwd())

    dotenv.config()

    const config = {
      serverType: process.env.SERVER_TYPE,
      serverUrl: process.env.SERVER_URL,
      appLoc: '/Public/app/cli-tests',
      authInfo: {
        client: process.env.CLIENT,
        secret: process.env.SECRET,
        access_token: process.env.ACCESS_TOKEN,
        refresh_token: process.env.REFRESH_TOKEN
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

        let result = await runSasCode(
          `run test/commands/run/testServices/logJob.sas`
        )

        expect(result.log.includes(logPart)).toBeTruthy()
      },

      60 * 1000
    )
  })

  afterAll(async () => {
    await removeFromGlobalConfigs(targetName)
  })
})

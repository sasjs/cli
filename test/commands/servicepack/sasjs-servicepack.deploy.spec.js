import { servicePackDeploy } from '../../../src/sasjs-servicepack/deploy'
import { saveGlobalRcFile } from '../../../src/utils/config-utils'
import dotenv from 'dotenv'
import path from 'path'

describe('sasjs servicepack', () => {
  beforeAll(async () => {
    await saveGlobalRcFile(
      JSON.stringify({
        targets: [
          {
            name: 'cli-tests',
            serverType: 'SASVIYA',
            serverUrl: 'https://sas.analytium.co.uk',
            appLoc: '/Public/app/cli-tests'
          }
        ]
      })
    )

    process.projectDir = path.join(process.cwd())

    dotenv.config()
  })

  describe('processServicepack', () => {
    it(
      'should deploy servicepack',
      async () => {
        await expect(
          servicePackDeploy(
            './test/commands/servicepack/testServicepack.json',
            null,
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
          servicePackDeploy('./test/commands/servicepack/testServicepack.json')
        ).resolves.toEqual(false)
      },
      60 * 1000
    )
  })
})

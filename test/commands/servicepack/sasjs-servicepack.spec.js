import { saveGlobalRcFile } from '../../../src/utils/config-utils'
import dotenv from 'dotenv'
import path from 'path'
import { processServicepack } from '../../../src/sasjs-servicepack/index'

describe('sasjs servicepack', () => {
  beforeAll(async () => {
    await saveGlobalRcFile(
      JSON.stringify({
        targets: [
          {
            name: 'cliTests',
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
        const command = [
          'servicepack',
          'deploy',
          '-s',
          'test/commands/servicepack/testServicepack.json',
          '-f'
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
          'test/commands/servicepack/testServicepack.json'
        ]

        await expect(processServicepack(command)).resolves.toEqual(false)
      },
      60 * 1000
    )
  })
})

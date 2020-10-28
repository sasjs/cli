import { saveGlobalRcFile } from '../../../src/utils/config-utils'
import dotenv from 'dotenv'
import path from 'path'
import { compileBuildDeployServices } from '../../../src/main'

describe('sasjs cbd', () => {
  beforeAll(async () => {
    dotenv.config()

    await saveGlobalRcFile(
      JSON.stringify({
        targets: [
          {
            name: 'cli-tests',
            serverType: 'SASVIYA',
            serverUrl: 'https://sas.analytium.co.uk',
            appLoc: '/Public/app/cli-tests',
            tgtServices: ['../test/commands/cbd/testJob'],
            authInfo: {
              client: process.env.client,
              secret: process.env.secret,
              access_token: process.env.access_token,
              refresh_token: process.env.refresh_token
            },
            deployServicePack: true,
            tgtDeployScripts: []
          }
        ]
      })
    )

    process.projectDir = path.join(process.cwd())
  })

  describe('cbd', () => {
    it(
      'should compile, build and deploy',
      async () => {
        const command = 'cbd cli-tests -f'.split(' ')

        await expect(compileBuildDeployServices(command)).resolves.toEqual(true)
      },
      60 * 1000
    )
  })
})

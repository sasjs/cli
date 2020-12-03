import path from 'path'
import dotenv from 'dotenv'
import { compileBuildDeployServices } from '../../../src/main'
import { generateTimestamp } from '../../../src/utils/utils'
import { processFlow } from '../../../src/commands'

describe('sasjs flow', () => {
  const targetName = 'cli-tests-flow-' + generateTimestamp()

  beforeAll(async () => {
    ;(process as any).projectDir = path.join(process.cwd())
    dotenv.config()

    await (global as any).addToGlobalConfigs({
      name: targetName,
      serverType: process.env.SERVER_TYPE,
      serverUrl: process.env.SERVER_URL,
      appLoc: `/Public/app/${targetName}`,
      authInfo: {
        client: process.env.CLIENT,
        secret: process.env.SECRET,
        access_token: process.env.ACCESS_TOKEN,
        refresh_token: process.env.REFRESH_TOKEN
      },
      jobs: ['../test/commands/cbd/testJob'],
      deployServicePack: true
    })

    await compileBuildDeployServices(`cbd ${targetName} -f`)
  }, 60 * 100)

  describe('execute', async () => {
    it('should execute flow', async () => {
      const cwd = process.cwd()
      const sourcePath = path.join(cwd, 'test/commands/flow/testFlow.json')
      const csvPath = path.join(cwd, 'test/commands/flow/output.csv')
      const logPath = path.join(cwd, 'test/commands/flow/logs')

      const command = `flow execute -s ${sourcePath} -t t1 --csvFile ${csvPath} --logFolder ${logPath}`

      await processFlow(command)
    })
  })
})

// TODO: delete appLoc folder after test

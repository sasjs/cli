import { saveGlobalRcFile } from '../../../src/utils/config-utils'
import dotenv from 'dotenv'
import path from 'path'
import { processJob } from '../../../src/sasjs-job/index'
import { processContext } from '../../../src/sasjs-context/index'

describe('sasjs context', () => {
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

    const contexts = await processContext(['context', 'list'])

    await saveGlobalRcFile(
      JSON.stringify({
        targets: [
          {
            name: 'cli-tests',
            serverType: 'SASVIYA',
            serverUrl: 'https://sas.analytium.co.uk',
            appLoc: '/Public/app/cli-tests',
            tgtServices: ['testJob'],
            tgtDeployVars: {
              contextName: contexts[0]
            }
          }
        ]
      })
    )
  }, 4 * 60 * 1000)

  describe('execute', () => {
    it(
      'should submit a job for execution',
      async () => {
        const command = 'job execute /Public/app/cli-tests/testJob -t cli-tests'.split(
          ' '
        )

        await expect(processJob(command)).resolves.toEqual(true)
      },
      60 * 1000
    )

    it(
      'should submit a job and wait for completion',
      async () => {
        const command = 'job execute /Public/app/cli-tests/testJob -t cli-tests -w'.split(
          ' '
        )

        await expect(processJob(command)).resolves.toEqual(true)
      },
      60 * 1000
    )

    it(
      'should submit a job and wait for its output',
      async () => {
        const command = 'job execute /Public/app/cli-tests/testJob -t cli-tests -w -o'.split(
          ' '
        )

        const jobOutput = await processJob(command)

        expect(typeof jobOutput).toEqual('object') // maybe we should check some specific property of this object
      },
      60 * 1000
    )
  })
})

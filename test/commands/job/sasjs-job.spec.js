import { saveGlobalRcFile } from '../../../src/utils/config-utils'
import dotenv from 'dotenv'
import path from 'path'
import { processJob } from '../../../src/sasjs-job/index'
import { processContext } from '../../../src/sasjs-context/index'
import { folderExists, fileExists } from '../../../src/utils/file-utils'

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
        const command = 'job execute /Public/app/cli-tests/testJob -t cli-tests'

        await expect(processJob(command)).resolves.toEqual(true)
      },
      60 * 1000
    )

    it(
      'should submit a job and wait for completion',
      async () => {
        const command =
          'job execute /Public/app/cli-tests/testJob -t cli-tests -w'

        await expect(processJob(command)).resolves.toEqual(true)
      },
      60 * 1000
    )

    it(
      'should submit a job and wait for its output',
      async () => {
        const command =
          'job execute /Public/app/cli-tests/testJob -t cli-tests -w -o'

        const jobOutput = await processJob(command)

        expect(typeof jobOutput).toEqual('object')
      },
      60 * 1000
    )

    it(
      'should submit a job and create a file with job output',
      async () => {
        const command =
          'job execute /Public/app/cli-tests/testJob -t cli-tests -o testOutput'

        const folderPath = path.join(process.cwd(), 'testOutput')
        const filePath = path.join(process.cwd(), 'testOutput/output.json')

        const jobOutput = await processJob(command)

        await expect(folderExists(folderPath)).resolves.toEqual(true)
        await expect(fileExists(filePath)).resolves.toEqual(true)
      },
      60 * 1000
    )

    it(
      'should submit a job and create a file with job log',
      async () => {
        const command =
          'job execute /Public/app/cli-tests/testJob -t cli-tests -l testLog'

        const folderPath = path.join(process.cwd(), 'testLog')
        const filePath = path.join(process.cwd(), 'testLog/testJob-log.json')

        const jobOutput = await processJob(command)

        await expect(folderExists(folderPath)).resolves.toEqual(true)
        await expect(fileExists(filePath)).resolves.toEqual(true)
      },
      60 * 1000
    )
  })
})

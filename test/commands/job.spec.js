import dotenv from 'dotenv'
import path from 'path'
import { processJob } from '../../src/commands'
import { processContext } from '../../src/commands'
import { folderExists, fileExists } from '../../src/utils/file-utils'

describe('sasjs job', () => {
  const targetName = 'cli-tests-job'

  beforeAll(async () => {
    process.projectDir = path.join(process.cwd())

    dotenv.config()

    const targetNameContext = 'cli-tests-context'
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
      name: targetNameContext,
      ...config
    })

    const contexts = await processContext([
      'context',
      'list',
      '-t',
      targetNameContext
    ])

    await removeFromGlobalConfigs(targetNameContext)

    await addToGlobalConfigs({
      name: targetName,
      ...config,
      tgtServices: ['testJob'],
      tgtDeployVars: {
        contextName: contexts[0]
      }
    })
  }, 4 * 60 * 1000)

  describe('execute', () => {
    it(
      'should submit a job for execution',
      async () => {
        const command = `job execute /Public/app/cli-tests/testJob/job -t ${targetName}`

        await expect(processJob(command)).resolves.toEqual(true)
      },
      60 * 1000
    )

    it(
      'should submit a job and wait for completion',
      async () => {
        const command = `job execute /Public/app/cli-tests/testJob/job -t ${targetName} -w`

        await expect(processJob(command)).resolves.toEqual(true)
      },
      60 * 1000
    )

    it(
      'should submit a job and wait for its output',
      async () => {
        const command = `job execute /Public/app/cli-tests/testJob/job -t ${targetName} -w -o`

        const jobOutput = await processJob(command)

        expect(typeof jobOutput).toEqual('object')
      },
      60 * 1000
    )

    it(
      'should submit a job and create a file with job output',
      async () => {
        const command = `job execute /Public/app/cli-tests/testJob/job -t ${targetName} -o testOutput`

        const folderPath = path.join(process.cwd(), 'testOutput')
        const filePath = path.join(process.cwd(), 'testOutput/output.json')

        await processJob(command)

        await expect(folderExists(folderPath)).resolves.toEqual(true)
        await expect(fileExists(filePath)).resolves.toEqual(true)
      },
      60 * 1000
    )

    it(
      'should submit a job and create a file with job output and wait',
      async () => {
        const command = `job execute /Public/app/cli-tests/testJob/job -t ${targetName} -o testOutput -w`

        const folderPath = path.join(process.cwd(), 'testOutput')
        const filePath = path.join(process.cwd(), 'testOutput/output.json')

        await processJob(command)

        await expect(folderExists(folderPath)).resolves.toEqual(true)
        await expect(fileExists(filePath)).resolves.toEqual(true)
      },
      60 * 1000
    )

    it(
      'should submit a job and create a file with job output, log and auto-wait',
      async () => {
        const command = `job execute /Public/app/cli-tests/testJob/job -t ${targetName} -o testOutput -l testLog.txt`

        const folderPathOutput = path.join(process.cwd(), 'testOutput')
        const filePathOutput = path.join(
          process.cwd(),
          'testOutput/output.json'
        )

        const filePathLog = path.join(process.cwd(), 'testLog.txt')

        await processJob(command)

        await expect(folderExists(folderPathOutput)).resolves.toEqual(true)
        await expect(fileExists(filePathOutput)).resolves.toEqual(true)

        await expect(fileExists(filePathLog)).resolves.toEqual(true)
      },
      60 * 1000
    )

    it(
      'should submit a job and create a file with job log',
      async () => {
        const command = `job execute testJob/job -t ${targetName} -l`

        const filePath = path.join(process.cwd(), 'job.log')
        await processJob(command)

        await expect(fileExists(filePath)).resolves.toEqual(true)
      },
      60 * 1000
    )

    it(
      'should submit a job and create a file with provided job log filename',
      async () => {
        const command = `job execute testJob/job -t ${targetName} -l mycustom.log`

        const filePath = path.join(process.cwd(), 'mycustom.log')

        await processJob(command)

        await expect(fileExists(filePath)).resolves.toEqual(true)
      },
      60 * 1000
    )

    it(
      'should submit a job and create a file with provided job log filename and path',
      async () => {
        const command = `job execute testJob/job -t ${targetName} -l ./my/folder/mycustom.log`

        const folderPath = path.join(process.cwd(), 'my/folder')
        const filePath = path.join(process.cwd(), 'my/folder/mycustom.log')

        await processJob(command)

        await expect(folderExists(folderPath)).resolves.toEqual(true)
        await expect(fileExists(filePath)).resolves.toEqual(true)
      },
      60 * 1000
    )

    it(
      'should submit a job and create a file with provided job log filename and status file',
      async () => {
        const command = `job execute testJob/job -t ${targetName} -l ./my/folder/mycustom.log --status ./my/folder/status.txt`

        const folderPath = path.join(process.cwd(), 'my/folder')
        const filePath = path.join(process.cwd(), 'my/folder/mycustom.log')
        const filePathStatus = path.join(process.cwd(), 'my/folder/status.txt')

        await processJob(command)

        await expect(folderExists(folderPath)).resolves.toEqual(true)
        await expect(fileExists(filePath)).resolves.toEqual(true)
        await expect(fileExists(filePathStatus)).resolves.toEqual(true)
      },
      60 * 1000
    )

    it(
      "should submit a job that doesn't exist and create a status file",
      async () => {
        const command = `job execute job-not-present -t ${targetName} --wait --status ./my/folder/status.txt`

        const folderPath = path.join(process.cwd(), 'my/folder')
        const filePathStatus = path.join(process.cwd(), 'my/folder/status.txt')

        await expect(processJob(command)).rejects.toThrow(
          'Error: Job was not found.'
        )
        await expect(folderExists(folderPath)).resolves.toEqual(true)
        await expect(fileExists(filePathStatus)).resolves.toEqual(true)
      },
      60 * 1000
    )

    it(
      'should submit a job that fails and create a status file',
      async () => {
        const command = `job execute testJob/failingJob -t ${targetName} --wait --status ./my/folder/status.txt`

        const folderPath = path.join(process.cwd(), 'my/folder')
        const filePathStatus = path.join(process.cwd(), 'my/folder/status.txt')
        await expect(processJob(command)).rejects.toThrow('{}')
        await expect(folderExists(folderPath)).resolves.toEqual(true)
        await expect(fileExists(filePathStatus)).resolves.toEqual(true)
      },
      60 * 1000
    )
  })

  afterAll(async () => {
    await removeFromGlobalConfigs(targetName)
  })
})

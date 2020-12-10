import dotenv from 'dotenv'
import path from 'path'
import { processJob } from '../../src/commands'
import { processContext } from '../../src/commands'
import { getContextName } from '../../src/commands/job/execute'
import { compileBuildDeployServices } from '../../src/main'
import { folder } from '../../src/commands/folder/index'
import {
  folderExists,
  fileExists,
  readFile,
  createFolder,
  deleteFolder
} from '../../src/utils/file'
import { generateTimestamp } from '../../src/utils/utils'
import { ServerType, Target } from '@sasjs/utils/types'

const testOutputFolder = 'test-app-job-output-'

describe('sasjs job', () => {
  let config: Target
  const targetName = 'cli-tests-job'
  const timestampAppLoc = generateTimestamp()

  beforeAll(async () => {
    process.projectDir = path.join(process.cwd())

    dotenv.config()

    const serverType: ServerType =
      process.env.SERVER_TYPE === ServerType.SasViya
        ? ServerType.SasViya
        : ServerType.Sas9
    config = {
      name: '',
      serverType: serverType,
      serverUrl: process.env.SERVER_URL as string,
      appLoc: `/Public/app/cli-tests/${targetName}-${timestampAppLoc}`,
      authInfo: {
        client: process.env.CLIENT as string,
        secret: process.env.SECRET as string,
        access_token: process.env.ACCESS_TOKEN as string,
        refresh_token: process.env.REFRESH_TOKEN as string
      }
    }
    const context = await getAvailableContext(config)

    await deployTestJob(config)

    await addToGlobalConfigs({
      ...config,
      name: targetName,
      tgtServices: ['testJob'],
      contextName: context.name,
      tgtDeployVars: {
        contextName: context
      }
    })
  }, 4 * 60 * 1000)

  beforeEach(async () => {
    const timestamp = generateTimestamp()
    const parentFolderNameTimeStamped = `${testOutputFolder}${timestamp}`

    process.projectDir = path.join(process.cwd(), parentFolderNameTimeStamped)

    await createFolder(process.projectDir)
  }, 60 * 1000)

  describe('execute', () => {
    const mockProcessExit = () =>
      jest.spyOn(process, 'exit').mockImplementation((code?: number) => {
        return undefined as never
      })

    it(
      'should submit a job for execution',
      async () => {
        const command = `job execute /Public/app/cli-tests/${targetName}-${timestampAppLoc}/testJob/job -t ${targetName}`

        await expect(processJob(command)).resolves.toEqual(true)
      },
      60 * 1000
    )

    it(
      'should submit a job and wait for completion',
      async () => {
        const command = `job execute /Public/app/cli-tests/${targetName}-${timestampAppLoc}/testJob/job -t ${targetName} -w`

        await expect(processJob(command)).resolves.toEqual(true)
      },
      60 * 1000
    )

    it(
      'should submit a job and wait for its output',
      async () => {
        const command = `job execute /Public/app/cli-tests/${targetName}-${timestampAppLoc}/testJob/job -t ${targetName} -w -o`

        const jobOutput = await processJob(command)

        expect(typeof jobOutput).toEqual('object')
      },
      60 * 1000
    )

    it(
      'should submit a job and create a file with job output',
      async () => {
        const command = `job execute /Public/app/cli-tests/${targetName}-${timestampAppLoc}/testJob/job -t ${targetName} -o testOutput`

        const folderPath = path.join(process.projectDir, 'testOutput')
        const filePath = path.join(process.projectDir, 'testOutput/output.json')

        await processJob(command)

        await expect(folderExists(folderPath)).resolves.toEqual(true)
        await expect(fileExists(filePath)).resolves.toEqual(true)
      },
      60 * 1000
    )

    it(
      'should submit a job and create a file with job output and wait',
      async () => {
        const command = `job execute /Public/app/cli-tests/${targetName}-${timestampAppLoc}/testJob/job -t ${targetName} -o testOutput -w`

        const folderPath = path.join(process.projectDir, 'testOutput')
        const filePath = path.join(process.projectDir, 'testOutput/output.json')

        await processJob(command)

        await expect(folderExists(folderPath)).resolves.toEqual(true)
        await expect(fileExists(filePath)).resolves.toEqual(true)
      },
      60 * 1000
    )

    it(
      'should submit a job and create a file with job output, log and auto-wait',
      async () => {
        const command = `job execute /Public/app/cli-tests/${targetName}-${timestampAppLoc}/testJob/job -t ${targetName} -o testOutput -l testLog.txt`

        const folderPathOutput = path.join(process.projectDir, 'testOutput')
        const filePathOutput = path.join(
          process.projectDir,
          'testOutput/output.json'
        )

        const filePathLog = path.join(process.projectDir, 'testLog.txt')

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

        const filePath = path.join(process.projectDir, 'job.log')
        await processJob(command)

        await expect(fileExists(filePath)).resolves.toEqual(true)
      },
      60 * 1000
    )

    it(
      'should submit a job and create a file with provided job log filename',
      async () => {
        const command = `job execute testJob/job -t ${targetName} -l mycustom.log`

        const filePath = path.join(process.projectDir, 'mycustom.log')

        await processJob(command)

        await expect(fileExists(filePath)).resolves.toEqual(true)
      },
      60 * 1000
    )

    it(
      'should submit a job and create a file with provided job log filename and path',
      async () => {
        const command = `job execute testJob/job -t ${targetName} -l ./my/folder/mycustom.log`

        const folderPath = path.join(process.projectDir, 'my/folder')
        const filePath = path.join(process.projectDir, 'my/folder/mycustom.log')

        await processJob(command)

        await expect(folderExists(folderPath)).resolves.toEqual(true)
        await expect(fileExists(filePath)).resolves.toEqual(true)
      },
      60 * 1000
    )

    it(
      'should submit a job and create a file with provided job log filename and status file',
      async () => {
        const command = `job execute testJob/job -t ${targetName} -l ./my/folder/mycustom.log --status ./my/folder/testJob.status`

        const folderPath = path.join(process.projectDir, 'my/folder')
        const filePath = path.join(process.projectDir, 'my/folder/mycustom.log')
        const filePathStatus = path.join(
          process.projectDir,
          'my/folder/testJob.status'
        )

        await processJob(command)

        await expect(folderExists(folderPath)).resolves.toEqual(true)
        await expect(fileExists(filePath)).resolves.toEqual(true)
        await expect(fileExists(filePathStatus)).resolves.toEqual(true)

        const statusContent = await readFile(filePathStatus)
        expect(statusContent).not.toEqual('')
        expect(statusContent.includes('Job Status: completed')).toEqual(true)
      },
      60 * 1000
    )

    it(
      "should submit a job that doesn't exist and create a status file",
      async () => {
        const command = `job execute job-not-present -t ${targetName} --wait --status ./my/folder/status.txt`

        const folderPath = path.join(process.projectDir, 'my/folder')
        const filePathStatus = path.join(
          process.projectDir,
          'my/folder/status.txt'
        )

        await expect(processJob(command)).resolves.toEqual(
          'Error: Job was not found.'
        )
        await expect(folderExists(folderPath)).resolves.toEqual(true)
        await expect(fileExists(filePathStatus)).resolves.toEqual(true)

        const statusContent = await readFile(filePathStatus)
        expect(statusContent).not.toEqual('')
        expect(
          statusContent.includes(
            'Job Status: Not Available\nDetails: Error: Job was not found.'
          )
        ).toEqual(true)
      },
      60 * 1000
    )

    it(
      'should submit a job that fails and create a status file',
      async () => {
        const command = `job execute testJob/failingJob -t ${targetName} --wait --status ./my/folder/job.status`

        const folderPath = path.join(process.projectDir, 'my/folder')
        const filePathStatus = path.join(
          process.projectDir,
          'my/folder/job.status'
        )

        await expect(processJob(command)).resolves.toEqual('{"state":"error"}')

        await expect(folderExists(folderPath)).resolves.toEqual(true)
        await expect(fileExists(filePathStatus)).resolves.toEqual(true)

        const statusContent = await readFile(filePathStatus)
        expect(statusContent).not.toEqual('')
        expect(statusContent.includes('Job Status: error')).toEqual(true)
      },
      60 * 1000
    )

    it(
      `should submit a job that completes and return it's status`,
      async () => {
        const command = `job execute testJob/job -t ${targetName} --wait --returnStatusOnly`

        const mockExit = mockProcessExit()

        await processJob(command)

        expect(mockExit).toHaveBeenCalledWith(0)
      },
      60 * 1000
    )

    it(
      `should submit a job that completes with a warning and return it's status`,
      async () => {
        const command = `job execute testJob/jobWithWarning -t ${targetName} --returnStatusOnly`

        const mockExit = mockProcessExit()

        await processJob(command)

        expect(mockExit).toHaveBeenCalledWith(1)
      },
      60 * 1000
    )

    it(
      `should submit a job that completes with ignored warning and return it's status`,
      async () => {
        const command = `job execute testJob/jobWithWarning -t ${targetName} --returnStatusOnly --ignoreWarnings`

        const mockExit = mockProcessExit()

        await processJob(command)

        expect(mockExit).toHaveBeenCalledWith(0)
      },
      60 * 1000
    )

    it(
      `should submit a job that fails and return it's status`,
      async () => {
        const command = `job execute testJob/failingJob -t ${targetName} --returnStatusOnly`

        const mockExit = mockProcessExit()

        await processJob(command)

        expect(mockExit).toHaveBeenCalledWith(2)
      },
      60 * 1000
    )

    it(
      `should submit a job that does not exist and return it's status`,
      async () => {
        const command = `job execute testJob/failingJob_DOES_NOT_EXIST -t ${targetName} --wait --returnStatusOnly`

        const mockExit = mockProcessExit()

        await processJob(command)

        expect(mockExit).toHaveBeenCalledWith(2)
      },
      60 * 1000
    )
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  afterAll(async () => {
    await deleteFolder(`./${testOutputFolder}*`)
    await removeFromGlobalConfigs(targetName)

    await folder(`folder delete ${config.appLoc} -t ${targetName}`)
  }, 60 * 1000)
})

describe('getContextName', () => {
  beforeAll(() => {
    jest.mock('chalk')
  })

  afterAll(() => {
    jest.unmock('chalk')
  })

  it('should return the context name if specified in the target', () => {
    const target = { contextName: 'Test Context' }

    expect(getContextName(target)).toEqual('Test Context')
  })

  it('should return the default context if context name is not specified', () => {
    const target = { contextName: undefined }

    expect(getContextName(target)).toEqual('SAS Job Execution compute context')
  })
})

async function getAvailableContext(config: Target) {
  const targetNameContext = 'cli-tests-context'

  await addToGlobalConfigs({
    ...config,
    name: targetNameContext
  })

  const contexts = await processContext([
    'context',
    'list',
    '-t',
    targetNameContext
  ])

  await removeFromGlobalConfigs(targetNameContext)

  return contexts[0]
}

async function deployTestJob(config: Target) {
  const targetName = 'cli-tests-cbd-for-job'
  config = {
    ...config,
    name: targetName,
    tgtServices: ['../test/commands/cbd/testJob'],
    jobs: ['../test/commands/cbd/testJob'],
    deployServicePack: true,
    tgtDeployVars: {
      client: process.env.CLIENT as string,
      secret: process.env.SECRET as string
    },
    tgtDeployScripts: [],
    jobInit: '../test/commands/cbd/testServices/serviceinit.sas',
    jobTerm: '../test/commands/cbd/testServices/serviceterm.sas',
    tgtServiceInit: '../test/commands/cbd/testServices/serviceinit.sas',
    tgtServiceTerm: '../test/commands/cbd/testServices/serviceterm.sas'
  }
  await addToGlobalConfigs(config)

  const command = `cbd ${targetName} -f`.split(' ')
  await expect(compileBuildDeployServices(command)).resolves.toEqual(true)

  const sasjsBuildDirPath = path.join(process.cwd(), 'sasjsbuild')
  await deleteFolder(sasjsBuildDirPath)

  await removeFromGlobalConfigs(targetName)
}

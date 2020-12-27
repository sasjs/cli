import dotenv from 'dotenv'
import path from 'path'
import { processJob } from '../..'
import { processContext } from '../..'
import { getContextName } from '../execute'
import { compileBuildDeployServices } from '../../../main'
import { folder } from '../../folder/index'
import {
  folderExists,
  fileExists,
  readFile,
  deleteFolder,
  copy
} from '../../../utils/file'
import { generateTimestamp } from '../../../utils/utils'
import { ServerType, Target } from '@sasjs/utils/types'
import {
  removeFromGlobalConfig,
  saveToGlobalConfig
} from '../../../utils/config'
import { Command } from '../../../utils/command'
import { createTestApp, removeTestApp } from '../../../utils/test'

const testOutputFolder = 'test-app-job-output-'

describe('sasjs job', () => {
  let target: Target

  beforeAll(async (done) => {
    target = await createGlobalTarget()
    await createTestApp(__dirname, target.name)
    await copyJobsAndServices(target.name)
    await compileBuildDeployServices(new Command(`cbd -t ${target.name} -f`))

    const context = await getAvailableContext(target)
    await saveToGlobalConfig(
      new Target({
        ...target.toJson(),
        contextName: context.name
      })
    )

    done()
  })

  afterAll(async (done) => {
    await folder(
      new Command(
        `folder delete /Public/app/cli-tests/${target.name} -t ${target.name}`
      )
    )
    await removeTestApp(__dirname, target.name)
    await removeFromGlobalConfig(target.name)
    done()
  })

  describe('execute', () => {
    const mockProcessExit = () =>
      jest.spyOn(process, 'exit').mockImplementation((code?: number) => {
        return undefined as never
      })

    it(
      'should submit a job for execution',
      async () => {
        const command = new Command(
          `job execute /Public/app/cli-tests/${target.name}/testJob/job -t ${target.name}`
        )

        await expect(processJob(command)).resolves.toEqual(true)
      },
      60 * 1000
    )

    it(
      'should submit a job and wait for completion',
      async () => {
        const command = new Command(
          `job execute /Public/app/cli-tests/${target.name}/testJob/job -t ${target.name} -w`
        )

        await expect(processJob(command)).resolves.toEqual(true)
      },
      60 * 1000
    )

    it(
      'should submit a job and wait for its output',
      async () => {
        const command = new Command(
          `job execute /Public/app/cli-tests/${target.name}/testJob/job -t ${target.name} -w -o`
        )

        const jobOutput = await processJob(command)

        expect(typeof jobOutput).toEqual('object')
      },
      60 * 1000
    )

    it(
      'should submit a job and create a file with job output',
      async () => {
        const command = new Command(
          `job execute /Public/app/cli-tests/${target.name}/testJob/job -t ${target.name} -o testOutput`
        )

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
        const command = new Command(
          `job execute /Public/app/cli-tests/${target.name}/testJob/job -t ${target.name} -o testOutput -w`
        )

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
        const command = new Command(
          `job execute /Public/app/cli-tests/${target.name}/testJob/job -t ${target.name} -o testOutput -l testLog.txt`
        )

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
        const command = new Command(
          `job execute testJob/job -t ${target.name} -l`
        )

        const filePath = path.join(process.projectDir, 'job.log')
        await processJob(command)

        await expect(fileExists(filePath)).resolves.toEqual(true)
      },
      60 * 1000
    )

    it(
      'should submit a job and create a file with provided job log filename',
      async () => {
        const command = new Command(
          `job execute testJob/job -t ${target.name} -l mycustom.log`
        )

        const filePath = path.join(process.projectDir, 'mycustom.log')

        await processJob(command)

        await expect(fileExists(filePath)).resolves.toEqual(true)
      },
      60 * 1000
    )

    it(
      'should submit a job and create a file with provided job log filename and path',
      async () => {
        const command = new Command(
          `job execute testJob/job -t ${target.name} -l ./my/folder/mycustom.log`
        )

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
        const command = new Command(
          `job execute testJob/job -t ${target.name} -l ./my/folder/mycustom.log --status ./my/folder/testJob.status`
        )

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
        const command = new Command(
          `job execute job-not-present -t ${target.name} --wait --status ./my/folder/status.txt`
        )

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
        const command = new Command(
          `job execute testJob/failingJob -t ${target.name} --wait --status ./my/folder/job.status`
        )

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
        const command = new Command(
          `job execute testJob/job -t ${target.name} --wait --returnStatusOnly`
        )

        const mockExit = mockProcessExit()

        await processJob(command)

        expect(mockExit).toHaveBeenCalledWith(0)
      },
      60 * 1000
    )

    it(
      `should submit a job that completes with a warning and return it's status`,
      async () => {
        const command = new Command(
          `job execute testJob/jobWithWarning -t ${target.name} --returnStatusOnly`
        )

        const mockExit = mockProcessExit()

        await processJob(command)

        expect(mockExit).toHaveBeenCalledWith(1)
      },
      60 * 1000
    )

    it(
      `should submit a job that completes with ignored warning and return it's status`,
      async () => {
        const command = new Command(
          `job execute testJob/jobWithWarning -t ${target.name} --returnStatusOnly --ignoreWarnings`
        )

        const mockExit = mockProcessExit()

        await processJob(command)

        expect(mockExit).toHaveBeenCalledWith(0)
      },
      60 * 1000
    )

    it(
      `should submit a job that fails and return it's status`,
      async () => {
        const command = new Command(
          `job execute testJob/failingJob -t ${target.name} --returnStatusOnly -l`
        )

        const mockExit = mockProcessExit()

        await processJob(command)

        expect(mockExit).toHaveBeenCalledWith(2)
        await expect(folderExists(process.projectDir)).resolves.toEqual(true)

        const logPath = path.join(process.projectDir, `failingJob.log`)

        await expect(fileExists(logPath)).resolves.toEqual(true)

        const logData = await readFile(logPath)

        expect(
          logData.match(
            'ERROR: The %ABORT statement is not valid in open code.'
          )
        ).toBeTruthy()
        expect(logData.match(/\* ServiceTerm end;$/gm)).toBeTruthy()
      },
      60 * 1000
    )

    it(
      `should submit a job that does not exist and return it's status`,
      async () => {
        const command = new Command(
          `job execute testJob/failingJob_DOES_NOT_EXIST -t ${target.name} --wait --returnStatusOnly`
        )

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
    await removeFromGlobalConfig(target.name)

    await folder(
      new Command(`folder delete ${target.appLoc} -t ${target.name}`)
    )
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

    expect(getContextName(target as Target)).toEqual('Test Context')
  })

  it('should return the default context if context name is not specified', () => {
    const target = { contextName: undefined }

    expect(getContextName((target as unknown) as Target)).toEqual(
      'SAS Job Execution compute context'
    )
  })
})

async function getAvailableContext(target: Target) {
  const targetNameContext = 'cli-tests-context'

  await saveToGlobalConfig(
    new Target({
      ...target.toJson(),
      name: targetNameContext
    })
  )

  const contexts = await processContext(
    new Command(['context', 'list', '-t', targetNameContext])
  )

  await removeFromGlobalConfig(targetNameContext)

  return (contexts as any[])[0]
}

const createGlobalTarget = async () => {
  dotenv.config()
  const timestamp = generateTimestamp()
  const targetName = `cli-tests-job-${timestamp}`

  const serverType: ServerType =
    process.env.SERVER_TYPE === ServerType.SasViya
      ? ServerType.SasViya
      : ServerType.Sas9
  const target = new Target({
    name: targetName,
    serverType,
    serverUrl: process.env.SERVER_URL as string,
    appLoc: `/Public/app/cli-tests/${targetName}`,
    serviceConfig: {
      serviceFolders: ['testServices', 'testJob', 'services'],
      initProgram: 'testServices/serviceinit.sas',
      termProgram: 'testServices/serviceterm.sas',
      macroVars: {}
    },
    jobConfig: {
      jobFolders: ['testJob'],
      initProgram: 'testServices/serviceinit.sas',
      termProgram: 'testServices/serviceterm.sas',
      macroVars: {}
    },
    authConfig: {
      client: process.env.CLIENT as string,
      secret: process.env.SECRET as string,
      access_token: process.env.ACCESS_TOKEN as string,
      refresh_token: process.env.REFRESH_TOKEN as string
    },
    deployConfig: {
      deployServicePack: true,
      deployScripts: []
    }
  })
  await saveToGlobalConfig(target)
  return target
}

const copyJobsAndServices = async (appName: string) => {
  await copy(
    path.join(__dirname, 'testJob'),
    path.join(__dirname, appName, 'sasjs', 'testJob')
  )
  await copy(
    path.join(__dirname, 'testServices'),
    path.join(__dirname, appName, 'sasjs', 'testServices')
  )
}

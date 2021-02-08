import dotenv from 'dotenv'
import path from 'path'
import { processJob } from '../..'
import { processContext } from '../..'
import { compileBuildDeployServices } from '../../../main'
import { folder } from '../../folder/index'
import { folderExists, fileExists, readFile, copy } from '../../../utils/file'
import { generateTimestamp } from '../../../utils/utils'
import { ServerType, Target } from '@sasjs/utils/types'
import {
  removeFromGlobalConfig,
  saveToGlobalConfig
} from '../../../utils/config'
import { Command } from '../../../utils/command'
import {
  createTestApp,
  mockProcessExit,
  removeTestApp
} from '../../../utils/test'
import { Logger, LogLevel } from '@sasjs/utils/logger'

describe('sasjs job execute', () => {
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

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should submit a job for execution', async (done) => {
    const command = new Command(
      `job execute /Public/app/cli-tests/${target.name}/services/testJob/job -t ${target.name}`
    )

    await expect(processJob(command)).toResolve()

    done()
  })

  it('should submit a job and wait for completion', async (done) => {
    const command = new Command(
      `job execute /Public/app/cli-tests/${target.name}/jobs/testJob/job -t ${target.name} -w`
    )

    await expect(processJob(command)).toResolve()
    done()
  })

  it('should submit a job and wait for its output', async (done) => {
    const command = new Command(
      `job execute /Public/app/cli-tests/${target.name}/jobs/testJob/job -t ${target.name} -w -o`
    )

    await expect(processJob(command)).toResolve()

    done()
  })

  it('should submit a job and create a file with job output', async (done) => {
    const command = new Command(
      `job execute /Public/app/cli-tests/${target.name}/jobs/testJob/job -t ${target.name} -o testOutput`
    )

    const folderPath = path.join(process.projectDir, 'testOutput')
    const filePath = path.join(process.projectDir, 'testOutput/output.json')

    await processJob(command)

    await expect(folderExists(folderPath)).toResolve()
    await expect(fileExists(filePath)).toResolve()

    done()
  })

  it('should submit a job and create a file with job output and wait', async (done) => {
    const command = new Command(
      `job execute /Public/app/cli-tests/${target.name}/jobs/testJob/job -t ${target.name} -o testOutput -w`
    )

    const folderPath = path.join(process.projectDir, 'testOutput')
    const filePath = path.join(process.projectDir, 'testOutput/output.json')

    await processJob(command)

    await expect(folderExists(folderPath)).toResolve()
    await expect(fileExists(filePath)).toResolve()

    done()
  })

  it('should submit a job and create a file with job output, log and auto-wait', async (done) => {
    const command = new Command(
      `job execute /Public/app/cli-tests/${target.name}/jobs/testJob/job -t ${target.name} -o testOutput -l testLog.txt`
    )

    const folderPathOutput = path.join(process.projectDir, 'testOutput')
    const filePathOutput = path.join(
      process.projectDir,
      'testOutput/output.json'
    )

    const filePathLog = path.join(process.projectDir, 'testLog.txt')

    await processJob(command)

    await expect(folderExists(folderPathOutput)).toResolve()
    await expect(fileExists(filePathOutput)).toResolve()

    await expect(fileExists(filePathLog)).toResolve()

    done()
  })

  it('should submit a job and create a file with job log', async (done) => {
    const command = new Command(
      `job execute jobs/testJob/job -t ${target.name} -l`
    )

    const filePath = path.join(process.projectDir, 'job.log')
    await processJob(command)

    await expect(fileExists(filePath)).toResolve()

    done()
  })

  it('should submit a job and create a file with provided job log filename', async (done) => {
    const command = new Command(
      `job execute jobs/testJob/job -t ${target.name} -l mycustom.log`
    )

    const filePath = path.join(process.projectDir, 'mycustom.log')

    await processJob(command)

    await expect(fileExists(filePath)).toResolve()

    done()
  })

  it('should submit a job and create a file with provided job log filename and path', async (done) => {
    const command = new Command(
      `job execute jobs/testJob/job -t ${target.name} -l ./my/folder/mycustom.log`
    )

    const folderPath = path.join(process.projectDir, 'my/folder')
    const filePath = path.join(process.projectDir, 'my/folder/mycustom.log')

    await processJob(command)

    await expect(folderExists(folderPath)).toResolve()
    await expect(fileExists(filePath)).toResolve()

    done()
  })

  it('should submit a job and create a file with provided job log filename and status file', async (done) => {
    const command = new Command(
      `job execute jobs/testJob/job -t ${target.name} -l ./my/folder/mycustom.log --status ./my/folder/testJob.status`
    )

    const folderPath = path.join(process.projectDir, 'my/folder')
    const filePath = path.join(process.projectDir, 'my/folder/mycustom.log')
    const filePathStatus = path.join(
      process.projectDir,
      'my/folder/testJob.status'
    )

    await processJob(command)

    await expect(folderExists(folderPath)).toResolve()
    await expect(fileExists(filePath)).toResolve()
    await expect(fileExists(filePathStatus)).toResolve()

    const statusContent = await readFile(filePathStatus)
    expect(statusContent).not.toEqual('')
    expect(statusContent.includes('Job Status: completed')).toEqual(true)

    done()
  })

  it("should submit a job that doesn't exist and create a status file", async (done) => {
    const command = new Command(
      `job execute job-not-present -t ${target.name} --wait --status ./my/folder/status.txt`
    )

    const folderPath = path.join(process.projectDir, 'my/folder')
    const filePathStatus = path.join(process.projectDir, 'my/folder/status.txt')

    await expect(processJob(command)).resolves.toEqual(
      'Error: Job was not found.'
    )
    await expect(folderExists(folderPath)).toResolve()
    await expect(fileExists(filePathStatus)).toResolve()

    const statusContent = await readFile(filePathStatus)
    expect(statusContent).not.toEqual('')
    expect(
      statusContent.includes(
        'Job Status: Not Available\nDetails: Error: Job was not found.'
      )
    ).toEqual(true)

    done()
  })

  it('should submit a job that fails and create a status file', async (done) => {
    const command = new Command(
      `job execute jobs/testJob/failingJob -t ${target.name} --wait --status ./my/folder/job.status`
    )

    const folderPath = path.join(process.projectDir, 'my/folder')
    const filePathStatus = path.join(process.projectDir, 'my/folder/job.status')

    await expect(processJob(command)).toResolve()

    await expect(folderExists(folderPath)).toResolve()
    await expect(fileExists(filePathStatus)).toResolve()

    const statusContent = await readFile(filePathStatus)
    expect(statusContent).not.toEqual('')
    expect(statusContent.includes('Job Status: error')).toEqual(true)

    done()
  })

  it(`should submit a job that completes and return it's status`, async (done) => {
    const command = new Command(
      `job execute jobs/testJob/job -t ${target.name} --wait --returnStatusOnly`
    )

    const mockExit = mockProcessExit()

    await processJob(command)

    expect(mockExit).toHaveBeenCalledWith(0)

    done()
  })

  it(`should submit a job that completes with a warning and return it's status`, async (done) => {
    const command = new Command(
      `job execute jobs/testJob/jobWithWarning -t ${target.name} --returnStatusOnly`
    )

    const mockExit = mockProcessExit()

    await processJob(command)

    expect(mockExit).toHaveBeenCalledWith(1)

    done()
  })

  it(`should submit a job that completes with ignored warning and return it's status`, async (done) => {
    const command = new Command(
      `job execute jobs/testJob/jobWithWarning -t ${target.name} --returnStatusOnly --ignoreWarnings`
    )

    const mockExit = mockProcessExit()

    await processJob(command)

    expect(mockExit).toHaveBeenCalledWith(0)

    done()
  })

  it(`should submit a job that fails and return its status`, async (done) => {
    const command = new Command(
      `job execute jobs/testJob/failingJob -t ${target.name} --returnStatusOnly -l`
    )

    const mockExit = mockProcessExit()

    await processJob(command)

    expect(mockExit).toHaveBeenCalledWith(2)
    await expect(folderExists(process.projectDir)).toResolve()

    const logPath = path.join(process.projectDir, `failingJob.log`)

    await expect(fileExists(logPath)).toResolve()

    const logData = await readFile(logPath)

    expect(
      logData.match('ERROR: The %ABORT statement is not valid in open code.')
    ).toBeTruthy()
    expect(logData.match(/\* JobTerm end;$/gm)).toBeTruthy()

    done()
  })

  it(`should submit a job that does not exist and return it's status`, async (done) => {
    const command = new Command(
      `job execute jobs/testJob/failingJob_DOES_NOT_EXIST -t ${target.name} --wait --returnStatusOnly`
    )

    const mockExit = mockProcessExit()

    await processJob(command)

    expect(mockExit).toHaveBeenCalledWith(2)

    done()
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
      serviceFolders: [
        '/sasjs/testServices',
        'sasjs/testJob',
        'sasjs/services'
      ],
      initProgram: '/sasjs/testServices/serviceinit.sas',
      termProgram: '/sasjs/testServices/serviceterm.sas',
      macroVars: {}
    },
    jobConfig: {
      jobFolders: ['/sasjs/testJob'],
      initProgram: '/sasjs/testServices/serviceinit.sas',
      termProgram: '/sasjs/testServices/serviceterm.sas',
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

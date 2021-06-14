import path from 'path'
import dotenv from 'dotenv'
import { processJob, processContext } from '../..'
import { compileBuildDeployServices } from '../../../main'
import { folder } from '../../folder/index'
import {
  folderExists,
  fileExists,
  readFile,
  copy,
  ServerType,
  Target,
  Logger,
  LogLevel,
  generateTimestamp
} from '@sasjs/utils'

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

describe('sasjs job execute', () => {
  let target: Target

  beforeAll(async () => {
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

    process.logger = new Logger(LogLevel.Off)
  })

  afterAll(async () => {
    await folder(
      new Command(
        `folder delete /Public/app/cli-tests/${target.name} -t ${target.name}`
      )
    )
    await removeTestApp(__dirname, target.name)
    await removeFromGlobalConfig(target.name)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should submit a job for execution', async () => {
    const command = new Command(
      `job execute /Public/app/cli-tests/${target.name}/services/testJob/job -t ${target.name}`
    )

    await expect(processJob(command)).toResolve()
  })

  it('should submit a job and wait for completion', async () => {
    const command = new Command(
      `job execute /Public/app/cli-tests/${target.name}/jobs/testJob/job -t ${target.name} -w`
    )

    await expect(processJob(command)).toResolve()
  })

  it('should submit a job and wait for its output', async () => {
    const command = new Command(
      `job execute /Public/app/cli-tests/${target.name}/jobs/testJob/job -t ${target.name} -w -o`
    )

    await expect(processJob(command)).toResolve()
  })

  it('should submit a job and create a file with job output', async () => {
    const command = new Command(
      `job execute /Public/app/cli-tests/${target.name}/jobs/testJob/job -t ${target.name} -o testOutput`
    )

    const folderPath = path.join(process.projectDir, 'testOutput')
    const filePath = path.join(process.projectDir, 'testOutput/output.json')

    await expect(processJob(command)).toResolve()

    await expect(folderExists(folderPath)).resolves.toEqual(true)
    await expect(fileExists(filePath)).resolves.toEqual(true)
  })

  it('should submit a job and create a file with job output and wait', async () => {
    const command = new Command(
      `job execute /Public/app/cli-tests/${target.name}/jobs/testJob/job -t ${target.name} -o testOutput -w`
    )

    const folderPath = path.join(process.projectDir, 'testOutput')
    const filePath = path.join(process.projectDir, 'testOutput/output.json')

    await expect(processJob(command)).toResolve()

    await expect(folderExists(folderPath)).resolves.toEqual(true)
    await expect(fileExists(filePath)).resolves.toEqual(true)
  })

  it('should submit a job and create a file with job output, log and auto-wait', async () => {
    const command = new Command(
      `job execute /Public/app/cli-tests/${target.name}/jobs/testJob/job -t ${target.name} -o testOutput -l testLog.txt`
    )

    const folderPathOutput = path.join(process.projectDir, 'testOutput')
    const filePathOutput = path.join(
      process.projectDir,
      'testOutput/output.json'
    )

    const filePathLog = path.join(process.projectDir, 'testLog.txt')

    await expect(processJob(command)).toResolve()

    await expect(folderExists(folderPathOutput)).resolves.toEqual(true)
    await expect(fileExists(filePathOutput)).resolves.toEqual(true)

    await expect(fileExists(filePathLog)).resolves.toEqual(true)
  })

  it('should submit a job and create a file with job log', async () => {
    const command = new Command(
      `job execute jobs/testJob/job -t ${target.name} -l`
    )

    const filePath = path.join(process.projectDir, 'job.log')

    await expect(processJob(command)).toResolve()

    await expect(fileExists(filePath)).resolves.toEqual(true)
  })

  it(
    'should submit a job and create a file with job log having large log',
    async () => {
      const sourcePath = path.join(__dirname, 'testSource', 'source.json')
      const largeLogFileLines = 21 * 1000
      const command = new Command(
        `job execute jobs/testJob/largeLogJob -t ${target.name} -s ${sourcePath} -l`
      )

      const filePath = path.join(process.projectDir, 'largeLogJob.log')

      await expect(processJob(command)).toResolve()

      await expect(fileExists(filePath)).resolves.toEqual(true)

      const logContent = await readFile(filePath)
      let count = 0
      for (let i = 0; i < logContent.length; i++)
        if (logContent[i] === '\n') count++

      expect(count).toBeGreaterThan(largeLogFileLines)

      expect(/GLOBAL TEST_VAR_1 test_var_value_1/.test(logContent)).toEqual(
        true
      )
      expect(/GLOBAL TEST_VAR_2 test_var_value_2/.test(logContent)).toEqual(
        true
      )
    },
    30 * 60 * 1000
  )

  it('should submit a job and create a file with provided job log filename', async () => {
    const command = new Command(
      `job execute jobs/testJob/job -t ${target.name} -l mycustom.log`
    )

    const filePath = path.join(process.projectDir, 'mycustom.log')

    await expect(processJob(command)).toResolve()

    await expect(fileExists(filePath)).resolves.toEqual(true)
  })

  it('should submit a job and create a file with provided job log filename and path', async () => {
    const command = new Command(
      `job execute jobs/testJob/job -t ${target.name} -l ./my/folder/mycustom.log`
    )

    const folderPath = path.join(process.projectDir, 'my/folder')
    const filePath = path.join(process.projectDir, 'my/folder/mycustom.log')

    await expect(processJob(command)).toResolve()

    await expect(folderExists(folderPath)).resolves.toEqual(true)
    await expect(fileExists(filePath)).resolves.toEqual(true)
  })

  it('should submit a job and create a file with provided job log filename and status file', async () => {
    const command = new Command(
      `job execute jobs/testJob/job -t ${target.name} -l ./my/folder/mycustom.log --status ./my/folder/testJob.status`
    )

    const folderPath = path.join(process.projectDir, 'my/folder')
    const filePath = path.join(process.projectDir, 'my/folder/mycustom.log')
    const filePathStatus = path.join(
      process.projectDir,
      'my/folder/testJob.status'
    )

    await expect(processJob(command)).toResolve()

    await expect(folderExists(folderPath)).resolves.toEqual(true)
    await expect(fileExists(filePath)).resolves.toEqual(true)
    await expect(fileExists(filePathStatus)).resolves.toEqual(true)

    const statusContent = await readFile(filePathStatus)
    expect(statusContent).not.toEqual('')
    expect(statusContent.includes('Job Status: completed')).toEqual(true)
  })

  it("should submit a job that doesn't exist and create a status file", async () => {
    const command = new Command(
      `job execute job-not-present -t ${target.name} --wait --status ./my/folder/status.txt`
    )

    const folderPath = path.join(process.projectDir, 'my/folder')
    const filePathStatus = path.join(process.projectDir, 'my/folder/status.txt')

    jest.spyOn(process.logger, 'error')

    await expect(processJob(command)).resolves.toEqual(
      'Error: Job was not found.'
    )

    await expect(folderExists(folderPath)).resolves.toEqual(true)
    await expect(fileExists(filePathStatus)).resolves.toEqual(true)

    expect(process.logger.error).toHaveBeenNthCalledWith(
      1,
      'An error has occurred when executing a job.',
      'Error: Job was not found.'
    )

    const statusContent = await readFile(filePathStatus)
    expect(statusContent).not.toEqual('')
    expect(
      statusContent.includes(
        'Job Status: Not Available\nDetails: Error: Job was not found.'
      )
    ).toEqual(true)
  })

  it('should submit a job that fails and create a status file', async () => {
    const command = new Command(
      `job execute jobs/testJob/failingJob -t ${target.name} --wait --status ./my/folder/job.status`
    )

    const folderPath = path.join(process.projectDir, 'my/folder')
    const filePathStatus = path.join(process.projectDir, 'my/folder/job.status')

    await expect(processJob(command)).toResolve()

    await expect(folderExists(folderPath)).resolves.toEqual(true)
    await expect(fileExists(filePathStatus)).resolves.toEqual(true)

    const statusContent = await readFile(filePathStatus)
    expect(statusContent).not.toEqual('')
    expect(statusContent.includes('Job Status: error')).toEqual(true)
  })

  it(`should submit a job that completes and return it's status`, async () => {
    const command = new Command(
      `job execute jobs/testJob/job -t ${target.name} --wait --returnStatusOnly`
    )

    const mockExit = mockProcessExit()

    await processJob(command)

    expect(mockExit).toHaveBeenCalledWith(0)
  })

  it(`should submit a job that completes with a warning and return it's status`, async () => {
    const command = new Command(
      `job execute jobs/testJob/jobWithWarning -t ${target.name} --returnStatusOnly`
    )

    const mockExit = mockProcessExit()

    await processJob(command)

    expect(mockExit).toHaveBeenCalledWith(1)
  })

  it(`should submit a job that completes with ignored warning and return it's status`, async () => {
    const command = new Command(
      `job execute jobs/testJob/jobWithWarning -t ${target.name} --returnStatusOnly --ignoreWarnings`
    )

    const mockExit = mockProcessExit()

    await processJob(command)

    expect(mockExit).toHaveBeenCalledWith(0)
  })

  it(`should submit a job that fails and return its status`, async () => {
    const command = new Command(
      `job execute jobs/testJob/failingJob -t ${target.name} --returnStatusOnly -l`
    )

    const mockExit = mockProcessExit()

    await processJob(command)

    expect(mockExit).toHaveBeenCalledWith(2)
    await expect(folderExists(process.projectDir)).resolves.toEqual(true)

    const logPath = path.join(process.projectDir, `failingJob.log`)

    await expect(fileExists(logPath)).resolves.toEqual(true)

    const logData = await readFile(logPath)

    expect(
      logData.match('ERROR: The %ABORT statement is not valid in open code.')
    ).toBeTruthy()
    expect(logData.match(/\* JobTerm end;$/gm)).toBeTruthy()
  })

  it(`should submit a job that does not exist and return it's status`, async () => {
    const command = new Command(
      `job execute jobs/testJob/failingJob_DOES_NOT_EXIST -t ${target.name} --wait --returnStatusOnly`
    )

    const mockExit = mockProcessExit()

    await processJob(command)

    expect(mockExit).toHaveBeenCalledWith(2)
  })
})

async function getAvailableContext(target: Target) {
  const timestamp = generateTimestamp()
  const targetName = `cli-job-tests-context-${timestamp}`

  await saveToGlobalConfig(
    new Target({
      ...target.toJson(),
      name: targetName
    })
  )

  const contexts = await processContext(
    new Command(['context', 'list', '-t', targetName])
  )

  await removeFromGlobalConfig(targetName)

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
    serverUrl: process.env.VIYA_SERVER_URL as string,
    appLoc: `/Public/app/cli-tests/${targetName}`,
    serviceConfig: {
      serviceFolders: ['sasjs/testServices', 'sasjs/testJob', 'sasjs/services'],
      initProgram: 'sasjs/testServices/serviceinit.sas',
      termProgram: 'sasjs/testServices/serviceterm.sas',
      macroVars: {}
    },
    jobConfig: {
      jobFolders: ['sasjs/testJob'],
      initProgram: 'sasjs/testServices/serviceinit.sas',
      termProgram: 'sasjs/testServices/serviceterm.sas',
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

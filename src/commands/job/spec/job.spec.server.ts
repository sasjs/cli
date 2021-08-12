import path from 'path'
import dotenv from 'dotenv'
import {
  folderExists,
  fileExists,
  readFile,
  copy,
  ServerType,
  Target,
  Logger,
  LogLevel,
  generateTimestamp,
  AuthConfig
} from '@sasjs/utils'
import {
  getAuthConfig,
  removeFromGlobalConfig,
  saveToGlobalConfig
} from '../../../utils/config'
import { Command } from '../../../utils/command'
import {
  createTestApp,
  mockProcessExit,
  removeTestApp,
  removeTestServerFolder
} from '../../../utils/test'
import SASjs, { NoSessionStateError } from '@sasjs/adapter/node'
import { setConstants } from '../../../utils'
import { execute } from '../execute'
import { prefixAppLoc } from '../../../utils/prefixAppLoc'
import { build } from '../../build/build'
import { deploy } from '../../deploy/deploy'

describe('sasjs job execute', () => {
  let target: Target
  let sasjs: SASjs
  let authConfig: AuthConfig

  beforeAll(async () => {
    target = await createGlobalTarget()
    await createTestApp(__dirname, target.name)
    await copyJobsAndServices(target.name)
    await build(target)
    await deploy(target, false)

    await saveToGlobalConfig(
      new Target({
        ...target.toJson()
      })
    )

    sasjs = new SASjs({
      serverUrl: target.serverUrl,
      allowInsecureRequests: target.allowInsecureRequests,
      appLoc: target.appLoc,
      serverType: target.serverType,
      debug: true
    })
    authConfig = await getAuthConfig(target)
    process.logger = new Logger(LogLevel.Off)
  })

  afterAll(async () => {
    await removeTestServerFolder(`/Public/app/cli-tests/${target.name}`, target)
    await removeTestApp(__dirname, target.name)
    await removeFromGlobalConfig(target.name)
  })

  it('should submit a job for execution', async () => {
    await expect(
      execute(
        sasjs,
        authConfig,
        `/Public/app/cli-tests/${target.name}/services/testJob/job`,
        target,
        false,
        '',
        '',
        '',
        false,
        false,
        undefined,
        false
      )
    ).toResolve()
  })

  it('should submit a job and wait for completion', async () => {
    await expect(
      execute(
        sasjs,
        authConfig,
        `/Public/app/cli-tests/${target.name}/jobs/testJob/job`,
        target,
        true,
        '',
        '',
        '',
        false,
        false,
        undefined,
        false
      )
    ).toResolve()
  })

  it('should submit a job and wait for its output', async () => {
    await expect(
      execute(
        sasjs,
        authConfig,
        `/Public/app/cli-tests/${target.name}/jobs/testJob/job`,
        target,
        true,
        true,
        '',
        '',
        false,
        false,
        undefined,
        false
      )
    ).toResolve()
  })

  it('should submit a job and create a file with job output', async () => {
    const folderPath = path.join(process.projectDir, 'testOutput')
    const filePath = path.join(process.projectDir, 'testOutput/output.json')

    await expect(
      execute(
        sasjs,
        authConfig,
        `/Public/app/cli-tests/${target.name}/jobs/testJob/job`,
        target,
        false,
        'testOutput',
        '',
        '',
        false,
        false,
        undefined,
        false
      )
    ).toResolve()

    await expect(folderExists(folderPath)).resolves.toEqual(true)
    await expect(fileExists(filePath)).resolves.toEqual(true)
  })

  it('should submit a job and create a file with job output and wait', async () => {
    const folderPath = path.join(process.projectDir, 'testOutput')
    const filePath = path.join(process.projectDir, 'testOutput/output.json')

    await expect(
      execute(
        sasjs,
        authConfig,
        `/Public/app/cli-tests/${target.name}/jobs/testJob/job`,
        target,
        true,
        'testOutput',
        '',
        '',
        false,
        false,
        undefined,
        false
      )
    ).toResolve()

    await expect(folderExists(folderPath)).resolves.toEqual(true)
    await expect(fileExists(filePath)).resolves.toEqual(true)
  })

  it('should submit a job and create a file with job output, log and auto-wait', async () => {
    const folderPathOutput = path.join(process.projectDir, 'testOutput')
    const filePathOutput = path.join(
      process.projectDir,
      'testOutput/output.json'
    )

    const filePathLog = path.join(process.projectDir, 'testLog.txt')

    await expect(
      execute(
        sasjs,
        authConfig,
        `/Public/app/cli-tests/${target.name}/jobs/testJob/job`,
        target,
        true,
        'testOutput',
        path.join(process.projectDir, 'testLog.txt'),
        '',
        false,
        false,
        undefined,
        false
      )
    ).toResolve()

    await expect(folderExists(folderPathOutput)).resolves.toEqual(true)
    await expect(fileExists(filePathOutput)).resolves.toEqual(true)

    await expect(fileExists(filePathLog)).resolves.toEqual(true)
  })

  it('should submit a job and create a file with job log', async () => {
    const filePath = path.join(process.projectDir, 'job.log')

    await expect(
      execute(
        sasjs,
        authConfig,
        `/Public/app/cli-tests/${target.name}/jobs/testJob/job`,
        target,
        false,
        false,
        path.join(process.projectDir, 'job.log'),
        '',
        false,
        false,
        undefined,
        false
      )
    ).toResolve()

    await expect(fileExists(filePath)).resolves.toEqual(true)
  })

  it(
    'should submit a job and create a file with job log having large log',
    async () => {
      const sourcePath = path.join(__dirname, 'testSource', 'source.json')
      const largeLogFileLines = 21 * 1000
      const filePath = path.join(process.projectDir, 'largeLogJob.log')

      await expect(
        execute(
          sasjs,
          authConfig,
          'jobs/testJob/largeLogJob',
          target,
          false,
          false,
          path.join(process.projectDir, 'largeLogJob.log'),
          '',
          false,
          false,
          sourcePath,
          false
        )
      ).toResolve()

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
    const filePath = path.join(process.projectDir, 'mycustom.log')

    await expect(
      execute(
        sasjs,
        authConfig,
        'jobs/testJob/job',
        target,
        false,
        false,
        path.join(process.projectDir, 'mycustom.log'),
        '',
        false,
        false,
        undefined,
        false
      )
    ).toResolve()

    await expect(fileExists(filePath)).resolves.toEqual(true)
  })

  it('should submit a job and create a file with provided job log filename and path', async () => {
    const folderPath = path.join(process.projectDir, 'my/folder')
    const filePath = path.join(process.projectDir, 'my/folder/mycustom.log')

    await expect(
      execute(
        sasjs,
        authConfig,
        'jobs/testJob/job',
        target,
        false,
        false,
        path.join(process.projectDir, 'my/folder/mycustom.log'),
        '',
        false,
        false,
        undefined,
        false
      )
    ).toResolve()

    await expect(folderExists(folderPath)).resolves.toEqual(true)
    await expect(fileExists(filePath)).resolves.toEqual(true)
  })

  it('should submit a job and create a file with provided job log filename and status file', async () => {
    const folderPath = path.join(process.projectDir, 'my/folder')
    const filePath = path.join(process.projectDir, 'my/folder/mycustom.log')
    const filePathStatus = path.join(
      process.projectDir,
      'my/folder/testJob.status'
    )

    await expect(
      execute(
        sasjs,
        authConfig,
        'jobs/testJob/job',
        target,
        false,
        false,
        path.join(process.projectDir, 'my/folder/mycustom.log'),
        path.join(process.projectDir, 'my/folder/testJob.status'),
        false,
        false,
        undefined,
        false
      )
    ).toResolve()

    await expect(folderExists(folderPath)).resolves.toEqual(true)
    await expect(fileExists(filePath)).resolves.toEqual(true)
    await expect(fileExists(filePathStatus)).resolves.toEqual(true)

    const statusContent = await readFile(filePathStatus)
    expect(statusContent).not.toEqual('')
    expect(statusContent.includes('Job Status: completed')).toEqual(true)
  })

  it("should submit a job that doesn't exist and create a status file", async () => {
    const folderPath = path.join(process.projectDir, 'my/folder')
    const filePathStatus = path.join(process.projectDir, 'my/folder/status.txt')

    jest.spyOn(process.logger, 'error')

    await expect(
      execute(
        sasjs,
        authConfig,
        prefixAppLoc(target.appLoc, 'job-not-present'),
        target,
        true,
        false,
        undefined,
        path.join(process.projectDir, 'my/folder/status.txt'),
        false,
        false,
        undefined,
        false
      )
    ).resolves.toEqual('Error: Job was not found.')

    await expect(folderExists(folderPath)).resolves.toEqual(true)
    await expect(fileExists(filePathStatus)).resolves.toEqual(true)

    expect(process.logger.error).toHaveBeenNthCalledWith(
      1,
      `An error has occurred when executing a job.
`,
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
    const folderPath = path.join(process.projectDir, 'my/folder')
    const filePathStatus = path.join(process.projectDir, 'my/folder/job.status')

    await expect(
      execute(
        sasjs,
        authConfig,
        'jobs/testJob/failingJob',
        target,
        true,
        false,
        undefined,
        path.join(process.projectDir, 'my/folder/job.status'),
        false,
        false,
        undefined,
        false
      )
    ).toResolve()

    await expect(folderExists(folderPath)).resolves.toEqual(true)
    await expect(fileExists(filePathStatus)).resolves.toEqual(true)

    const statusContent = await readFile(filePathStatus)
    expect(statusContent).not.toEqual('')
    expect(statusContent.includes('Job Status: error')).toEqual(true)
  })

  it(`should submit a job that completes and return it's status`, async () => {
    const mockExit = mockProcessExit()

    await expect(
      execute(
        sasjs,
        authConfig,
        'jobs/testJob/job',
        target,
        true,
        false,
        undefined,
        undefined,
        true,
        false,
        undefined,
        false
      )
    ).toResolve()

    expect(mockExit).toHaveBeenCalledWith(0)
  })

  it(`should submit a job that completes with a warning and return it's status`, async () => {
    const mockExit = mockProcessExit()

    await expect(
      execute(
        sasjs,
        authConfig,
        'jobs/testJob/jobWithWarning',
        target,
        true,
        false,
        undefined,
        undefined,
        true,
        false,
        undefined,
        false
      )
    ).toResolve()

    expect(mockExit).toHaveBeenCalledWith(1)
  })

  it(`should submit a job that completes with ignored warning and return it's status`, async () => {
    const mockExit = mockProcessExit()

    await expect(
      execute(
        sasjs,
        authConfig,
        'jobs/testJob/jobWithWarning',
        target,
        true,
        false,
        undefined,
        undefined,
        true,
        true,
        undefined,
        false
      )
    ).toResolve()

    expect(mockExit).toHaveBeenCalledWith(0)
  })

  it(`should submit a job that fails and return its status`, async () => {
    const mockExit = mockProcessExit()

    await expect(
      execute(
        sasjs,
        authConfig,
        'jobs/testJob/failingJob',
        target,
        true,
        false,
        path.join(process.projectDir, 'failingJob.log'),
        undefined,
        true,
        false,
        undefined,
        false
      )
    ).toResolve()

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
    const mockExit = mockProcessExit()

    await expect(
      execute(
        sasjs,
        authConfig,
        'jobs/testJob/failingJob_DOES_NOT_EXIST',
        target,
        true,
        false,
        undefined,
        undefined,
        true,
        false,
        undefined,
        false
      )
    ).toResolve()

    expect(mockExit).toHaveBeenCalledWith(2)
  })

  it('should terminate the process if server could not get session status', async () => {
    const adapter = new SASjs({
      serverUrl: target.serverUrl,
      allowInsecureRequests: target.allowInsecureRequests,
      appLoc: target.appLoc,
      serverType: target.serverType
    })

    const mockExit = mockProcessExit()

    const errorMessage = `Could not get session state. Server responded with 304 whilst checking state: <sessionStateUrl>`

    const err = new NoSessionStateError(304, '<sessionStateUrl>', '')

    jest.spyOn(process.logger, 'error')
    jest.spyOn(process.logger, 'info')
    jest
      .spyOn(adapter, 'startComputeJob')
      .mockImplementation(() => Promise.reject(err))

    await expect(
      execute(
        adapter,
        authConfig,
        'jobs/testJob/jobWithWarning',
        target,
        false,
        false,
        undefined,
        undefined,
        false,
        false,
        undefined,
        false
      )
    ).toResolve()

    const terminationCode = 2

    expect(process.logger.info).toHaveBeenCalledWith(
      `Process will be terminated with the status code ${terminationCode}.`
    )
    expect(process.logger.error).toHaveBeenNthCalledWith(1, '', errorMessage)
    expect(mockExit).toHaveBeenCalledWith(terminationCode)
  })
})

const createGlobalTarget = async (serverType = ServerType.SasViya) => {
  dotenv.config()
  const timestamp = generateTimestamp()
  const targetName = `cli-tests-job-${timestamp}`
  await setConstants()
  const target = new Target({
    name: targetName,
    serverType,
    serverUrl: (serverType === ServerType.SasViya
      ? process.env.VIYA_SERVER_URL
      : process.env.SAS9_SERVER_URL) as string,
    appLoc: `/Public/app/cli-tests/${targetName}`,
    contextName: process.sasjsConstants.contextName,
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

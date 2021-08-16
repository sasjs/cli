import path from 'path'
import * as executeModule from '../execute'
import { JobCommand } from '../jobCommand'
import { AuthConfig, Logger, LogLevel, ServerType, Target } from '@sasjs/utils'
import * as configUtils from '../../../utils/config'
import { ReturnCode } from '../../../types/command'

const defaultArgs = ['node', 'sasjs', 'job', 'execute']
const target = new Target({
  name: 'test',
  appLoc: '/Public/test/',
  serverType: ServerType.SasViya,
  contextName: 'test context'
})
const authConfig = {}
const jobFileName = 'someJob'
const jobPath = `/Public/folder/${jobFileName}`
const log = './jobLog.log'
const output = './jobOutput.json'
const statusFile = './status/file.txt'
const source = './macros.json'
const projectFolder = __dirname
describe('JobCommand', () => {
  beforeAll(async () => {
    process.projectDir = projectFolder
  })

  beforeEach(() => {
    setupMocks()
  })

  it('should parse sasjs job execute command', async () => {
    await executeCommandWrapper([jobPath])

    expect(executeModule.execute).toHaveBeenCalledWith(
      ...executeCalledWith({ jobPath })
    )
  })

  it('should pass wait as true if log flag with value is present', async () => {
    await executeCommandWrapper([jobPath, '--log', log])

    expect(executeModule.execute).toHaveBeenCalledWith(
      ...executeCalledWith({
        jobPath,
        waitForJob: true,
        logFile: path.join(projectFolder, log)
      })
    )
  })

  it('should pass path for log file and wait to true if log flag without value is present', async () => {
    await executeCommandWrapper([jobPath, '--log'])

    expect(executeModule.execute).toHaveBeenCalledWith(
      ...executeCalledWith({
        jobPath,
        waitForJob: true,
        logFile: path.join(process.projectDir, `${jobFileName}.log`)
      })
    )
  })

  it('should pass wait as true if returnStatusOnly flag is present', async () => {
    await executeCommandWrapper([jobPath, '--returnStatusOnly'])

    expect(executeModule.execute).toHaveBeenCalledWith(
      ...executeCalledWith({
        jobPath,
        waitForJob: true,
        returnStatusOnly: true
      })
    )
  })

  it('should parse sasjs job execute command with all arguments', async () => {
    await executeCommandWrapper([
      jobPath,
      '--target',
      'test',
      '--log',
      log,
      '--output',
      output,
      '--statusFile',
      statusFile,
      '--source',
      source,
      '--returnStatusOnly',
      '--ignoreWarnings',
      '--wait',
      '--streamLog'
    ])

    expect(executeModule.execute).toHaveBeenCalledWith(
      ...executeCalledWith({
        jobPath,
        waitForJob: true,
        output,
        logFile: path.join(projectFolder, log),
        statusFile: path.join(projectFolder, statusFile),
        returnStatusOnly: true,
        ignoreWarnings: true,
        source,
        streamLog: true
      })
    )
  })

  it('should parse a sasjs job execute command with all shorthand arguments', async () => {
    await executeCommandWrapper([
      jobPath,
      '-t',
      'test',
      '-l',
      log,
      '-o',
      output,
      '--statusFile',
      statusFile,
      '-s',
      source,
      '-r',
      '-i',
      '-w',
      '--streamLog'
    ])

    expect(executeModule.execute).toHaveBeenCalledWith(
      ...executeCalledWith({
        jobPath,
        waitForJob: true,
        output,
        logFile: path.join(projectFolder, log),
        statusFile: path.join(projectFolder, statusFile),
        returnStatusOnly: true,
        ignoreWarnings: true,
        source,
        streamLog: true
      })
    )
  })

  it('should log success and return the success code when execution is successful', async () => {
    const returnCode = await executeCommandWrapper([jobPath])

    expect(returnCode).toEqual(ReturnCode.Success)
  })

  it('should return the error code when target is not SASVIYA', async () => {
    jest
      .spyOn(configUtils, 'findTargetInConfiguration')
      .mockImplementation(() =>
        Promise.resolve({
          target: new Target({
            ...target.toJson(),
            serverType: ServerType.Sas9
          }),
          isLocal: true
        })
      )

    const returnCode = await executeCommandWrapper([jobPath], false)

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(process.logger.error).toHaveBeenCalled()
  })

  it('should return the error code when getting Auth Config is unsuccessful', async () => {
    jest
      .spyOn(configUtils, 'getAuthConfig')
      .mockImplementation(() => Promise.reject(new Error('Test Error')))

    const returnCode = await executeCommandWrapper([jobPath])

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(process.logger.error).toHaveBeenCalled()
  })

  it('should log the error and return the error code when execution is unsuccessful', async () => {
    jest
      .spyOn(executeModule, 'execute')
      .mockImplementation(() => Promise.reject(new Error('Test Error')))

    const returnCode = await executeCommandWrapper([jobPath])

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(process.logger.error).toHaveBeenCalled()
  })
})

const setupMocks = () => {
  jest.resetAllMocks()
  jest.mock('../execute')
  jest.mock('../../../utils/config')
  jest
    .spyOn(executeModule, 'execute')
    .mockImplementation(() => Promise.resolve())

  jest
    .spyOn(configUtils, 'findTargetInConfiguration')
    .mockImplementation(() => Promise.resolve({ target, isLocal: true }))

  jest
    .spyOn(configUtils, 'getAuthConfig')
    .mockImplementation(() => Promise.resolve(authConfig as AuthConfig))

  process.logger = new Logger(LogLevel.Off)
  jest.spyOn(process.logger, 'error')
}

interface executeWrapperParams {
  jobPath: string
  waitForJob?: boolean
  output?: string | boolean
  logFile?: string
  statusFile?: string
  returnStatusOnly?: boolean
  ignoreWarnings?: boolean
  source?: string
  streamLog?: boolean
}

const executeCalledWith = ({
  jobPath,
  waitForJob = false,
  output = false,
  logFile = undefined,
  statusFile = undefined,
  returnStatusOnly = false,
  ignoreWarnings = false,
  source = undefined,
  streamLog = false
}: executeWrapperParams) => [
  expect.anything(),
  authConfig,
  jobPath,
  target,
  waitForJob,
  output,
  logFile,
  statusFile,
  returnStatusOnly,
  ignoreWarnings,
  source,
  streamLog
]

const executeCommandWrapper = async (
  additionalParams: string[],
  checkTarget = true
) => {
  const args = [...defaultArgs, ...additionalParams]

  const command = new JobCommand(args)
  const returnCode = await command.execute()

  expect(command.name).toEqual('job')
  expect(command.subCommand).toEqual('execute')

  if (checkTarget) {
    const targetInfo = await command.getTargetInfo()
    expect(targetInfo.target).toEqual(target)
    expect(targetInfo.isLocal).toBeTrue()
  }

  return returnCode
}

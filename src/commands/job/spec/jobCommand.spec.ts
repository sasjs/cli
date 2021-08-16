import path from 'path'
import * as executeModule from '../execute'
import { JobCommand } from '../jobCommand'
import { AuthConfig, Logger, LogLevel, ServerType, Target } from '@sasjs/utils'
import * as configUtils from '../../../utils/config'
import { ReturnCode } from '../../../types/command'

const defaultArgs = ['node', 'sasjs']
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
    const args = [...defaultArgs, 'job', 'execute', jobPath]

    const command = new JobCommand(args)
    await command.execute()
    const targetInfo = await command.getTargetInfo()

    expect(command.name).toEqual('job')
    expect(command.subCommand).toEqual('execute')
    expect(targetInfo.target).toEqual(target)
    expect(targetInfo.isLocal).toBeTrue()

    expect(executeModule.execute).toHaveBeenCalledWith(
      ...executeCalledWith({ jobPath })
    )
  })

  it('should pass wait as true if log flag with value is present', async () => {
    const args = [...defaultArgs, 'job', 'execute', jobPath, '--log', log]

    const command = new JobCommand(args)
    await command.execute()
    const targetInfo = await command.getTargetInfo()

    expect(command.name).toEqual('job')
    expect(command.subCommand).toEqual('execute')
    expect(targetInfo.target).toEqual(target)
    expect(targetInfo.isLocal).toBeTrue()

    expect(executeModule.execute).toHaveBeenCalledWith(
      ...executeCalledWith({
        jobPath,
        waitForJob: true,
        logFile: path.join(projectFolder, log)
      })
    )
  })

  it('should pass path for log file and wait to true if log flag without value is present', async () => {
    const args = [...defaultArgs, 'job', 'execute', jobPath, '--log']

    const command = new JobCommand(args)
    await command.execute()
    const targetInfo = await command.getTargetInfo()

    expect(command.name).toEqual('job')
    expect(command.subCommand).toEqual('execute')
    expect(targetInfo.target).toEqual(target)
    expect(targetInfo.isLocal).toBeTrue()

    expect(executeModule.execute).toHaveBeenCalledWith(
      ...executeCalledWith({
        jobPath,
        waitForJob: true,
        logFile: path.join(process.projectDir, `${jobFileName}.log`)
      })
    )
  })

  it('should pass wait as true if returnStatusOnly flag is present', async () => {
    const args = [
      ...defaultArgs,
      'job',
      'execute',
      jobPath,
      '--returnStatusOnly'
    ]

    const command = new JobCommand(args)
    await command.execute()
    const targetInfo = await command.getTargetInfo()

    expect(command.name).toEqual('job')
    expect(command.subCommand).toEqual('execute')
    expect(targetInfo.target).toEqual(target)
    expect(targetInfo.isLocal).toBeTrue()

    expect(executeModule.execute).toHaveBeenCalledWith(
      ...executeCalledWith({
        jobPath,
        waitForJob: true,
        returnStatusOnly: true
      })
    )
  })

  it('should parse sasjs job execute command with all arguments', async () => {
    const args = [
      ...defaultArgs,
      'job',
      'execute',
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
    ]

    const command = new JobCommand(args)
    await command.execute()
    const targetInfo = await command.getTargetInfo()

    expect(command.name).toEqual('job')
    expect(command.subCommand).toEqual('execute')
    expect(targetInfo.target).toEqual(target)
    expect(targetInfo.isLocal).toBeTrue()

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
    const args = [
      ...defaultArgs,
      'job',
      'execute',
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
    ]

    const command = new JobCommand(args)
    await command.execute()
    const targetInfo = await command.getTargetInfo()

    expect(command.name).toEqual('job')
    expect(command.subCommand).toEqual('execute')
    expect(targetInfo.target).toEqual(target)
    expect(targetInfo.isLocal).toBeTrue()

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
    const args = [...defaultArgs, 'job', 'execute', jobPath]

    const command = new JobCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.Success)
  })

  it('should return the error code when target is not SASVIYA', async () => {
    const args = [...defaultArgs, 'job', 'execute', jobPath]

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

    const command = new JobCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(process.logger.error).toHaveBeenCalled()
  })

  it('should return the error code when getting Auth Config is unsuccessful', async () => {
    const args = [...defaultArgs, 'job', 'execute', jobPath]

    jest
      .spyOn(configUtils, 'getAuthConfig')
      .mockImplementation(() => Promise.reject(new Error('Test Error')))

    const command = new JobCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(process.logger.error).toHaveBeenCalled()
  })

  it('should log the error and return the error code when execution is unsuccessful', async () => {
    const args = [...defaultArgs, 'job', 'execute', jobPath]
    jest
      .spyOn(executeModule, 'execute')
      .mockImplementation(() => Promise.reject(new Error('Test Error')))

    const command = new JobCommand(args)
    const returnCode = await command.execute()

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

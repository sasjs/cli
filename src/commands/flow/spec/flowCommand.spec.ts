import * as executeModule from '../execute'
import { FlowCommand } from '../flowCommand'
import { AuthConfig, Logger, LogLevel, ServerType, Target } from '@sasjs/utils'
import * as configUtils from '../../../utils/config'
import * as setConstantsUtils from '../../../utils/setConstants'
import { ReturnCode } from '../../../types/command'

const defaultArgs = ['node', 'sasjs']
const target = new Target({
  name: 'test',
  appLoc: '/Public/test/',
  serverType: ServerType.SasViya,
  contextName: 'test context'
})
const authConfig = {}
const source = 'path/to/json'
const logFolder = 'path/to/logs/folder'
const csvFile = 'path/to/csv/file'
describe('FlowCommand', () => {
  beforeEach(() => {
    setupMocks()
  })

  it('should parse sasjs flow execute command', async () => {
    const args = [...defaultArgs, 'flow', 'execute', '--source', source]

    const command = new FlowCommand(args)
    await command.execute()
    const targetInfo = await command.getTargetInfo()

    expect(command.name).toEqual('flow')
    expect(command.subCommand).toEqual('execute')
    expect(targetInfo.target).toEqual(target)
    expect(targetInfo.isLocal).toBeTrue()

    expect(executeModule.execute).toHaveBeenCalledWith(
      target,
      expect.anything(),
      authConfig,
      source,
      undefined,
      undefined,
      undefined
    )
  })

  it('should parse sasjs flow execute command with all arguments', async () => {
    const args = [
      ...defaultArgs,
      'flow',
      'execute',
      '--target',
      'test',
      '--source',
      source,
      '--logFolder',
      logFolder,
      '--csvFile',
      csvFile,
      '--streamLog'
    ]

    const command = new FlowCommand(args)
    await command.execute()
    const targetInfo = await command.getTargetInfo()

    expect(command.name).toEqual('flow')
    expect(command.subCommand).toEqual('execute')
    expect(targetInfo.target).toEqual(target)
    expect(targetInfo.isLocal).toBeTrue()

    expect(executeModule.execute).toHaveBeenCalledWith(
      target,
      expect.anything(),
      authConfig,
      source,
      logFolder,
      csvFile,
      true
    )
  })

  it('should parse a sasjs flow execute command with all shorthand arguments', async () => {
    const args = [
      ...defaultArgs,
      'flow',
      'execute',
      '-t',
      'test',
      '-s',
      source,
      '-l',
      logFolder,
      '-c',
      csvFile,
      '--streamLog'
    ]

    const command = new FlowCommand(args)
    await command.execute()
    const targetInfo = await command.getTargetInfo()

    expect(command.name).toEqual('flow')
    expect(command.subCommand).toEqual('execute')
    expect(targetInfo.target).toEqual(target)
    expect(targetInfo.isLocal).toBeTrue()

    expect(executeModule.execute).toHaveBeenCalledWith(
      target,
      expect.anything(),
      authConfig,
      source,
      logFolder,
      csvFile,
      true
    )
  })

  it('should log success and return the success code when execution is successful', async () => {
    const args = [...defaultArgs, 'flow', 'execute', '--source', source]

    const command = new FlowCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.Success)
  })

  it('should log the error and return the error code when execution is unsuccessful', async () => {
    const args = [...defaultArgs, 'flow', 'execute', '--source', source]
    jest
      .spyOn(executeModule, 'execute')
      .mockImplementation(() => Promise.reject(new Error('Test Error')))

    const command = new FlowCommand(args)
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
    .mockImplementation(() => Promise.resolve(csvFile))

  jest
    .spyOn(configUtils, 'findTargetInConfiguration')
    .mockImplementation(() => Promise.resolve({ target, isLocal: true }))

  jest
    .spyOn(configUtils, 'getLocalConfig')
    .mockImplementation(() => Promise.resolve({}))

  jest
    .spyOn(setConstantsUtils, 'setConstants')
    .mockImplementation(() => Promise.resolve())

  jest
    .spyOn(configUtils, 'getAuthConfig')
    .mockImplementation(() => Promise.resolve(authConfig as AuthConfig))

  process.logger = new Logger(LogLevel.Off)
  jest.spyOn(process.logger, 'error')
}

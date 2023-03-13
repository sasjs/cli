import * as buildModule from '../build'
import { BuildCommand } from '../buildCommand'
import { Logger, LogLevel, ServerType, Target } from '@sasjs/utils'
import * as configUtils from '../../../utils/config'
import * as setConstantsUtils from '../../../utils/setConstants'
import { ReturnCode } from '../../../types/command'
import { setConstants } from '../../../utils'

const defaultArgs = ['node', 'sasjs']
const target = new Target({
  name: 'test',
  appLoc: '/Public/test/',
  serverType: ServerType.SasViya,
  contextName: 'test context'
})

describe('BuildCommand', () => {
  beforeAll(async () => {
    await setConstants(false)
  })
  beforeEach(() => {
    setupMocks()
  })

  it('should parse a simple sasjs build command', () => {
    const args = [...defaultArgs, 'build']

    const command = new BuildCommand(args)

    expect(command.name).toEqual('build')
    expect(command.subCommand).toEqual('')
  })

  it('should parse a shorthand sasjs build command', () => {
    const args = [...defaultArgs, 'b']

    const command = new BuildCommand(args)

    expect(command.name).toEqual('build')
    expect(command.subCommand).toEqual('')
  })

  it('should parse a sasjs build command with a target', () => {
    const args = [...defaultArgs, 'build', '--target', 'test']

    const command = new BuildCommand(args)

    expect(command.name).toEqual('build')
    expect(command.subCommand).toEqual('')
  })

  it('should parse a sasjs build command with a shorthand target argument', () => {
    const args = [...defaultArgs, 'build', '-t', 'test']

    const command = new BuildCommand(args)

    expect(command.name).toEqual('build')
    expect(command.subCommand).toEqual('')
  })

  it('should call the build handler when executed with the correct target', async () => {
    const args = [...defaultArgs, 'build', '-t', 'test']

    const command = new BuildCommand(args)
    await command.execute()

    expect(buildModule.build).toHaveBeenCalledWith(target)
  })

  it('should log success and return the success code when execution is successful', async () => {
    const args = [...defaultArgs, 'build', '-t', 'test']

    const command = new BuildCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.Success)
    expect(process.logger.success).toHaveBeenCalled()
  })

  it('should log the error and return the error code when execution is unsuccessful', async () => {
    const args = [...defaultArgs, 'build', '-t', 'test']
    jest
      .spyOn(buildModule, 'build')
      .mockImplementation(() => Promise.reject(new Error('Test Error')))

    const command = new BuildCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(process.logger.error).toHaveBeenCalled()
  })
})

const setupMocks = () => {
  jest.resetAllMocks()
  jest.mock('../build')
  jest.mock('../../../utils/config')
  jest.spyOn(buildModule, 'build').mockImplementation(() => Promise.resolve())

  jest
    .spyOn(configUtils, 'findTargetInConfiguration')
    .mockImplementation(() => Promise.resolve({ target, isLocal: true }))

  jest
    .spyOn(configUtils, 'getLocalConfig')
    .mockImplementation(() => Promise.resolve({}))

  jest
    .spyOn(setConstantsUtils, 'setConstants')
    .mockImplementation(() => Promise.resolve())

  process.logger = new Logger(LogLevel.Off)
  jest.spyOn(process.logger, 'success')
  jest.spyOn(process.logger, 'error')
}

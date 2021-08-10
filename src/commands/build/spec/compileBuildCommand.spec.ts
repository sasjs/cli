import * as buildModule from '../build'
import * as compileModule from '../../compile/compile'
import { CompileBuildCommand } from '../compileBuildCommand'
import { Logger, LogLevel, ServerType, Target } from '@sasjs/utils'
import * as configUtils from '../../../utils/config'
import { ReturnCode } from '../../../types/command'
import { setConstants } from '../../../utils'

describe('CompileBuildCommand', () => {
  const defaultArgs = ['node', 'sasjs']
  const target = new Target({
    name: 'test',
    appLoc: '/Public/test/',
    serverType: ServerType.SasViya,
    contextName: 'test context'
  })

  beforeAll(async () => {
    await setConstants()
  })

  beforeEach(() => {
    jest.resetAllMocks()
    jest.mock('../build')
    jest.mock('../../compile/compile')
    jest.mock('../../../utils/config')
    jest.spyOn(buildModule, 'build').mockImplementation(() => Promise.resolve())
    jest
      .spyOn(compileModule, 'compile')
      .mockImplementation(() => Promise.resolve())

    jest
      .spyOn(configUtils, 'findTargetInConfiguration')
      .mockImplementation(() => Promise.resolve({ target, isLocal: true }))

    process.logger = new Logger(LogLevel.Off)
    jest.spyOn(process.logger, 'success')
    jest.spyOn(process.logger, 'error')
  })

  it('should parse a simple sasjs compilebuild command', () => {
    const args = [...defaultArgs, 'compilebuild']

    const command = new CompileBuildCommand(args)

    expect(command.name).toEqual('compilebuild')
    expect(command.subCommand).toEqual('')
  })

  it('should parse a shorthand sasjs compilebuild command', () => {
    const args = [...defaultArgs, 'cb']

    const command = new CompileBuildCommand(args)

    expect(command.name).toEqual('compilebuild')
    expect(command.subCommand).toEqual('')
  })

  it('should parse a sasjs compilebuild command with a target', () => {
    const args = [...defaultArgs, 'compilebuild', '--target', 'test']

    const command = new CompileBuildCommand(args)

    expect(command.name).toEqual('compilebuild')
    expect(command.subCommand).toEqual('')
  })

  it('should parse a sasjs build command with a shorthand target argument', () => {
    const args = [...defaultArgs, 'cb', '-t', 'test']

    const command = new CompileBuildCommand(args)

    expect(command.name).toEqual('compilebuild')
    expect(command.subCommand).toEqual('')
  })

  it('should call the compile and build handlers when executed with the correct target', async () => {
    const args = [...defaultArgs, 'cb', '-t', 'test']

    const command = new CompileBuildCommand(args)
    await command.execute()

    expect(compileModule.compile).toHaveBeenCalledWith(target, true)
    expect(buildModule.build).toHaveBeenCalledWith(target)
  })

  it('should log success and return the success code when execution is successful', async () => {
    const args = [...defaultArgs, 'cb', '-t', 'test']

    const command = new CompileBuildCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.Success)
    expect(process.logger.success).toHaveBeenCalled()
  })

  it('should log the error and return the error code when compile is unsuccessful', async () => {
    const args = [...defaultArgs, 'cb', '-t', 'test']
    jest
      .spyOn(compileModule, 'compile')
      .mockImplementation(() => Promise.reject(new Error('Test Error')))

    const command = new CompileBuildCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(process.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error compiling project'),
      new Error('Test Error')
    )
  })

  it('should log the error and return the error code when build is unsuccessful', async () => {
    const args = [...defaultArgs, 'compilebuild', '-t', 'test']
    jest
      .spyOn(buildModule, 'build')
      .mockImplementation(() => Promise.reject(new Error('Test Error')))

    const command = new CompileBuildCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(process.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error building project'),
      new Error('Test Error')
    )
  })
})

import * as compileModule from '../compile'
import { CompileCommand } from '../compileCommand'
import { Logger, LogLevel, ServerType, Target } from '@sasjs/utils'
import * as configUtils from '../../../utils/config'
import { ReturnCode } from '../../../types/command'

describe('CompileCommand', () => {
  const defaultArgs = ['node', 'sasjs']
  const target = new Target({
    name: 'test',
    appLoc: '/Public/test/',
    serverType: ServerType.SasViya,
    contextName: 'test context'
  })

  beforeEach(() => {
    jest.resetAllMocks()
    jest.mock('../compile')
    jest.mock('../../../utils/config')
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

  it('should parse a simple sasjs compile command', () => {
    const args = [...defaultArgs, 'compile']

    const command = new CompileCommand(args)

    expect(command.name).toEqual('compile')
    expect(command.subCommand).toEqual('')
  })

  it('should parse a shorthand sasjs compile command', () => {
    const args = [...defaultArgs, 'c']

    const command = new CompileCommand(args)

    expect(command.name).toEqual('compile')
    expect(command.subCommand).toEqual('')
  })

  it('should parse a sasjs compile command with a target', async () => {
    const args = [...defaultArgs, 'compile', '--target', 'test']

    const command = new CompileCommand(args)
    const targetInfo = await command.target

    expect(command.name).toEqual('compile')
    expect(command.subCommand).toEqual('')
    expect(targetInfo.target).toEqual(target)
    expect(targetInfo.isLocal).toBeTrue()
  })

  it('should parse a sasjs compile command with a shorthand target argument', async () => {
    const args = [...defaultArgs, 'compile', '-t', 'test']

    const command = new CompileCommand(args)
    const targetInfo = await command.target

    expect(command.name).toEqual('compile')
    expect(command.subCommand).toEqual('')
    expect(targetInfo.target).toEqual(target)
    expect(targetInfo.isLocal).toBeTrue()
  })

  it('should call the compile handler when executed with the correct target', async () => {
    const args = [...defaultArgs, 'compile', '-t', 'test']

    const command = new CompileCommand(args)
    await command.execute()

    expect(compileModule.compile).toHaveBeenCalledWith(target, true)
  })

  it('should log success and return the success code when execution is successful', async () => {
    const args = [...defaultArgs, 'compile', '-t', 'test']

    const command = new CompileCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.Success)
    expect(process.logger.success).toHaveBeenCalled()
  })

  it('should log the error and return the error code when execution is unsuccessful', async () => {
    const args = [...defaultArgs, 'compile', '-t', 'test']
    jest
      .spyOn(compileModule, 'compile')
      .mockImplementation(() => Promise.reject(new Error('Test Error')))

    const command = new CompileCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(process.logger.error).toHaveBeenCalled()
  })
})

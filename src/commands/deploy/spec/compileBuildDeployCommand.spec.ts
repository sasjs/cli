import * as buildModule from '../../build/build'
import * as compileModule from '../../compile/compile'
import * as deployModule from '../deploy'
import { CompileBuildDeployCommand } from '../compileBuildDeployCommand'
import { Logger, LogLevel, ServerType, Target } from '@sasjs/utils'
import * as configUtils from '../../../utils/config'
import { ReturnCode } from '../../../types/command'

describe('CompileBuildDeployCommand', () => {
  const defaultArgs = ['node', 'sasjs']
  const target = new Target({
    name: 'test',
    appLoc: '/Public/test/',
    serverType: ServerType.SasViya,
    contextName: 'test context'
  })

  beforeEach(() => {
    jest.resetAllMocks()
    jest.mock('../../compile/compile')
    jest.mock('../../build/build')
    jest.mock('../deploy')
    jest.mock('../../../utils/config')
    jest
      .spyOn(compileModule, 'compile')
      .mockImplementation(() => Promise.resolve())
    jest.spyOn(buildModule, 'build').mockImplementation(() => Promise.resolve())
    jest
      .spyOn(deployModule, 'deploy')
      .mockImplementation(() => Promise.resolve())

    jest
      .spyOn(configUtils, 'findTargetInConfiguration')
      .mockImplementation(() => Promise.resolve({ target, isLocal: true }))

    process.logger = new Logger(LogLevel.Off)
    jest.spyOn(process.logger, 'success')
    jest.spyOn(process.logger, 'error')
  })

  it('should parse a simple sasjs compilebuilddeploy command', () => {
    const args = [...defaultArgs, 'compilebuilddeploy']

    const command = new CompileBuildDeployCommand(args)

    expect(command.name).toEqual('compilebuilddeploy')
    expect(command.subCommand).toEqual('')
  })

  it('should parse a shorthand sasjs compilebuilddeploy command', () => {
    const args = [...defaultArgs, 'cbd']

    const command = new CompileBuildDeployCommand(args)

    expect(command.name).toEqual('compilebuilddeploy')
    expect(command.subCommand).toEqual('')
  })

  it('should parse a sasjs compilebuilddeploy command with a target', () => {
    const args = [...defaultArgs, 'compilebuilddeploy', '--target', 'test']

    const command = new CompileBuildDeployCommand(args)

    expect(command.name).toEqual('compilebuilddeploy')
    expect(command.subCommand).toEqual('')
  })

  it('should parse a sasjs compilebuild command with a shorthand target argument', () => {
    const args = [...defaultArgs, 'cbd', '-t', 'test']

    const command = new CompileBuildDeployCommand(args)

    expect(command.name).toEqual('compilebuilddeploy')
    expect(command.subCommand).toEqual('')
  })

  it('should call the compile, build and deploy handlers when executed with the correct target', async () => {
    const args = [...defaultArgs, 'cbd', '-t', 'test']

    const command = new CompileBuildDeployCommand(args)
    await command.execute()

    expect(compileModule.compile).toHaveBeenCalledWith(target, true)
    expect(buildModule.build).toHaveBeenCalledWith(target)
    expect(deployModule.deploy).toHaveBeenCalledWith(target, true)
  })

  it('should log success and return the success code when execution is successful', async () => {
    const args = [...defaultArgs, 'cbd', '-t', 'test']

    const command = new CompileBuildDeployCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.Success)
    expect(process.logger.success).toHaveBeenCalled()
  })

  it('should log the error and return the error code when compile is unsuccessful', async () => {
    const args = [...defaultArgs, 'cbd', '-t', 'test']
    jest
      .spyOn(compileModule, 'compile')
      .mockImplementation(() => Promise.reject(new Error('Test Error')))

    const command = new CompileBuildDeployCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(process.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error compiling project'),
      new Error('Test Error')
    )
  })

  it('should log the error and return the error code when build is unsuccessful', async () => {
    const args = [...defaultArgs, 'compilebuilddeploy', '-t', 'test']
    jest
      .spyOn(buildModule, 'build')
      .mockImplementation(() => Promise.reject(new Error('Test Error')))

    const command = new CompileBuildDeployCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(process.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error building project'),
      new Error('Test Error')
    )
  })

  it('should log the error and return the error code when deploy is unsuccessful', async () => {
    const args = [...defaultArgs, 'compilebuilddeploy', '-t', 'test']
    jest
      .spyOn(deployModule, 'deploy')
      .mockImplementation(() => Promise.reject(new Error('Test Error')))

    const command = new CompileBuildDeployCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(process.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error deploying project'),
      new Error('Test Error')
    )
  })
})

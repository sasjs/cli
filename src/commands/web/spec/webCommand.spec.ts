import * as webModule from '../web'
import { WebCommand } from '../webCommand'
import { Logger, LogLevel, ServerType, Target } from '@sasjs/utils'
import * as configUtils from '../../../utils/config'
import { ReturnCode } from '../../../types/command'

describe('WbCommand', () => {
  const defaultArgs = ['node', 'sasjs']
  const target = new Target({
    name: 'test',
    appLoc: '/Public/test/',
    serverType: ServerType.SasViya,
    contextName: 'test context'
  })

  beforeEach(() => {
    jest.resetAllMocks()
    jest.mock('../web')
    jest.mock('../../../utils/config')
    jest
      .spyOn(webModule, 'createWebAppServices')
      .mockImplementation(() => Promise.resolve())

    jest
      .spyOn(configUtils, 'findTargetInConfiguration')
      .mockImplementation(() => Promise.resolve({ target, isLocal: true }))

    process.logger = new Logger(LogLevel.Off)
    jest.spyOn(process.logger, 'success')
    jest.spyOn(process.logger, 'error')
  })

  it('should parse a simple sasjs web command', () => {
    const args = [...defaultArgs, 'web']

    const command = new WebCommand(args)

    expect(command.name).toEqual('web')
    expect(command.subCommand).toEqual('')
  })

  it('should parse a shorthand sasjs web command', () => {
    const args = [...defaultArgs, 'w']

    const command = new WebCommand(args)

    expect(command.name).toEqual('web')
    expect(command.subCommand).toEqual('')
  })

  it('should parse a sasjs web command with a target', async () => {
    const args = [...defaultArgs, 'web', '--target', 'test']

    const command = new WebCommand(args)
    const targetInfo = await command.getTargetInfo()

    expect(command.name).toEqual('web')
    expect(command.subCommand).toEqual('')
    expect(targetInfo.target).toEqual(target)
    expect(targetInfo.isLocal).toBeTrue()
  })

  it('should parse a sasjs web command with a shorthand target argument', async () => {
    const args = [...defaultArgs, 'web', '-t', 'test']

    const command = new WebCommand(args)
    const targetInfo = await command.getTargetInfo()

    expect(command.name).toEqual('web')
    expect(command.subCommand).toEqual('')
    expect(targetInfo.target).toEqual(target)
    expect(targetInfo.isLocal).toBeTrue()
  })

  it('should call the web handler when executed with the correct target', async () => {
    const args = [...defaultArgs, 'web', '-t', 'test']

    const command = new WebCommand(args)
    await command.execute()

    expect(webModule.createWebAppServices).toHaveBeenCalledWith(target)
  })

  it('should log success and return the success code when execution is successful', async () => {
    const args = [...defaultArgs, 'web', '-t', 'test']

    const command = new WebCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.Success)
    expect(process.logger.success).toHaveBeenCalled()
  })

  it('should log the error and return the error code when execution is unsuccessful', async () => {
    const args = [...defaultArgs, 'web', '-t', 'test']
    jest
      .spyOn(webModule, 'createWebAppServices')
      .mockImplementation(() => Promise.reject(new Error('Test Error')))

    const command = new WebCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(process.logger.error).toHaveBeenCalled()
  })
})

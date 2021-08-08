import * as addCredentialModule from '../addCredential'
import { AddCredentialCommand } from '../addCredentialCommand'
import { Logger, LogLevel, ServerType, Target } from '@sasjs/utils'
import * as configUtils from '../../../utils/config'
import { TargetScope } from '../../../types'
import { ReturnCode } from '../../../types/command'

describe('AddCredentialCommand', () => {
  const defaultArgs = ['node', 'sasjs']
  const target = new Target({
    name: 'test',
    appLoc: '/Public/test/',
    serverType: ServerType.SasViya,
    contextName: 'test context'
  })

  beforeEach(() => {
    process.logger = new Logger(LogLevel.Off)
    jest.resetAllMocks()
    jest.mock('../addCredential')
    jest.mock('../../../utils/config')
    jest
      .spyOn(addCredentialModule, 'addCredential')
      .mockImplementation(() => Promise.resolve())

    jest
      .spyOn(configUtils, 'findTargetInConfiguration')
      .mockImplementation(() => Promise.resolve({ target, isLocal: true }))
    jest.spyOn(process.logger, 'success')
    jest.spyOn(process.logger, 'error')
  })

  it('should parse a simple sasjs add cred command', () => {
    const args = [...defaultArgs, 'add', 'cred']

    const command = new AddCredentialCommand(args)

    expect(command.name).toEqual('add')
    expect(command.subCommand).toEqual('cred')
    expect(command.insecure).toEqual(false)
  })

  it('should parse a sasjs add cred command with the insecure flag', () => {
    const args = [...defaultArgs, 'add', 'cred', '--insecure']

    const command = new AddCredentialCommand(args)

    expect(command.name).toEqual('add')
    expect(command.subCommand).toEqual('cred')
    expect(command.insecure).toEqual(true)
  })

  it('should parse a sasjs add cred command with the shorthand insecure flag', () => {
    const args = [...defaultArgs, 'add', 'cred', '-i']

    const command = new AddCredentialCommand(args)

    expect(command.name).toEqual('add')
    expect(command.subCommand).toEqual('cred')
    expect(command.insecure).toEqual(true)
  })

  it('should parse a sasjs add cred command invoked with the alias sasjs auth', () => {
    const args = [...defaultArgs, 'auth', '-i']

    const command = new AddCredentialCommand(args)

    expect(command.name).toEqual('add cred')
    expect(command.insecure).toEqual(true)
  })

  it('should call the addCredential handler when executed without the insecure option', async () => {
    const args = [...defaultArgs, 'add', 'cred', '-t', 'test']

    const command = new AddCredentialCommand(args)
    await command.execute()

    expect(addCredentialModule.addCredential).toHaveBeenCalledWith(
      target,
      false,
      TargetScope.Local
    )
  })

  it('should log success and return the success code when execution was successful', async () => {
    const args = [...defaultArgs, 'add', 'cred', '-t', 'test']

    const command = new AddCredentialCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.Success)
    expect(process.logger.success).toHaveBeenCalledWith(
      'Credentials successfully added!'
    )
  })

  it('should return the error code when execution was unsuccessful', async () => {
    const args = [...defaultArgs, 'add', 'cred', '-t', 'test']
    jest
      .spyOn(addCredentialModule, 'addCredential')
      .mockImplementation(() => Promise.reject(new Error('Test Error')))

    const command = new AddCredentialCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(process.logger.error).toHaveBeenCalledWith(
      'Error adding credentials: ',
      new Error('Test Error')
    )
  })

  it('should call the addCredential handler when executed with the insecure option', async () => {
    const args = [...defaultArgs, 'add', 'cred', '-t', 'test', '--insecure']

    const command = new AddCredentialCommand(args)
    await command.execute()

    expect(addCredentialModule.addCredential).toHaveBeenCalledWith(
      target,
      true,
      TargetScope.Local
    )
  })

  it('should call the addCredential handler when executed with the correct target scope', async () => {
    const args = [...defaultArgs, 'add', 'cred', '-t', 'test', '--insecure']
    jest
      .spyOn(configUtils, 'findTargetInConfiguration')
      .mockImplementation(() => Promise.resolve({ target, isLocal: false }))

    const command = new AddCredentialCommand(args)
    await command.execute()

    expect(addCredentialModule.addCredential).toHaveBeenCalledWith(
      target,
      true,
      TargetScope.Global
    )
  })

  it('should return the cached target when available', async () => {
    const args = [...defaultArgs, 'add', 'cred', '-t', 'test']

    const command = new AddCredentialCommand(args)
    let targetInfo = await command.getTargetInfo()
    targetInfo = await command.getTargetInfo()

    expect(configUtils.findTargetInConfiguration).toHaveBeenCalledWith('test')
    expect(configUtils.findTargetInConfiguration).toHaveBeenCalledTimes(1)
  })
})

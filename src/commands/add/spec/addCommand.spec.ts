import { AddCommand } from '../addCommand'
import * as addTargetModule from '../addTarget'
import * as addCredentialModule from '../addCredential'
import * as configUtils from '../../../utils/config'
import { Logger, LogLevel, ServerType, Target } from '@sasjs/utils'
import { TargetScope } from '../../../types'
import { ReturnCode } from '../../../types/command'

describe('AddCommand', () => {
  const defaultArgs = ['node', 'sasjs']

  beforeEach(() => {
    jest.resetAllMocks()
    jest.mock('../addTarget')
    jest
      .spyOn(addTargetModule, 'addTarget')
      .mockImplementation(() => Promise.resolve(true))
  })

  it('should parse a simple sasjs add command', () => {
    const args = [...defaultArgs, 'add']

    const command = new AddCommand(args)

    expect(command.name).toEqual('add')
    expect(command.insecure).toEqual(false)
  })

  it('should parse a sasjs add command with the insecure flag', () => {
    const args = [...defaultArgs, 'add', '--insecure']

    const command = new AddCommand(args)

    expect(command.name).toEqual('add')
    expect(command.insecure).toEqual(true)
  })

  it('should parse a sasjs add command with the shorthand insecure flag', () => {
    const args = [...defaultArgs, 'add', '-i']

    const command = new AddCommand(args)

    expect(command.name).toEqual('add')
    expect(command.insecure).toEqual(true)
  })

  it('should call the addTarget handler when executed with the insecure option', async () => {
    const args = [...defaultArgs, 'add', '-i']

    const command = new AddCommand(args)
    await command.execute()

    expect(addTargetModule.addTarget).toHaveBeenCalledWith(true)
  })

  it('should call the addTarget handler when executed without the insecure option', async () => {
    const args = [...defaultArgs, 'add']

    const command = new AddCommand(args)
    await command.execute()

    expect(addTargetModule.addTarget).toHaveBeenCalledWith(false)
  })
})

describe('AddCommand - cred', () => {
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
      .mockImplementation(() => Promise.resolve(target))

    jest
      .spyOn(configUtils, 'findTargetInConfiguration')
      .mockImplementation(() => Promise.resolve({ target, isLocal: true }))
    jest.spyOn(process.logger, 'success')
    jest.spyOn(process.logger, 'error')
  })

  it('should parse a simple sasjs add cred command', () => {
    const args = [...defaultArgs, 'add', 'cred']

    const command = new AddCommand(args)

    expect(command.name).toEqual('add')
    expect(command.subCommand).toEqual('cred')
    expect(command.insecure).toEqual(false)
  })

  it('should parse a sasjs add cred command with the insecure flag', () => {
    const args = [...defaultArgs, 'add', 'cred', '--insecure']

    const command = new AddCommand(args)

    expect(command.name).toEqual('add')
    expect(command.subCommand).toEqual('cred')
    expect(command.insecure).toEqual(true)
  })

  it('should parse a sasjs add cred command with the shorthand insecure flag', () => {
    const args = [...defaultArgs, 'add', 'cred', '-i']

    const command = new AddCommand(args)

    expect(command.name).toEqual('add')
    expect(command.subCommand).toEqual('cred')
    expect(command.insecure).toEqual(true)
  })

  it('should parse a sasjs add cred command invoked with the alias sasjs auth', () => {
    const args = [...defaultArgs, 'auth', '-i']

    const command = new AddCommand(args)

    expect(command.name).toEqual('add')
    expect(command.insecure).toEqual(true)
  })

  it('should call the addCredential handler when executed with the alias sasjs auth', async () => {
    const args = [...defaultArgs, 'auth', '-t', 'test']

    const command = new AddCommand(args)
    await command.execute()

    expect(addCredentialModule.addCredential).toHaveBeenCalledWith(
      target,
      false,
      TargetScope.Local
    )
  })

  it('should call the addCredential handler when executed without the insecure option', async () => {
    const args = [...defaultArgs, 'add', 'cred', '-t', 'test']

    const command = new AddCommand(args)
    await command.execute()

    expect(addCredentialModule.addCredential).toHaveBeenCalledWith(
      target,
      false,
      TargetScope.Local
    )
  })

  it('should log success and return the success code when execution was successful', async () => {
    const args = [...defaultArgs, 'add', 'cred', '-t', 'test']

    const command = new AddCommand(args)
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

    const command = new AddCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(process.logger.error).toHaveBeenCalledWith(
      'Error adding credentials: ',
      new Error('Test Error')
    )
  })

  it('should call the addCredential handler when executed with the insecure option', async () => {
    const args = [...defaultArgs, 'add', 'cred', '-t', 'test', '--insecure']

    const command = new AddCommand(args)
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

    const command = new AddCommand(args)
    await command.execute()

    expect(addCredentialModule.addCredential).toHaveBeenCalledWith(
      target,
      true,
      TargetScope.Global
    )
  })

  it('should return the cached target when available', async () => {
    const args = [...defaultArgs, 'add', 'cred', '-t', 'test']

    const command = new AddCommand(args)
    let targetInfo = await command.getTargetInfo()
    targetInfo = await command.getTargetInfo()

    expect(configUtils.findTargetInConfiguration).toHaveBeenCalledWith('test')
    expect(configUtils.findTargetInConfiguration).toHaveBeenCalledTimes(1)
  })
})

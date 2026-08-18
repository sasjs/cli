import { AuthCommand } from '../authCommand'
import * as addCredentialModule from '../../add/addCredential'
import * as authLoginModule from '../login'
import * as configUtils from '../../../utils/config'
import * as setConstantsUtils from '../../../utils/setConstants'
import { Logger, LogLevel, ServerType, Target } from '@sasjs/utils'
import { TargetScope } from '../../../types'
import { ReturnCode } from '../../../types/command'

describe('AuthCommand', () => {
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
    jest.mock('../../add/addCredential')
    jest.mock('../../../utils/config')
    jest
      .spyOn(addCredentialModule, 'addCredential')
      .mockImplementation(() => Promise.resolve(target))

    jest
      .spyOn(configUtils, 'findTargetInConfiguration')
      .mockImplementation(() => Promise.resolve({ target, isLocal: true }))

    jest
      .spyOn(configUtils, 'getLocalConfig')
      .mockImplementation(() => Promise.resolve({}))

    jest
      .spyOn(setConstantsUtils, 'setConstants')
      .mockImplementation(() => Promise.resolve())

    jest.spyOn(process.logger, 'success')
    jest.spyOn(process.logger, 'error')
  })

  it('should parse a sasjs auth login command', () => {
    const args = [...defaultArgs, 'auth', 'login', '-t', 'test']

    const command = new AuthCommand(args)

    expect(command.name).toEqual('auth')
    expect(command.subCommand).toEqual('login')
  })

  it('should call the authLogin handler when executed with the login sub command', async () => {
    jest
      .spyOn(authLoginModule, 'authLogin')
      .mockImplementation(() => Promise.resolve())

    const args = [...defaultArgs, 'auth', 'login', '-t', 'test']

    const command = new AuthCommand(args)
    const returnCode = await command.execute()

    expect(authLoginModule.authLogin).toHaveBeenCalledWith(target, false, false)
    expect(returnCode).toEqual(ReturnCode.Success)
  })

  it('should pass the insecure flag to authLogin when --insecure is provided', async () => {
    jest
      .spyOn(authLoginModule, 'authLogin')
      .mockImplementation(() => Promise.resolve())

    const args = [...defaultArgs, 'auth', 'login', '-t', 'test', '--insecure']

    const command = new AuthCommand(args)
    const returnCode = await command.execute()

    expect(authLoginModule.authLogin).toHaveBeenCalledWith(target, true, false)
    expect(returnCode).toEqual(ReturnCode.Success)
  })

  it('should pass passwordStdin=true to authLogin when --password-stdin is provided', async () => {
    jest
      .spyOn(authLoginModule, 'authLogin')
      .mockImplementation(() => Promise.resolve())

    const args = [
      ...defaultArgs,
      'auth',
      'login',
      '-t',
      'test',
      '--password-stdin'
    ]

    const command = new AuthCommand(args)
    const returnCode = await command.execute()

    expect(authLoginModule.authLogin).toHaveBeenCalledWith(target, false, true)
    expect(returnCode).toEqual(ReturnCode.Success)
  })

  it('should pass both insecure and passwordStdin flags to authLogin', async () => {
    jest
      .spyOn(authLoginModule, 'authLogin')
      .mockImplementation(() => Promise.resolve())

    const args = [
      ...defaultArgs,
      'auth',
      'login',
      '-t',
      'test',
      '--insecure',
      '--password-stdin'
    ]

    const command = new AuthCommand(args)
    const returnCode = await command.execute()

    expect(authLoginModule.authLogin).toHaveBeenCalledWith(target, true, true)
    expect(returnCode).toEqual(ReturnCode.Success)
  })

  it('should return an error code when login fails', async () => {
    jest
      .spyOn(authLoginModule, 'authLogin')
      .mockImplementation(() => Promise.reject(new Error('Login failed')))

    const args = [...defaultArgs, 'auth', 'login', '-t', 'test']

    const command = new AuthCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(process.logger.error).toHaveBeenCalled()
  })

  it('should parse a bare sasjs auth command (legacy alias of sasjs add cred)', () => {
    const args = [...defaultArgs, 'auth', '-i']

    const command = new AuthCommand(args)

    expect(command.name).toEqual('auth')
    expect(command.insecure).toEqual(true)
  })

  it('should call the addCredential handler when executed without a sub command', async () => {
    const args = [...defaultArgs, 'auth', '-t', 'test']

    const command = new AuthCommand(args)
    await command.execute()

    expect(addCredentialModule.addCredential).toHaveBeenCalledWith(
      target,
      false,
      TargetScope.Local
    )
  })
})

import * as deployModule from '../deploy'
import { DeployCommand } from '../deployCommand'
import { Logger, LogLevel, ServerType, Target } from '@sasjs/utils'
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

describe('DeployCommand', () => {
  beforeEach(() => {
    setupMocks()
  })

  it('should parse a simple sasjs deploy command', () => {
    const args = [...defaultArgs, 'deploy']

    const command = new DeployCommand(args)

    expect(command.name).toEqual('deploy')
    expect(command.subCommand).toEqual('')
  })

  it('should parse a shorthand sasjs deploy command', () => {
    const args = [...defaultArgs, 'd']

    const command = new DeployCommand(args)

    expect(command.name).toEqual('deploy')
    expect(command.subCommand).toEqual('')
  })

  it('should parse a sasjs deploy command with a target', () => {
    const args = [...defaultArgs, 'deploy', '--target', 'test']

    const command = new DeployCommand(args)

    expect(command.name).toEqual('deploy')
    expect(command.subCommand).toEqual('')
  })

  it('should parse a sasjs deploy command with a shorthand target argument', () => {
    const args = [...defaultArgs, 'deploy', '-t', 'test']

    const command = new DeployCommand(args)

    expect(command.name).toEqual('deploy')
    expect(command.subCommand).toEqual('')
  })

  it('should call the deploy handler when executed with the correct target', async () => {
    const args = [...defaultArgs, 'deploy', '-t', 'test']

    const command = new DeployCommand(args)
    await command.execute()

    expect(deployModule.deploy).toHaveBeenCalledWith(target, true)
  })

  it('should log success and return the success code when execution is successful', async () => {
    const args = [...defaultArgs, 'deploy', '-t', 'test']

    const command = new DeployCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.Success)
    expect(process.logger.success).toHaveBeenCalled()
  })

  it('should log the error and return the error code when execution is unsuccessful', async () => {
    const args = [...defaultArgs, 'deploy', '-t', 'test']
    jest
      .spyOn(deployModule, 'deploy')
      .mockImplementation(() => Promise.reject(new Error('Test Error')))

    const command = new DeployCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(process.logger.error).toHaveBeenCalled()
  })
})

const setupMocks = () => {
  jest.resetAllMocks()
  jest.mock('../deploy')
  jest.mock('../../../utils/config')
  jest.spyOn(deployModule, 'deploy').mockImplementation(() => Promise.resolve())

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

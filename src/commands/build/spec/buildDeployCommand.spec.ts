import * as buildModule from '../../build/build'
import * as deployModule from '../../deploy/deploy'
import { BuildDeployCommand } from '../buildDeployCommand'
import { Logger, LogLevel, ServerType, Target } from '@sasjs/utils'
import * as configUtils from '../../../utils/config'
import * as setConstantsUtils from '../../../utils/setConstants'
import { setConstants } from '../../../utils'
import { ReturnCode } from '../../../types/command'

describe('BuildDeployCommand', () => {
  const defaultArgs = ['node', 'sasjs']
  const target = new Target({
    name: 'test',
    appLoc: '/Public/test/',
    serverType: ServerType.SasViya,
    contextName: 'test context'
  })

  beforeAll(async () => {
    await setConstants(false)
  })

  beforeEach(() => {
    jest.resetAllMocks()
    jest.mock('../../build/build')
    jest.mock('../../deploy/deploy')
    jest.mock('../../../utils/config')

    jest.spyOn(buildModule, 'build').mockImplementation(() => Promise.resolve())
    jest
      .spyOn(deployModule, 'deploy')
      .mockImplementation(() => Promise.resolve())

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
  })

  it('should parse a simple sasjs builddeploy command', () => {
    const args = [...defaultArgs, 'builddeploy']

    const command = new BuildDeployCommand(args)

    expect(command.name).toEqual('builddeploy')
    expect(command.subCommand).toEqual('')
  })

  it('should parse the bd shorthand', () => {
    const args = [...defaultArgs, 'bd']

    const command = new BuildDeployCommand(args)

    expect(command.name).toEqual('builddeploy')
    expect(command.subCommand).toEqual('')
  })

  it('should parse a sasjs builddeploy command with a target', () => {
    const args = [...defaultArgs, 'builddeploy', '--target', 'test']

    const command = new BuildDeployCommand(args)

    expect(command.name).toEqual('builddeploy')
    expect(command.subCommand).toEqual('')
  })

  it('should build and then deploy against the resolved target', async () => {
    const args = [...defaultArgs, 'bd', '-t', 'test']

    const command = new BuildDeployCommand(args)
    await command.execute()

    expect(buildModule.build).toHaveBeenCalledWith(target)
    expect(deployModule.deploy).toHaveBeenCalledWith(target, true)
  })

  it('should not deploy when the build fails', async () => {
    const args = [...defaultArgs, 'bd', '-t', 'test']
    jest
      .spyOn(buildModule, 'build')
      .mockImplementation(() => Promise.reject(new Error('Test Error')))

    const command = new BuildDeployCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(deployModule.deploy).not.toHaveBeenCalled()
    expect(process.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('An error has occurred when building services'),
      'Test Error'
    )
  })

  it('should return the success code when build and deploy succeed', async () => {
    const args = [...defaultArgs, 'builddeploy', '-t', 'test']

    const command = new BuildDeployCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.Success)
    expect(process.logger.success).toHaveBeenCalledWith(
      expect.stringContaining('Services have been successfully deployed')
    )
  })

  it('should log the error and return the error code when deploy is unsuccessful', async () => {
    const args = [...defaultArgs, 'builddeploy', '-t', 'test']
    jest
      .spyOn(deployModule, 'deploy')
      .mockImplementation(() => Promise.reject(new Error('Test Error')))

    const command = new BuildDeployCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(process.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('An error has occurred when deploying services')
    )
  })
})

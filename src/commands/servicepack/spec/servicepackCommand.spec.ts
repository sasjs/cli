import * as deployModule from '../deploy'
import { ServicePackCommand } from '../servicePackCommand'
import { Logger, LogLevel, ServerType, Target } from '@sasjs/utils'
import * as configUtils from '../../../utils/config'
import * as setConstantsUtils from '../../../utils/setConstants'
import { ReturnCode } from '../../../types/command'

const defaultArgs = ['node', 'sasjs', 'servicepack', 'deploy']
const target = new Target({
  name: 'test',
  appLoc: '/Public/test/',
  serverType: ServerType.SasViya,
  contextName: 'test context'
})
const source = 'path/to/json'
describe('ServicePackCommand', () => {
  beforeEach(() => {
    setupMocks()
  })

  it('should parse sasjs servicepack deploy command', async () => {
    await executeCommandWrapper(['--source', source])

    expect(deployModule.servicePackDeploy).toHaveBeenCalledWith(
      target,
      true,
      source,
      false
    )
  })

  it('should parse sasjs servicepack deploy command with all arguments', async () => {
    await executeCommandWrapper([
      '--target',
      'test',
      '--source',
      source,
      '--force'
    ])

    expect(deployModule.servicePackDeploy).toHaveBeenCalledWith(
      target,
      true,
      source,
      true
    )
  })

  it('should parse a sasjs servicepack deploy command with all shorthand arguments', async () => {
    await executeCommandWrapper(['-t', 'test', '-s', source, '-f'])

    expect(deployModule.servicePackDeploy).toHaveBeenCalledWith(
      target,
      true,
      source,
      true
    )
  })

  it('should log success and return the success code when execution is successful', async () => {
    const returnCode = await executeCommandWrapper(['--source', source])

    expect(returnCode).toEqual(ReturnCode.Success)
  })

  it('should log the error and return the error code when execution is unsuccessful', async () => {
    jest
      .spyOn(deployModule, 'servicePackDeploy')
      .mockImplementation(() => Promise.reject(new Error('Test Error')))

    const returnCode = await executeCommandWrapper(['--source', source])

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(process.logger.error).toHaveBeenCalled()
  })
})

const setupMocks = () => {
  jest.resetAllMocks()
  jest.mock('../deploy')
  jest.mock('../../../utils/config')
  jest
    .spyOn(deployModule, 'servicePackDeploy')
    .mockImplementation(() => Promise.resolve(undefined))

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
  jest.spyOn(process.logger, 'error')
}

const executeCommandWrapper = async (additionalParams: string[]) => {
  const args = [...defaultArgs, ...additionalParams]

  const command = new ServicePackCommand(args)
  const returnCode = await command.execute()
  const targetInfo = await command.getTargetInfo()

  expect(command.name).toEqual('servicepack')
  expect(command.subCommand).toEqual('deploy')
  expect(targetInfo.target).toEqual(target)
  expect(targetInfo.isLocal).toEqual(true)

  return returnCode
}

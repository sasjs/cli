import * as requestModule from '../request'
import { RequestCommand } from '../requestCommand'
import { AuthConfig, Logger, LogLevel, ServerType, Target } from '@sasjs/utils'
import * as configUtils from '../../../utils/config'
import { ReturnCode } from '../../../types/command'
import { setConstants } from '../../../utils'

const defaultArgs = ['node', 'sasjs']
const target = new Target({
  name: 'test',
  appLoc: '/Public/test/',
  serverType: ServerType.Sas9,
  contextName: 'test context'
})
const sasProgramPath = 'path/to/soure.sas'
const dataFilePath = 'path/to/data.json'
const configFilePath = 'path/to/config.json'
const outputPath = './output.txt'
const logPath = './log.txt'
describe('RequestCommand', () => {
  beforeAll(async () => {
    await setConstants()
  })

  beforeEach(() => {
    setupMocks()
  })

  it('should parse sasjs request command', async () => {
    const args = [...defaultArgs, 'request', sasProgramPath]

    const command = new RequestCommand(args)
    await command.execute()
    const targetInfo = await command.getTargetInfo()

    expect(command.name).toEqual('request')
    expect(targetInfo.target).toEqual(target)
    expect(targetInfo.isLocal).toBeTrue()

    expect(requestModule.runSasJob).toHaveBeenCalledWith(
      target,
      true,
      sasProgramPath,
      undefined,
      undefined,
      undefined,
      undefined,
      null,
      undefined
    )
  })

  it('should parse sasjs request command with SASVIYA', async () => {
    const mockAuthConfig: AuthConfig = {
      client: 'cl13nt',
      secret: '53cr3t',
      access_token: 'acc355',
      refresh_token: 'r3fr35h'
    }
    const mockViyaTarget = new Target({
      name: 'test',
      appLoc: '/Public/test/',
      serverType: ServerType.SasViya,
      contextName: 'test context'
    })

    jest
      .spyOn(configUtils, 'findTargetInConfiguration')
      .mockImplementation(() =>
        Promise.resolve({
          target: mockViyaTarget,
          isLocal: true
        })
      )
    jest
      .spyOn(configUtils, 'getAuthConfig')
      .mockImplementation(() => Promise.resolve(mockAuthConfig))

    const args = [...defaultArgs, 'request', sasProgramPath]

    const command = new RequestCommand(args)
    await command.execute()
    const targetInfo = await command.getTargetInfo()

    expect(command.name).toEqual('request')
    expect(targetInfo.target).toEqual(mockViyaTarget)
    expect(targetInfo.isLocal).toBeTrue()

    expect(requestModule.runSasJob).toHaveBeenCalledWith(
      mockViyaTarget,
      true,
      sasProgramPath,
      undefined,
      undefined,
      mockAuthConfig,
      undefined,
      null,
      undefined
    )
  })

  it('should parse sasjs request command with all arguments', async () => {
    const args = [
      ...defaultArgs,
      'request',
      sasProgramPath,
      '--target',
      'test',
      '--data',
      dataFilePath,
      '--config',
      configFilePath,
      '--output',
      outputPath,
      '--log',
      logPath
    ]

    const command = new RequestCommand(args)
    await command.execute()
    const targetInfo = await command.getTargetInfo()

    expect(command.name).toEqual('request')
    expect(targetInfo.target).toEqual(target)
    expect(targetInfo.isLocal).toBeTrue()

    expect(requestModule.runSasJob).toHaveBeenCalledWith(
      target,
      true,
      sasProgramPath,
      dataFilePath,
      configFilePath,
      undefined,
      undefined,
      null,
      outputPath
    )
  })

  it('should parse a sasjs request command with all shorthand arguments', async () => {
    const args = [
      ...defaultArgs,
      'request',
      sasProgramPath,
      '-t',
      'test',
      '-d',
      dataFilePath,
      '-c',
      configFilePath,
      '-o',
      outputPath,
      '-l',
      logPath
    ]

    const command = new RequestCommand(args)
    await command.execute()
    const targetInfo = await command.getTargetInfo()

    expect(command.name).toEqual('request')
    expect(targetInfo.target).toEqual(target)
    expect(targetInfo.isLocal).toBeTrue()

    expect(requestModule.runSasJob).toHaveBeenCalledWith(
      target,
      true,
      sasProgramPath,
      dataFilePath,
      configFilePath,
      undefined,
      undefined,
      null,
      outputPath
    )
  })

  it('should log success and return the success code when execution is successful', async () => {
    const args = [...defaultArgs, 'request', sasProgramPath]

    const command = new RequestCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.Success)
  })

  it('should log the error and return the error code when execution is unsuccessful', async () => {
    const args = [...defaultArgs, 'request', sasProgramPath]
    jest
      .spyOn(requestModule, 'runSasJob')
      .mockImplementation(() => Promise.reject(new Error('Test Error')))

    const command = new RequestCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(process.logger.error).toHaveBeenCalled()
  })
})

const setupMocks = () => {
  jest.resetAllMocks()
  jest.mock('../request')
  jest.mock('../../../utils/config')
  jest
    .spyOn(requestModule, 'runSasJob')
    .mockImplementation(() => Promise.resolve(true as any))

  jest
    .spyOn(configUtils, 'findTargetInConfiguration')
    .mockImplementation(() => Promise.resolve({ target, isLocal: true }))

  process.logger = new Logger(LogLevel.Off)
  jest.spyOn(process.logger, 'error')
}

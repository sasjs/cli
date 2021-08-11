import * as runModule from '../run'
import { RunCommand } from '../runCommand'
import { Logger, LogLevel, ServerType, Target } from '@sasjs/utils'
import * as configUtils from '../../../utils/config'
import { ReturnCode } from '../../../types/command'
import { setConstants } from '../../../utils'

const defaultArgs = ['node', 'sasjs']
const target = new Target({
  name: 'test',
  appLoc: '/Public/test/',
  serverType: ServerType.SasViya,
  contextName: 'test context'
})
const sasFilePath = 'path/to/soure.sas'
describe('RunCommand', () => {
  beforeAll(async () => {
    await setConstants()
  })

  beforeEach(() => {
    setupMocks()
  })

  it('should parse sasjs run command', async () => {
    const args = [...defaultArgs, 'run', sasFilePath]

    const command = new RunCommand(args)
    await command.execute()
    const targetInfo = await command.getTargetInfo()

    expect(command.name).toEqual('run')
    expect(targetInfo.target).toEqual(target)
    expect(targetInfo.isLocal).toBeTrue()

    expect(runModule.runSasCode).toHaveBeenCalledWith(
      target,
      sasFilePath,
      false
    )
  })

  it('should parse sasjs run command with all arguments', async () => {
    const args = [
      ...defaultArgs,
      'run',
      sasFilePath,
      '--target',
      'test',
      '--compile'
    ]

    const command = new RunCommand(args)
    await command.execute()
    const targetInfo = await command.getTargetInfo()

    expect(command.name).toEqual('run')
    expect(targetInfo.target).toEqual(target)
    expect(targetInfo.isLocal).toBeTrue()

    expect(runModule.runSasCode).toHaveBeenCalledWith(target, sasFilePath, true)
  })

  it('should parse a sasjs run command with all shorthand arguments', async () => {
    const args = [...defaultArgs, 'run', sasFilePath, '-t', 'test', '-c']

    const command = new RunCommand(args)
    await command.execute()
    const targetInfo = await command.getTargetInfo()

    expect(command.name).toEqual('run')
    expect(targetInfo.target).toEqual(target)
    expect(targetInfo.isLocal).toBeTrue()

    expect(runModule.runSasCode).toHaveBeenCalledWith(target, sasFilePath, true)
  })

  it('should log success and return the success code when execution is successful', async () => {
    const args = [...defaultArgs, 'run', sasFilePath]

    const command = new RunCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.Success)
  })

  it('should log the error and return the error code when execution is unsuccessful', async () => {
    const args = [...defaultArgs, 'run', sasFilePath]
    jest
      .spyOn(runModule, 'runSasCode')
      .mockImplementation(() => Promise.reject(new Error('Test Error')))

    const command = new RunCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(process.logger.error).toHaveBeenCalled()
  })
})

const setupMocks = () => {
  jest.resetAllMocks()
  jest.mock('../run')
  jest.mock('../../../utils/config')
  jest
    .spyOn(runModule, 'runSasCode')
    .mockImplementation(() => Promise.resolve({ log: 'output.log' }))

  jest
    .spyOn(configUtils, 'findTargetInConfiguration')
    .mockImplementation(() => Promise.resolve({ target, isLocal: true }))

  process.logger = new Logger(LogLevel.Off)
  jest.spyOn(process.logger, 'error')
}

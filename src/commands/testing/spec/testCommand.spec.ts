import * as testModule from '../test'
import { TestCommand } from '../testCommand'
import { Logger, LogLevel, ServerType, Target } from '@sasjs/utils'
import * as configUtils from '../../../utils/config'
import { ReturnCode } from '../../../types/command'
import { setConstants } from '../../../utils'

const defaultArgs = ['node', 'sasjs']
const target = new Target({
  name: 'testTarget',
  appLoc: '/Public/test/',
  serverType: ServerType.SasViya,
  contextName: 'test context'
})
describe('TestCommand', () => {
  beforeAll(async () => {
    await setConstants()
  })

  beforeEach(() => {
    setupMocks()
  })

  it('should parse a simple sasjs test command', () => {
    const args = [...defaultArgs, 'test']

    const command = new TestCommand(args)

    expect(command.name).toEqual('test')
    expect(command.subCommand).toEqual('')
  })

  it('should parse a sasjs test command with all arguments', async () => {
    const args = [
      ...defaultArgs,
      'test',
      '--target',
      'testTarget',
      'pattern-1',
      'pattern-2',
      '--outDirectory',
      'path-to-out',
      '--source',
      'path-to-source',
      '--ignoreFail'
    ]

    const command = new TestCommand(args)
    const targetInfo = await command.getTargetInfo()

    expect(command.name).toEqual('test')
    expect(command.subCommand).toEqual('')
    expect(targetInfo.target).toEqual(target)
    expect(targetInfo.isLocal).toBeTrue()
  })

  it('should parse a sasjs test command with all shorthand arguments', async () => {
    const args = [
      ...defaultArgs,
      'test',
      '-t',
      'testTarget',
      'pattern-1',
      'pattern-2',
      '--out',
      'path-to-out',
      '-s',
      'path-to-source',
      '--if'
    ]

    const command = new TestCommand(args)
    const targetInfo = await command.getTargetInfo()

    expect(command.name).toEqual('test')
    expect(command.subCommand).toEqual('')
    expect(targetInfo.target).toEqual(target)
    expect(targetInfo.isLocal).toBeTrue()
  })

  it('should call the test handler when executed with the correct target', async () => {
    const args = [...defaultArgs, 'test', '-t', 'testTarget']

    const command = new TestCommand(args)
    await command.execute()

    expect(testModule.runTest).toHaveBeenCalledWith(
      target,
      undefined,
      undefined,
      undefined,
      false
    )
  })

  it('should log success and return the success code when execution is successful', async () => {
    const args = [...defaultArgs, 'test', '-t', 'testTarget']

    const command = new TestCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.Success)
  })

  it('should log the error and return the error code when execution is unsuccessful', async () => {
    const args = [...defaultArgs, 'test', '-t', 'testTarget']
    jest
      .spyOn(testModule, 'runTest')
      .mockImplementation(() => Promise.reject(new Error('Test Error')))

    const command = new TestCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(process.logger.error).toHaveBeenCalled()
  })
})

const setupMocks = () => {
  jest.resetAllMocks()
  jest.mock('../test')
  jest.mock('../../../utils/config')
  jest
    .spyOn(testModule, 'runTest')
    .mockImplementation(() => Promise.resolve(undefined))

  jest
    .spyOn(configUtils, 'findTargetInConfiguration')
    .mockImplementation(() => Promise.resolve({ target, isLocal: true }))

  process.logger = new Logger(LogLevel.Off)
  jest.spyOn(process.logger, 'error')
}

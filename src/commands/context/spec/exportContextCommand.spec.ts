import * as exportModule from '../export'
import { ExportContextCommand } from '../exportContextCommand'
import { Logger, LogLevel, ServerType, Target } from '@sasjs/utils'
import * as fileModule from '@sasjs/utils/file'
import * as configUtils from '../../../utils/config'
import { ReturnCode } from '../../../types/command'
import { mockAuthConfig, mockContext } from './mocks'

describe('ExportContextCommand', () => {
  const defaultArgs = ['node', 'sasjs']
  const target = new Target({
    name: 'test',
    appLoc: '/Public/test/',
    serverType: ServerType.SasViya,
    contextName: 'test context'
  })

  beforeEach(() => {
    jest.resetAllMocks()
    jest.mock('@sasjs/utils/file')
    jest.mock('../export')
    jest.mock('../../../utils/config')

    jest
      .spyOn(fileModule, 'readFile')
      .mockImplementation(() => Promise.resolve(JSON.stringify(mockContext)))
    jest
      .spyOn(fileModule, 'fileExists')
      .mockImplementation(() => Promise.resolve(true))

    jest
      .spyOn(exportModule, 'exportContext')
      .mockImplementation(() => Promise.resolve())

    jest
      .spyOn(configUtils, 'findTargetInConfiguration')
      .mockImplementation(() => Promise.resolve({ target, isLocal: true }))
    jest
      .spyOn(configUtils, 'getAuthConfig')
      .mockImplementation(() => Promise.resolve(mockAuthConfig))

    process.logger = new Logger(LogLevel.Off)
    jest.spyOn(process.logger, 'success')
    jest.spyOn(process.logger, 'error')
  })

  it('should parse a simple sasjs context export command', () => {
    const args = [
      ...defaultArgs,
      'context',
      'export',
      'testContext',
      '--target',
      'test'
    ]

    const command = new ExportContextCommand(args)

    expect(command.name).toEqual('context')
    expect(command.subCommand).toEqual('export')
  })

  it('should parse a sasjs export context command with shorthand arguments', () => {
    const args = [
      ...defaultArgs,
      'context',
      'export',
      'testContext',
      '-t',
      'test'
    ]

    const command = new ExportContextCommand(args)

    expect(command.name).toEqual('context')
    expect(command.subCommand).toEqual('export')
  })

  it('should halt execution when there is an error fetching the auth config', async () => {
    const args = [
      ...defaultArgs,
      'context',
      'export',
      'testContext',
      '-t',
      'test'
    ]
    const command = new ExportContextCommand(args)
    jest
      .spyOn(configUtils, 'getAuthConfig')
      .mockImplementation(() => Promise.reject(new Error('Test error')))

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(exportModule.exportContext).not.toHaveBeenCalled()
  })

  it('should call the create context handler when executed', async () => {
    const args = [
      ...defaultArgs,
      'context',
      'export',
      'testContext',
      '-t',
      'test'
    ]
    const command = new ExportContextCommand(args)

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.Success)
    expect(exportModule.exportContext).toHaveBeenCalledWith(
      'testContext',
      expect.anything(), // TODO: Assert that create was called with the adapter
      mockAuthConfig.access_token
    )
  })

  it('should return with the error code when the create method errors out', async () => {
    const args = [
      ...defaultArgs,
      'context',
      'export',
      'testContext',
      '-t',
      'test'
    ]
    jest
      .spyOn(exportModule, 'exportContext')
      .mockImplementation(() => Promise.reject())
    const command = new ExportContextCommand(args)

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
  })
})

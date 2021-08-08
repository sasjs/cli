import * as listModule from '../list'
import { ListContextCommand } from '../listContextCommand'
import { Logger, LogLevel, ServerType, Target } from '@sasjs/utils'
import * as fileModule from '@sasjs/utils/file'
import * as configUtils from '../../../utils/config'
import { ReturnCode } from '../../../types/command'
import { mockAuthConfig, mockContext } from './mocks'

describe('ListContextCommand', () => {
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
    jest.mock('../list')
    jest.mock('../../../utils/config')

    jest
      .spyOn(fileModule, 'readFile')
      .mockImplementation(() => Promise.resolve(JSON.stringify(mockContext)))
    jest
      .spyOn(fileModule, 'fileExists')
      .mockImplementation(() => Promise.resolve(true))

    jest.spyOn(listModule, 'list').mockImplementation(() => Promise.resolve())

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
    const args = [...defaultArgs, 'context', 'list', '--target', 'test']

    const command = new ListContextCommand(args)

    expect(command.name).toEqual('context')
    expect(command.subCommand).toEqual('list')
  })

  it('should parse a sasjs export context command with shorthand arguments', () => {
    const args = [...defaultArgs, 'context', 'list', '-t', 'test']

    const command = new ListContextCommand(args)

    expect(command.name).toEqual('context')
    expect(command.subCommand).toEqual('list')
  })

  it('should halt execution when there is an error fetching the auth config', async () => {
    const args = [...defaultArgs, 'context', 'list', '-t', 'test']
    const command = new ListContextCommand(args)
    jest
      .spyOn(configUtils, 'getAuthConfig')
      .mockImplementation(() => Promise.reject(new Error('Test error')))

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(listModule.list).not.toHaveBeenCalled()
  })

  it('should call the create context handler when executed', async () => {
    const args = [...defaultArgs, 'context', 'list', '-t', 'test']
    const command = new ListContextCommand(args)

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.Success)
    expect(listModule.list).toHaveBeenCalledWith(
      target,
      expect.anything(), // TODO: Assert that create was called with the adapter
      mockAuthConfig
    )
  })

  it('should return with the error code when the create method errors out', async () => {
    const args = [...defaultArgs, 'context', 'list', '-t', 'test']
    jest.spyOn(listModule, 'list').mockImplementation(() => Promise.reject())
    const command = new ListContextCommand(args)

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
  })

  it('should return with the error code when the server type for the specified target is not SAS Viya', async () => {
    const args = [...defaultArgs, 'context', 'list', '-t', 'test']
    jest
      .spyOn(configUtils, 'findTargetInConfiguration')
      .mockImplementation(() =>
        Promise.resolve({
          target: new Target({
            name: 'test',
            appLoc: '/Public/test/',
            serverType: ServerType.Sas9
          }),
          isLocal: true
        })
      )
    const command = new ListContextCommand(args)

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(process.logger.error).toHaveBeenCalledWith(
      `'context list' command is only supported for SAS Viya build targets.\nPlease try again with a different target.`
    )
  })
})

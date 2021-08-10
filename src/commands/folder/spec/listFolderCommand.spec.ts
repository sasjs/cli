import { ListFolderCommand } from '../listFolderCommand'
import * as listModule from '../list'
import { ReturnCode } from '../../../types/command'
import * as configUtils from '../../../utils/config'
import { Logger, LogLevel } from '@sasjs/utils/logger'
import { ServerType, Target } from '@sasjs/utils'
import { mockAuthConfig } from './mocks'

const target = new Target({
  name: 'test',
  appLoc: '/Public/test/',
  serverType: ServerType.SasViya,
  contextName: 'test context'
})

describe('ListFolderCommand', () => {
  const defaultArgs = ['node', 'sasjs']

  beforeEach(() => {
    setupMocks()
  })

  it('should parse a simple sasjs folder list command', () => {
    const args = [...defaultArgs, 'folder', 'list', '/test']

    const command = new ListFolderCommand(args)

    expect(command.name).toEqual('folder')
    expect(command.subCommand).toEqual('list')
  })

  it('should parse a sasjs folder list command with a target', async () => {
    const args = [...defaultArgs, 'folder', 'list', '/test', '-t', 'test']

    const command = new ListFolderCommand(args)
    const targetInfo = await command.getTargetInfo()

    expect(command.name).toEqual('folder')
    expect(command.subCommand).toEqual('list')
    expect(targetInfo.target).toEqual(target)
  })

  it('should call the list folder handler when executed', async () => {
    const args = [...defaultArgs, 'folder', 'list', '/test', '-t', 'test']

    const command = new ListFolderCommand(args)
    await command.execute()

    expect(listModule.list).toHaveBeenCalled()
  })

  it('should return with the success code after execution', async () => {
    const args = [...defaultArgs, 'folder', 'list', '/test', '-t', 'test']
    const command = new ListFolderCommand(args)

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.Success)
  })

  it('should return with the error code when execution fails', async () => {
    const args = [...defaultArgs, 'folder', 'list', '/test', '-t', 'test']
    jest.spyOn(listModule, 'list').mockImplementation(() => Promise.reject())
    const command = new ListFolderCommand(args)

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(process.logger.error).toHaveBeenCalled()
  })
})

const setupMocks = () => {
  jest.resetAllMocks()
  jest.mock('../list')
  jest.spyOn(listModule, 'list').mockImplementation(() => Promise.resolve(''))
  process.logger = new Logger(LogLevel.Off)
  jest.spyOn(process.logger, 'success')
  jest.spyOn(process.logger, 'error')
  jest
    .spyOn(configUtils, 'findTargetInConfiguration')
    .mockImplementation(() => Promise.resolve({ target, isLocal: true }))
  jest
    .spyOn(configUtils, 'getAuthConfig')
    .mockImplementation(() => Promise.resolve(mockAuthConfig))
}

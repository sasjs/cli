import { DeleteFolderCommand } from '../deleteFolderCommand'
import * as deleteModule from '../delete'
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

describe('DeleteFolderCommand', () => {
  const defaultArgs = ['node', 'sasjs']

  beforeEach(() => {
    setupMocks()
  })

  it('should parse a simple sasjs folder delete command', () => {
    const args = [...defaultArgs, 'folder', 'delete', '/test']

    const command = new DeleteFolderCommand(args)

    expect(command.name).toEqual('folder')
    expect(command.subCommand).toEqual('delete')
  })

  it('should parse a sasjs folder delete command with a target', async () => {
    const args = [...defaultArgs, 'folder', 'delete', '/test', '-t', 'test']

    const command = new DeleteFolderCommand(args)
    const targetInfo = await command.getTargetInfo()

    expect(command.name).toEqual('folder')
    expect(command.subCommand).toEqual('delete')
    expect(targetInfo.target).toEqual(target)
  })

  it('should call the delete folder handler when executed', async () => {
    const args = [...defaultArgs, 'folder', 'delete', '/test', '-t', 'test']

    const command = new DeleteFolderCommand(args)
    await command.execute()

    expect(deleteModule.deleteFolder).toHaveBeenCalled()
  })

  it('should return with the success code after execution', async () => {
    const args = [...defaultArgs, 'folder', 'delete', '/test', '-t', 'test']
    const command = new DeleteFolderCommand(args)

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.Success)
  })

  it('should return with the error code when execution fails', async () => {
    const args = [...defaultArgs, 'folder', 'delete', '/test', '-t', 'test']
    jest
      .spyOn(deleteModule, 'deleteFolder')
      .mockImplementation(() => Promise.reject())
    const command = new DeleteFolderCommand(args)

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
  })
})

const setupMocks = () => {
  jest.resetAllMocks()
  jest.mock('../delete')
  jest
    .spyOn(deleteModule, 'deleteFolder')
    .mockImplementation(() => Promise.resolve())
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

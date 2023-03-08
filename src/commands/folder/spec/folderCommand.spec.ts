import { FolderCommand } from '../folderCommand'
import * as createModule from '../create'
import * as deleteModule from '../delete'
import * as listModule from '../list'
import { ReturnCode } from '../../../types/command'
import * as configUtils from '../../../utils/config'
import * as setConstantsUtils from '../../../utils/setConstants'
import { Logger, LogLevel } from '@sasjs/utils/logger'
import { ServerType, Target } from '@sasjs/utils'
import { mockAuthConfig } from './mocks'

const target = new Target({
  name: 'test',
  appLoc: '/Public/test/',
  serverType: ServerType.SasViya,
  contextName: 'test context'
})

describe('FolderCommand - create', () => {
  const defaultArgs = ['node', 'sasjs']

  beforeEach(() => {
    setupMocks()
  })

  it('should parse a simple sasjs folder create command', () => {
    const args = [...defaultArgs, 'folder', 'create', '/test']

    const command = new FolderCommand(args)

    expect(command.name).toEqual('folder')
    expect(command.subCommand).toEqual('create')
  })

  it('should parse a sasjs folder create command with a target', async () => {
    const args = [...defaultArgs, 'folder', 'create', '/test', '-t', 'test']

    const command = new FolderCommand(args)
    const targetInfo = await command.getTargetInfo()

    expect(command.name).toEqual('folder')
    expect(command.subCommand).toEqual('create')
    expect(targetInfo.target).toEqual(target)
  })

  it('should call the create folder handler when executed', async () => {
    const args = [...defaultArgs, 'folder', 'create', '/test', '-t', 'test']

    const command = new FolderCommand(args)
    await command.execute()

    expect(createModule.create).toHaveBeenCalled()
  })

  it('should return with the success code after execution', async () => {
    const args = [...defaultArgs, 'folder', 'create', '/test', '-t', 'test']
    const command = new FolderCommand(args)

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.Success)
  })

  it('should return with the error code when execution fails', async () => {
    const args = [...defaultArgs, 'folder', 'create', '/test', '-t', 'test']
    jest
      .spyOn(createModule, 'create')
      .mockImplementation(() => Promise.reject())
    const command = new FolderCommand(args)

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
  })
})

describe('FolderCommand - delete', () => {
  const defaultArgs = ['node', 'sasjs']

  beforeEach(() => {
    setupMocks()
  })

  it('should parse a simple sasjs folder delete command', () => {
    const args = [...defaultArgs, 'folder', 'delete', '/test']

    const command = new FolderCommand(args)

    expect(command.name).toEqual('folder')
    expect(command.subCommand).toEqual('delete')
  })

  it('should parse a sasjs folder delete command with a target', async () => {
    const args = [...defaultArgs, 'folder', 'delete', '/test', '-t', 'test']

    const command = new FolderCommand(args)
    const targetInfo = await command.getTargetInfo()

    expect(command.name).toEqual('folder')
    expect(command.subCommand).toEqual('delete')
    expect(targetInfo.target).toEqual(target)
  })

  it('should call the delete folder handler when executed', async () => {
    const args = [...defaultArgs, 'folder', 'delete', '/test', '-t', 'test']

    const command = new FolderCommand(args)
    await command.execute()

    expect(deleteModule.deleteFolder).toHaveBeenCalled()
  })

  it('should return with the success code after execution', async () => {
    const args = [...defaultArgs, 'folder', 'delete', '/test', '-t', 'test']
    const command = new FolderCommand(args)

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.Success)
  })

  it('should return with the error code when execution fails', async () => {
    const args = [...defaultArgs, 'folder', 'delete', '/test', '-t', 'test']
    jest
      .spyOn(deleteModule, 'deleteFolder')
      .mockImplementation(() => Promise.reject())
    const command = new FolderCommand(args)

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
  })
})

describe('FolderCommand - list', () => {
  const defaultArgs = ['node', 'sasjs']

  beforeEach(() => {
    setupMocks()
  })

  it('should parse a simple sasjs folder list command', () => {
    const args = [...defaultArgs, 'folder', 'list', '/test']

    const command = new FolderCommand(args)

    expect(command.name).toEqual('folder')
    expect(command.subCommand).toEqual('list')
  })

  it('should parse a sasjs folder list command with a target', async () => {
    const args = [...defaultArgs, 'folder', 'list', '/test', '-t', 'test']

    const command = new FolderCommand(args)
    const targetInfo = await command.getTargetInfo()

    expect(command.name).toEqual('folder')
    expect(command.subCommand).toEqual('list')
    expect(targetInfo.target).toEqual(target)
  })

  it('should call the list folder handler when executed', async () => {
    const args = [...defaultArgs, 'folder', 'list', '/test', '-t', 'test']

    const command = new FolderCommand(args)
    await command.execute()

    expect(listModule.list).toHaveBeenCalled()
  })

  it('should return with the success code after execution', async () => {
    const args = [...defaultArgs, 'folder', 'list', '/test', '-t', 'test']
    const command = new FolderCommand(args)

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.Success)
  })

  it('should return with the error code when execution fails', async () => {
    const args = [...defaultArgs, 'folder', 'list', '/test', '-t', 'test']
    jest.spyOn(listModule, 'list').mockImplementation(() => Promise.reject())
    const command = new FolderCommand(args)

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(process.logger.error).toHaveBeenCalled()
  })
})

const setupMocks = () => {
  jest.resetAllMocks()
  jest.mock('../create')
  jest.mock('../delete')
  jest.mock('../list')
  jest.spyOn(createModule, 'create').mockImplementation(() => Promise.resolve())
  jest
    .spyOn(deleteModule, 'deleteFolder')
    .mockImplementation(() => Promise.resolve())
  jest.spyOn(listModule, 'list').mockImplementation(() => Promise.resolve(''))
  process.logger = new Logger(LogLevel.Off)
  jest.spyOn(process.logger, 'success')
  jest.spyOn(process.logger, 'error')
  jest
    .spyOn(configUtils, 'findTargetInConfiguration')
    .mockImplementation(() => Promise.resolve({ target, isLocal: true }))
  jest
    .spyOn(configUtils, 'getLocalConfig')
    .mockImplementation(() => Promise.resolve({}))
  jest
    .spyOn(configUtils, 'getAuthConfig')
    .mockImplementation(() => Promise.resolve(mockAuthConfig))
  jest
    .spyOn(setConstantsUtils, 'setConstants')
    .mockImplementation(() => Promise.resolve())
}

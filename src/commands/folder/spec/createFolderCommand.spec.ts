import { CreateFolderCommand } from '../createFolderCommand'
import * as createModule from '../create'
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

describe('CreateFolderCommand', () => {
  const defaultArgs = ['node', 'sasjs']

  beforeEach(() => {
    setupMocks()
  })

  it('should parse a simple sasjs folder create command', () => {
    const args = [...defaultArgs, 'folder', 'create', '/test']

    const command = new CreateFolderCommand(args)

    expect(command.name).toEqual('folder')
    expect(command.subCommand).toEqual('create')
  })

  it('should parse a sasjs folder create command with a target', async () => {
    const args = [...defaultArgs, 'folder', 'create', '/test', '-t', 'test']

    const command = new CreateFolderCommand(args)
    const targetInfo = await command.getTargetInfo()

    expect(command.name).toEqual('folder')
    expect(command.subCommand).toEqual('create')
    expect(targetInfo.target).toEqual(target)
  })

  it('should call the create folder handler when executed', async () => {
    const args = [...defaultArgs, 'folder', 'create', '/test', '-t', 'test']

    const command = new CreateFolderCommand(args)
    await command.execute()

    expect(createModule.create).toHaveBeenCalled()
  })

  it('should return with the success code after execution', async () => {
    const args = [...defaultArgs, 'folder', 'delete', '/test', '-t', 'test']
    const command = new CreateFolderCommand(args)

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.Success)
  })

  it('should return with the error code when execution fails', async () => {
    const args = [...defaultArgs, 'folder', 'delete', '/test', '-t', 'test']
    jest
      .spyOn(createModule, 'create')
      .mockImplementation(() => Promise.reject())
    const command = new CreateFolderCommand(args)

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
  })
})

const setupMocks = () => {
  jest.resetAllMocks()
  jest.mock('../delete')
  jest.spyOn(createModule, 'create').mockImplementation(() => Promise.resolve())
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

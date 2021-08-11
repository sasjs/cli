import * as createModule from '../create'
import * as deleteModule from '../delete'
import * as editModule from '../edit'
import * as exportModule from '../export'
import * as listModule from '../list'
import { ContextCommand } from '../contextCommand'
import { Logger, LogLevel, ServerType, Target } from '@sasjs/utils'
import * as fileModule from '@sasjs/utils/file'
import * as configUtils from '../../../utils/config'
import { ReturnCode } from '../../../types/command'
import { mockAuthConfig, mockContext } from './mocks'

const defaultArgs = ['node', 'sasjs']
const target = new Target({
  name: 'test',
  appLoc: '/Public/test/',
  serverType: ServerType.SasViya,
  contextName: 'test context'
})

describe('ContextCommand - create', () => {
  beforeEach(() => {
    setupMocks()
  })

  it('should parse a simple sasjs context create command', () => {
    const args = [
      ...defaultArgs,
      'context',
      'create',
      '--source',
      'test.json',
      '--target',
      'test'
    ]

    const command = new ContextCommand(args)

    expect(command.name).toEqual('context')
    expect(command.subCommand).toEqual('create')
  })

  it('should parse a sasjs create context command with shorthand arguments', () => {
    const args = [
      ...defaultArgs,
      'context',
      'create',
      '-s',
      'test.json',
      '-t',
      'test'
    ]

    const command = new ContextCommand(args)

    expect(command.name).toEqual('context')
    expect(command.subCommand).toEqual('create')
  })

  it('should get the context config from the provided path', async () => {
    const args = [
      ...defaultArgs,
      'context',
      'create',
      '-s',
      './test.json',
      '-t',
      'test'
    ]

    const command = new ContextCommand(args)

    const config = await command.getConfig()

    expect(config).toEqual(mockContext)
  })

  it('should return the cached config when available', async () => {
    const args = [
      ...defaultArgs,
      'context',
      'create',
      '-s',
      './test.json',
      '-t',
      'test'
    ]

    const command = new ContextCommand(args)

    let config = await command.getConfig()
    config = await command.getConfig()

    expect(config).toEqual(mockContext)
    expect(fileModule.readFile).toHaveBeenCalledWith('./test.json')
    expect(fileModule.readFile).toHaveBeenCalledTimes(1)
  })

  it('should throw an error when the config file does not exist', async () => {
    const args = [
      ...defaultArgs,
      'context',
      'create',
      '-s',
      './test.json',
      '-t',
      'test'
    ]
    jest
      .spyOn(fileModule, 'fileExists')
      .mockImplementation(() => Promise.resolve(false))

    const command = new ContextCommand(args)

    const error = await command.getConfig().catch((e) => e)

    expect(error).toBeInstanceOf(Error)
    expect(error.message).toEqual('Invalid source JSON path.')
  })

  it('should throw an error when unable to read the source config file', async () => {
    const args = [
      ...defaultArgs,
      'context',
      'create',
      '-s',
      './test.json',
      '-t',
      'test'
    ]
    jest
      .spyOn(fileModule, 'readFile')
      .mockImplementation(() => Promise.reject(new Error('Read error')))

    const command = new ContextCommand(args)

    const error = await command.getConfig().catch((e) => e)

    expect(error).toBeInstanceOf(Error)
    expect(error.message).toEqual('Error reading file at ./test.json.')
  })

  it('should throw an error when the source config file is not valid JSON', async () => {
    const args = [
      ...defaultArgs,
      'context',
      'create',
      '-s',
      './test.json',
      '-t',
      'test'
    ]
    jest
      .spyOn(fileModule, 'readFile')
      .mockImplementation(() => Promise.resolve('test'))
    const command = new ContextCommand(args)

    const error = await command.getConfig().catch((e) => e)

    expect(error).toBeInstanceOf(Error)
    expect(error.message).toEqual(
      'Context config file is not a valid JSON file.'
    )
  })

  it('should halt execution when there is an error fetching the config', async () => {
    const args = [
      ...defaultArgs,
      'context',
      'create',
      '-s',
      './test.json',
      '-t',
      'test'
    ]
    const command = new ContextCommand(args)

    setupMocks()
    jest
      .spyOn(command, 'getConfig')
      .mockImplementation(() => Promise.reject(new Error('Test error')))
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(createModule.create).not.toHaveBeenCalled()
  })

  it('should halt execution when there is an error fetching the auth config', async () => {
    const args = [
      ...defaultArgs,
      'context',
      'create',
      '-s',
      './test.json',
      '-t',
      'test'
    ]
    const command = new ContextCommand(args)

    setupMocks()
    jest
      .spyOn(configUtils, 'getAuthConfig')
      .mockImplementation(() => Promise.reject(new Error('Test error')))
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(createModule.create).not.toHaveBeenCalled()
  })

  it('should call the create context handler when executed', async () => {
    const args = [
      ...defaultArgs,
      'context',
      'create',
      '-s',
      './test.json',
      '-t',
      'test'
    ]
    const command = new ContextCommand(args)

    setupMocks()
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.Success)
    expect(createModule.create).toHaveBeenCalledWith(
      mockContext,
      expect.anything(), // TODO: Assert that create was called with the adapter
      mockAuthConfig.access_token
    )
  })

  it('should return with the error code when the create method errors out', async () => {
    const args = [
      ...defaultArgs,
      'context',
      'create',
      '-s',
      './test.json',
      '-t',
      'test'
    ]
    const command = new ContextCommand(args)

    setupMocks()
    jest
      .spyOn(createModule, 'create')
      .mockImplementation(() => Promise.reject())
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
  })
})

describe('ContextCommand - delete', () => {
  beforeEach(() => {
    setupMocks()
  })

  it('should parse a simple sasjs context delete command', () => {
    const args = [
      ...defaultArgs,
      'context',
      'delete',
      'testContext',
      '--target',
      'test'
    ]

    const command = new ContextCommand(args)

    expect(command.name).toEqual('context')
    expect(command.subCommand).toEqual('delete')
  })

  it('should parse a sasjs delete context command with shorthand arguments', () => {
    const args = [
      ...defaultArgs,
      'context',
      'delete',
      'testContext',
      '-t',
      'test'
    ]

    const command = new ContextCommand(args)

    expect(command.name).toEqual('context')
    expect(command.subCommand).toEqual('delete')
  })

  it('should halt execution when there is an error fetching the auth config', async () => {
    const args = [
      ...defaultArgs,
      'context',
      'delete',
      'testContext',
      '-t',
      'test'
    ]
    const command = new ContextCommand(args)

    setupMocks()
    jest
      .spyOn(configUtils, 'getAuthConfig')
      .mockImplementation(() => Promise.reject(new Error('Test error')))
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(deleteModule.deleteContext).not.toHaveBeenCalled()
  })

  it('should call the create context handler when executed', async () => {
    const args = [
      ...defaultArgs,
      'context',
      'delete',
      'testContext',
      '-t',
      'test'
    ]
    const command = new ContextCommand(args)

    setupMocks()
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.Success)
    expect(deleteModule.deleteContext).toHaveBeenCalledWith(
      'testContext',
      expect.anything(), // TODO: Assert that create was called with the adapter
      mockAuthConfig.access_token
    )
  })

  it('should return with the error code when the create method errors out', async () => {
    const args = [
      ...defaultArgs,
      'context',
      'delete',
      'testContext',
      '-t',
      'test'
    ]
    const command = new ContextCommand(args)

    setupMocks()
    jest
      .spyOn(deleteModule, 'deleteContext')
      .mockImplementation(() => Promise.reject())
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
  })
})

describe('ContextCommand - edit', () => {
  beforeEach(() => {
    setupMocks()
  })

  it('should parse a simple sasjs context edit command', () => {
    const args = [
      ...defaultArgs,
      'context',
      'edit',
      '--source',
      'test.json',
      '--target',
      'test'
    ]

    const command = new ContextCommand(args)

    expect(command.name).toEqual('context')
    expect(command.subCommand).toEqual('edit')
  })

  it('should parse a sasjs edit context command with shorthand arguments', () => {
    const args = [
      ...defaultArgs,
      'context',
      'edit',
      '-s',
      'test.json',
      '-t',
      'test'
    ]

    const command = new ContextCommand(args)

    expect(command.name).toEqual('context')
    expect(command.subCommand).toEqual('edit')
  })

  it('should get the context config from the provided path', async () => {
    const args = [
      ...defaultArgs,
      'context',
      'edit',
      '-s',
      './test.json',
      '-t',
      'test'
    ]

    const command = new ContextCommand(args)

    const config = await command.getConfig()

    expect(config).toEqual(mockContext)
  })

  it('should return the cached config when available', async () => {
    const args = [
      ...defaultArgs,
      'context',
      'edit',
      '-s',
      './test.json',
      '-t',
      'test'
    ]

    const command = new ContextCommand(args)

    let config = await command.getConfig()
    config = await command.getConfig()

    expect(config).toEqual(mockContext)
    expect(fileModule.readFile).toHaveBeenCalledWith('./test.json')
    expect(fileModule.readFile).toHaveBeenCalledTimes(1)
  })

  it('should throw an error when the config file does not exist', async () => {
    const args = [
      ...defaultArgs,
      'context',
      'edit',
      '-s',
      './test.json',
      '-t',
      'test'
    ]
    jest
      .spyOn(fileModule, 'fileExists')
      .mockImplementation(() => Promise.resolve(false))

    const command = new ContextCommand(args)

    const error = await command.getConfig().catch((e) => e)

    expect(error).toBeInstanceOf(Error)
    expect(error.message).toEqual('Invalid source JSON path.')
  })

  it('should throw an error when unable to read the source config file', async () => {
    const args = [
      ...defaultArgs,
      'context',
      'edit',
      '-s',
      './test.json',
      '-t',
      'test'
    ]
    jest
      .spyOn(fileModule, 'readFile')
      .mockImplementation(() => Promise.reject(new Error('Read error')))

    const command = new ContextCommand(args)

    const error = await command.getConfig().catch((e) => e)

    expect(error).toBeInstanceOf(Error)
    expect(error.message).toEqual('Error reading file at ./test.json.')
  })

  it('should throw an error when the source config file is not valid JSON', async () => {
    const args = [
      ...defaultArgs,
      'context',
      'edit',
      '-s',
      './test.json',
      '-t',
      'test'
    ]
    jest
      .spyOn(fileModule, 'readFile')
      .mockImplementation(() => Promise.resolve('test'))
    const command = new ContextCommand(args)

    const error = await command.getConfig().catch((e) => e)

    expect(error).toBeInstanceOf(Error)
    expect(error.message).toEqual(
      'Context config file is not a valid JSON file.'
    )
  })

  it('should halt execution when there is an error fetching the config', async () => {
    const args = [
      ...defaultArgs,
      'context',
      'edit',
      '-s',
      './test.json',
      '-t',
      'test'
    ]
    const command = new ContextCommand(args)

    setupMocks()
    jest
      .spyOn(command, 'getConfig')
      .mockImplementation(() => Promise.reject(new Error('Test error')))
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(editModule.edit).not.toHaveBeenCalled()
  })

  it('should halt execution when there is an error fetching the auth config', async () => {
    const args = [
      ...defaultArgs,
      'context',
      'edit',
      '-s',
      './test.json',
      '-t',
      'test'
    ]
    const command = new ContextCommand(args)

    setupMocks()
    jest
      .spyOn(configUtils, 'getAuthConfig')
      .mockImplementation(() => Promise.reject(new Error('Test error')))
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(editModule.edit).not.toHaveBeenCalled()
  })

  it('should call the edit context handler when executed', async () => {
    const args = [
      ...defaultArgs,
      'context',
      'edit',
      '-s',
      './test.json',
      '-t',
      'test'
    ]
    const command = new ContextCommand(args)

    setupMocks()
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.Success)
    expect(editModule.edit).toHaveBeenCalledWith(
      undefined,
      mockContext,
      expect.anything(), // TODO: Assert that edit was called with the adapter
      mockAuthConfig.access_token
    )
  })

  it('should call the edit context handler with the context name when provided', async () => {
    const args = [
      ...defaultArgs,
      'context',
      'edit',
      'testContext',
      '-s',
      './test.json',
      '-t',
      'test'
    ]
    const command = new ContextCommand(args)

    setupMocks()
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.Success)
    expect(editModule.edit).toHaveBeenCalledWith(
      'testContext',
      mockContext,
      expect.anything(), // TODO: Assert that edit was called with the adapter
      mockAuthConfig.access_token
    )
  })

  it('should return with the error code when the edit method errors out', async () => {
    const args = [
      ...defaultArgs,
      'context',
      'edit',
      '-s',
      './test.json',
      '-t',
      'test'
    ]
    const command = new ContextCommand(args)

    setupMocks()
    jest.spyOn(editModule, 'edit').mockImplementation(() => Promise.reject())
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
  })
})

describe('ContextCommand - export', () => {
  it('should parse a simple sasjs context export command', () => {
    const args = [
      ...defaultArgs,
      'context',
      'export',
      'testContext',
      '--target',
      'test'
    ]

    const command = new ContextCommand(args)

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

    const command = new ContextCommand(args)

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
    const command = new ContextCommand(args)

    setupMocks()
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
    const command = new ContextCommand(args)

    setupMocks()
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
    const command = new ContextCommand(args)

    setupMocks()
    jest
      .spyOn(exportModule, 'exportContext')
      .mockImplementation(() => Promise.reject())
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
  })
})

describe('ContextCommand - list', () => {
  it('should parse a simple sasjs context export command', () => {
    const args = [...defaultArgs, 'context', 'list', '--target', 'test']

    const command = new ContextCommand(args)

    expect(command.name).toEqual('context')
    expect(command.subCommand).toEqual('list')
  })

  it('should parse a sasjs export context command with shorthand arguments', () => {
    const args = [...defaultArgs, 'context', 'list', '-t', 'test']

    const command = new ContextCommand(args)

    expect(command.name).toEqual('context')
    expect(command.subCommand).toEqual('list')
  })

  it('should halt execution when there is an error fetching the auth config', async () => {
    const args = [...defaultArgs, 'context', 'list', '-t', 'test']
    const command = new ContextCommand(args)

    setupMocks()
    jest
      .spyOn(configUtils, 'getAuthConfig')
      .mockImplementation(() => Promise.reject(new Error('Test error')))
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(listModule.list).not.toHaveBeenCalled()
  })

  it('should call the create context handler when executed', async () => {
    const args = [...defaultArgs, 'context', 'list', '-t', 'test']
    const command = new ContextCommand(args)

    setupMocks()
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
    const command = new ContextCommand(args)

    setupMocks()
    jest.spyOn(listModule, 'list').mockImplementation(() => Promise.reject())
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
  })

  it('should return with the error code when the server type for the specified target is not SAS Viya', async () => {
    const args = [...defaultArgs, 'context', 'list', '-t', 'test']
    const command = new ContextCommand(args)

    setupMocks()
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
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(process.logger.error).toHaveBeenCalledWith(
      `'context list' command is only supported for SAS Viya build targets.\nPlease try again with a different target.`
    )
  })
})

const setupMocks = () => {
  jest.resetAllMocks()
  jest.mock('@sasjs/utils/file')
  jest.mock('../create')
  jest.mock('../delete')
  jest.mock('../edit')
  jest.mock('../export')
  jest.mock('../list')
  jest.mock('../../../utils/config')

  jest
    .spyOn(fileModule, 'readFile')
    .mockImplementation(() => Promise.resolve(JSON.stringify(mockContext)))
  jest
    .spyOn(fileModule, 'fileExists')
    .mockImplementation(() => Promise.resolve(true))

  jest.spyOn(createModule, 'create').mockImplementation(() => Promise.resolve())
  jest
    .spyOn(deleteModule, 'deleteContext')
    .mockImplementation(() => Promise.resolve())
  jest.spyOn(editModule, 'edit').mockImplementation(() => Promise.resolve())
  jest
    .spyOn(exportModule, 'exportContext')
    .mockImplementation(() => Promise.resolve())
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
}

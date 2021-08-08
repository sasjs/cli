import * as createModule from '../create'
import { CreateContextCommand } from '../createContextCommand'
import { Logger, LogLevel, ServerType, Target } from '@sasjs/utils'
import * as fileModule from '@sasjs/utils/file'
import * as configUtils from '../../../utils/config'
import { ReturnCode } from '../../../types/command'
import { mockAuthConfig, mockContext } from './mocks'

describe('CreateContextCommand', () => {
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
    jest.mock('../create')
    jest.mock('../../../utils/config')

    jest
      .spyOn(fileModule, 'readFile')
      .mockImplementation(() => Promise.resolve(JSON.stringify(mockContext)))
    jest
      .spyOn(fileModule, 'fileExists')
      .mockImplementation(() => Promise.resolve(true))

    jest
      .spyOn(createModule, 'create')
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

    const command = new CreateContextCommand(args)

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

    const command = new CreateContextCommand(args)

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

    const command = new CreateContextCommand(args)

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

    const command = new CreateContextCommand(args)

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

    const command = new CreateContextCommand(args)

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

    const command = new CreateContextCommand(args)

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
    const command = new CreateContextCommand(args)

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
    const command = new CreateContextCommand(args)
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
    const command = new CreateContextCommand(args)
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
    const command = new CreateContextCommand(args)

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
    jest
      .spyOn(createModule, 'create')
      .mockImplementation(() => Promise.reject())
    const command = new CreateContextCommand(args)

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
  })
})

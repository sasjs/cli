import { DocsCommand } from '../docsCommand'
import * as generateDocsModule from '../generateDocs'
import * as generateDotModule from '../generateDot'
import * as initDocsModule from '../initDocs'
import { ReturnCode } from '../../../types/command'
import * as configUtils from '../../../utils/config'
import * as setConstantsUtils from '../../../utils/setConstants'
import { Logger, LogLevel } from '@sasjs/utils/logger'
import { Configuration, ServerType, Target } from '@sasjs/utils'

const target = new Target({
  name: 'test',
  appLoc: '/Public/test/',
  serverType: ServerType.SasViya,
  contextName: 'test context'
})

const config: Configuration = {}

describe('DocsCommand - generate docs', () => {
  const defaultArgs = ['node', 'sasjs']

  beforeEach(() => {
    setupMocks()
  })

  it('should parse a simple sasjs doc command', () => {
    const args = [...defaultArgs, 'doc']

    const command = new DocsCommand(args)

    expect(command.name).toEqual('doc')
    expect(command.subCommand).toEqual('')
  })

  it('should parse a sasjs doc command with a target', async () => {
    const args = [...defaultArgs, 'doc', '-t', 'test']

    const command = new DocsCommand(args)
    const targetInfo = await command.getTargetInfo()

    expect(command.name).toEqual('doc')
    expect(command.subCommand).toEqual('')
    expect(targetInfo.target).toEqual(target)
  })

  it('should parse an aliased sasjs docs command', () => {
    const args = [...defaultArgs, 'docs']

    const command = new DocsCommand(args)

    expect(command.name).toEqual('doc')
    expect(command.subCommand).toEqual('')
  })

  it('should call the generateDocs handler when executed', async () => {
    const args = [...defaultArgs, 'docs']

    const command = new DocsCommand(args)
    await command.execute()

    expect(generateDocsModule.generateDocs).toHaveBeenCalled()
  })

  it('should return with the success code after execution', async () => {
    const args = [...defaultArgs, 'docs']
    const command = new DocsCommand(args)

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.Success)
    expect(process.logger.success).toHaveBeenCalled()
  })

  it('should return with the error code when execution fails', async () => {
    const args = [...defaultArgs, 'docs']
    jest
      .spyOn(generateDocsModule, 'generateDocs')
      .mockImplementation(() => Promise.reject())
    const command = new DocsCommand(args)

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(process.logger.error).toHaveBeenCalled()
  })
})

describe('DocsCommand - generate dot', () => {
  const defaultArgs = ['node', 'sasjs']

  beforeEach(() => {
    setupMocks()
  })

  it('should parse a simple sasjs doc lineage command', () => {
    const args = [...defaultArgs, 'doc', 'lineage']

    const command = new DocsCommand(args)

    expect(command.name).toEqual('doc')
    expect(command.subCommand).toEqual('lineage')
  })

  it('should parse a sasjs doc command with a target', async () => {
    const args = [...defaultArgs, 'doc', 'lineage', '-t', 'test']

    const command = new DocsCommand(args)
    const targetInfo = await command.getTargetInfo()

    expect(command.name).toEqual('doc')
    expect(command.subCommand).toEqual('lineage')
    expect(targetInfo.target).toEqual(target)
  })

  it('should parse an aliased sasjs docs lineage command', () => {
    const args = [...defaultArgs, 'docs', 'lineage']

    const command = new DocsCommand(args)

    expect(command.name).toEqual('doc')
    expect(command.subCommand).toEqual('lineage')
  })

  it('should call the generateDocs handler when executed', async () => {
    const args = [...defaultArgs, 'docs', 'lineage']

    const command = new DocsCommand(args)
    await command.execute()

    expect(generateDotModule.generateDot).toHaveBeenCalled()
  })

  it('should return with the success code after execution', async () => {
    const args = [...defaultArgs, 'docs', 'lineage']
    const command = new DocsCommand(args)

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.Success)
    expect(process.logger.success).toHaveBeenCalled()
  })

  it('should return with the error code when execution fails', async () => {
    const args = [...defaultArgs, 'docs', 'lineage']
    jest
      .spyOn(generateDotModule, 'generateDot')
      .mockImplementation(() => Promise.reject())
    const command = new DocsCommand(args)

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(process.logger.error).toHaveBeenCalled()
  })
})

describe('DocsCommand - init docs', () => {
  const defaultArgs = ['node', 'sasjs']

  beforeEach(() => {
    setupMocks()
  })

  it('should parse a simple sasjs doc init command', () => {
    const args = [...defaultArgs, 'doc', 'init']

    const command = new DocsCommand(args)

    expect(command.name).toEqual('doc')
    expect(command.subCommand).toEqual('init')
  })

  it('should parse an aliased sasjs docs init command', () => {
    const args = [...defaultArgs, 'docs', 'init']

    const command = new DocsCommand(args)

    expect(command.name).toEqual('doc')
    expect(command.subCommand).toEqual('init')
  })

  it('should call the initDocs handler when executed', async () => {
    const args = [...defaultArgs, 'docs', 'init']

    const command = new DocsCommand(args)
    await command.execute()

    expect(initDocsModule.initDocs).toHaveBeenCalled()
  })

  it('should return with the success code after execution', async () => {
    const args = [...defaultArgs, 'docs', 'init']
    const command = new DocsCommand(args)

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.Success)
    expect(process.logger.success).toHaveBeenCalled()
  })

  it('should return with the error code when execution fails', async () => {
    const args = [...defaultArgs, 'docs', 'init']
    jest
      .spyOn(initDocsModule, 'initDocs')
      .mockImplementation(() => Promise.reject())
    const command = new DocsCommand(args)

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(process.logger.error).toHaveBeenCalled()
  })
})

const setupMocks = () => {
  jest.resetAllMocks()
  jest.mock('../generateDocs')
  jest.mock('../generateDot')
  jest.mock('../initDocs')
  jest
    .spyOn(generateDocsModule, 'generateDocs')
    .mockImplementation(() => Promise.resolve({ outDirectory: 'test' }))
  jest
    .spyOn(generateDotModule, 'generateDot')
    .mockImplementation(() => Promise.resolve({ outDirectory: 'test' }))
  jest
    .spyOn(initDocsModule, 'initDocs')
    .mockImplementation(() => Promise.resolve())
  process.logger = new Logger(LogLevel.Off)
  jest.spyOn(process.logger, 'success')
  jest.spyOn(process.logger, 'error')
  jest
    .spyOn(configUtils, 'findTargetInConfiguration')
    .mockImplementation(() => Promise.resolve({ target, isLocal: true }))
  jest.spyOn(process.logger, 'error')
  jest
    .spyOn(configUtils, 'getLocalConfig')
    .mockImplementation(() => Promise.resolve(config))
  jest
    .spyOn(setConstantsUtils, 'setConstants')
    .mockImplementation(() => Promise.resolve())
}

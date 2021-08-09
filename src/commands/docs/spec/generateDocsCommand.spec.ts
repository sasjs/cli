import { GenerateDocsCommand } from '../generateDocsCommand'
import * as generateDocsModule from '../generateDocs'
import { ReturnCode } from '../../../types/command'
import * as configUtils from '../../../utils/config'
import { Logger, LogLevel } from '@sasjs/utils/logger'
import { ServerType, Target } from '@sasjs/utils'

const target = new Target({
  name: 'test',
  appLoc: '/Public/test/',
  serverType: ServerType.SasViya,
  contextName: 'test context'
})

describe('GenerateDocsCommand', () => {
  const defaultArgs = ['node', 'sasjs']

  beforeEach(() => {
    setupMocks()
  })

  it('should parse a simple sasjs doc command', () => {
    const args = [...defaultArgs, 'doc']

    const command = new GenerateDocsCommand(args)

    expect(command.name).toEqual('doc')
    expect(command.subCommand).toEqual('')
  })

  it('should parse a sasjs doc command with a target', async () => {
    const args = [...defaultArgs, 'doc', '-t', 'test']

    const command = new GenerateDocsCommand(args)
    const targetInfo = await command.getTargetInfo()

    expect(command.name).toEqual('doc')
    expect(command.subCommand).toEqual('')
    expect(targetInfo.target).toEqual(target)
  })

  it('should parse an aliased sasjs docs command', () => {
    const args = [...defaultArgs, 'docs']

    const command = new GenerateDocsCommand(args)

    expect(command.name).toEqual('doc')
    expect(command.subCommand).toEqual('')
  })

  it('should call the generateDocs handler when executed', async () => {
    const args = [...defaultArgs, 'docs']

    const command = new GenerateDocsCommand(args)
    await command.execute()

    expect(generateDocsModule.generateDocs).toHaveBeenCalled()
  })

  it('should return with the success code after execution', async () => {
    const args = [...defaultArgs, 'docs']
    const command = new GenerateDocsCommand(args)

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.Success)
    expect(process.logger.success).toHaveBeenCalled()
  })

  it('should return with the error code when execution fails', async () => {
    const args = [...defaultArgs, 'docs']
    jest
      .spyOn(generateDocsModule, 'generateDocs')
      .mockImplementation(() => Promise.reject())
    const command = new GenerateDocsCommand(args)

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(process.logger.error).toHaveBeenCalled()
  })
})

const setupMocks = () => {
  jest.resetAllMocks()
  jest.mock('../generateDocs')
  jest
    .spyOn(generateDocsModule, 'generateDocs')
    .mockImplementation(() => Promise.resolve({ outDirectory: 'test' }))
  process.logger = new Logger(LogLevel.Off)
  jest.spyOn(process.logger, 'success')
  jest.spyOn(process.logger, 'error')
  jest
    .spyOn(configUtils, 'findTargetInConfiguration')
    .mockImplementation(() => Promise.resolve({ target, isLocal: true }))
}

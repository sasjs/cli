import { InitDocsCommand } from '../initDocsCommand'
import * as initDocsModule from '../initDocs'
import { ReturnCode } from '../../../types/command'
import { Logger, LogLevel } from '@sasjs/utils/logger'

describe('InitDocsCommand', () => {
  const defaultArgs = ['node', 'sasjs']

  beforeEach(() => {
    setupMocks()
  })

  it('should parse a simple sasjs doc init command', () => {
    const args = [...defaultArgs, 'doc', 'init']

    const command = new InitDocsCommand(args)

    expect(command.name).toEqual('doc')
    expect(command.subCommand).toEqual('init')
  })

  it('should parse an aliased sasjs docs init command', () => {
    const args = [...defaultArgs, 'docs', 'init']

    const command = new InitDocsCommand(args)

    expect(command.name).toEqual('doc')
    expect(command.subCommand).toEqual('init')
  })

  it('should call the initDocs handler when executed', async () => {
    const args = [...defaultArgs, 'docs', 'init']

    const command = new InitDocsCommand(args)
    await command.execute()

    expect(initDocsModule.initDocs).toHaveBeenCalled()
  })

  it('should return with the success code after execution', async () => {
    const args = [...defaultArgs, 'docs', 'init']
    const command = new InitDocsCommand(args)

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.Success)
    expect(process.logger.success).toHaveBeenCalled()
  })

  it('should return with the error code when execution fails', async () => {
    const args = [...defaultArgs, 'docs', 'init']
    jest
      .spyOn(initDocsModule, 'initDocs')
      .mockImplementation(() => Promise.reject())
    const command = new InitDocsCommand(args)

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(process.logger.error).toHaveBeenCalled()
  })
})

const setupMocks = () => {
  jest.resetAllMocks()
  jest.mock('../initDocs')
  jest
    .spyOn(initDocsModule, 'initDocs')
    .mockImplementation(() => Promise.resolve())
  process.logger = new Logger(LogLevel.Off)
  jest.spyOn(process.logger, 'success')
  jest.spyOn(process.logger, 'error')
}

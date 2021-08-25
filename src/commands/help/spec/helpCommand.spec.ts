import * as helpModule from '../help'
import { HelpCommand } from '../helpCommand'
import { Logger, LogLevel } from '@sasjs/utils'
import { ReturnCode } from '../../../types/command'

const defaultArgs = ['node', 'sasjs']

describe('HelpCommand', () => {
  beforeEach(() => {
    setupMocks()
  })

  it('should parse a simple sasjs help command', () => {
    const args = [...defaultArgs, 'help']

    const command = new HelpCommand(args)

    expect(command.name).toEqual('help')
    expect(command.subCommand).toEqual('')
  })

  it('should return the success code when execution is successful', async () => {
    const args = [...defaultArgs, 'help']

    const command = new HelpCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.Success)
  })

  it('should return the error code when execution is unsuccessful', async () => {
    const args = [...defaultArgs, 'help']
    jest
      .spyOn(helpModule, 'printHelpText')
      .mockImplementation(() => Promise.reject(new Error('Test Error')))

    const command = new HelpCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
  })
})

const setupMocks = () => {
  jest.resetAllMocks()
  jest.mock('../help')
  jest
    .spyOn(helpModule, 'printHelpText')
    .mockImplementation(() => Promise.resolve({} as any))

  process.logger = new Logger(LogLevel.Off)
}

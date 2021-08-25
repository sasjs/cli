import { Logger, LogLevel } from '@sasjs/utils/logger'
import { ReturnCode } from '../../../types/command'
import * as initModule from '../init'
import { InitCommand } from '../initCommand'

describe('InitCommand', () => {
  const defaultArgs = ['node', 'sasjs']

  beforeEach(() => {
    setupMocks()
  })

  it('should parse a simple sasjs init command', () => {
    const args = [...defaultArgs, 'init']

    const command = new InitCommand(args)

    expect(command.name).toEqual('init')
    expect(command.value).toEqual('')
  })

  it('should call the init handler when executed', async () => {
    const args = [...defaultArgs, 'init']
    const command = new InitCommand(args)

    const returnCode = await command.execute()

    expect(initModule.init).toHaveBeenCalled()
    expect(returnCode).toEqual(ReturnCode.Success)
    expect(process.logger.success).toHaveBeenCalledWith(
      'This project is now powered by SASjs!\nYou can use any sasjs command within the project.\n\nFor more information, type `sasjs help` or visit https://cli.sasjs.io/'
    )
  })

  it('should return an error code when the execution errors out', async () => {
    const args = [...defaultArgs, 'init']
    jest
      .spyOn(initModule, 'init')
      .mockImplementation(() => Promise.reject(new Error('Test Error')))
    const command = new InitCommand(args)

    const returnCode = await command.execute()

    expect(initModule.init).toHaveBeenCalled()
    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(process.logger.error).toHaveBeenCalledWith(
      'Error initialising SASjs: ',
      new Error('Test Error')
    )
  })
})

const setupMocks = () => {
  jest.resetAllMocks()
  jest.mock('../init')
  jest.spyOn(initModule, 'init').mockImplementation(() => Promise.resolve())

  process.logger = new Logger(LogLevel.Off)
  jest.spyOn(process.logger, 'success')
  jest.spyOn(process.logger, 'error')
}

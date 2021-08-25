import { Logger, LogLevel } from '@sasjs/utils/logger'
import { ReturnCode } from '../../../types/command'
import * as dbModule from '../db'
import { DbCommand } from '../dbCommand'

describe('DbCommand', () => {
  const defaultArgs = ['node', 'sasjs']

  beforeEach(() => {
    setupMocks()
  })

  it('should parse a sasjs db command', () => {
    const args = [...defaultArgs, 'db']

    const command = new DbCommand(args)

    expect(command.name).toEqual('db')
  })

  it('should call the db handler when executed', async () => {
    const args = [...defaultArgs, 'db']
    const command = new DbCommand(args)

    const returnCode = await command.execute()

    expect(dbModule.buildDB).toHaveBeenCalled()
    expect(returnCode).toEqual(ReturnCode.Success)
    expect(process.logger.success).toHaveBeenCalledWith('DB build completed!')
  })

  it('should return an error code when the execution errors out', async () => {
    const args = [...defaultArgs, 'db']
    jest
      .spyOn(dbModule, 'buildDB')
      .mockImplementation(() => Promise.reject(new Error('Test Error')))
    const command = new DbCommand(args)

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(process.logger.error).toHaveBeenCalledWith(
      'Error building DB: ',
      new Error('Test Error')
    )
  })
})

const setupMocks = () => {
  jest.resetAllMocks()
  jest.mock('../db')
  jest.spyOn(dbModule, 'buildDB').mockImplementation(() => Promise.resolve())

  process.logger = new Logger(LogLevel.Off)
  jest.spyOn(process.logger, 'success')
  jest.spyOn(process.logger, 'error')
}

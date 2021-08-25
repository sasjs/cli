import { Logger, LogLevel } from '@sasjs/utils/logger'
import { ReturnCode } from '../../../types/command'
import * as versionModule from '../version'
import { VersionCommand } from '../versionCommand'

describe('VersionCommand', () => {
  const defaultArgs = ['node', 'sasjs']

  beforeEach(() => {
    setupMocks()
  })

  it('should parse a sasjs version command', () => {
    const args = [...defaultArgs, 'version']

    const command = new VersionCommand(args)

    expect(command.name).toEqual('version')
  })

  it('should call the version handler when executed', async () => {
    const args = [...defaultArgs, 'version']
    const command = new VersionCommand(args)

    const returnCode = await command.execute()

    expect(versionModule.printVersion).toHaveBeenCalled()
    expect(returnCode).toEqual(ReturnCode.Success)
  })

  it('should return an error code when the execution errors out', async () => {
    const args = [...defaultArgs, 'version']
    jest
      .spyOn(versionModule, 'printVersion')
      .mockImplementation(() => Promise.reject(new Error('Test Error')))
    const command = new VersionCommand(args)

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(process.logger.error).toHaveBeenCalledWith(
      'An error has occurred while checking version.\n',
      'Test Error'
    )
  })
})

const setupMocks = () => {
  jest.resetAllMocks()
  jest.mock('../version')
  jest
    .spyOn(versionModule, 'printVersion')
    .mockImplementation(() => Promise.resolve(''))

  process.logger = new Logger(LogLevel.Off)
  jest.spyOn(process.logger, 'success')
  jest.spyOn(process.logger, 'error')
}

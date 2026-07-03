import { Logger, LogLevel } from '@sasjs/utils'
import * as configUtils from '../../../utils/config'
import * as loadEnvVariablesModule from '../../../utils/loadEnvVariables'
import { mockProcessExit } from '../../../utils/test'
import { TargetCommand } from '../targetCommand'
import { ReturnCode } from '../returnCode'

describe('TargetCommand.getTargetInfo', () => {
  beforeEach(() => {
    process.logger = new Logger(LogLevel.Off)
    jest.spyOn(process.logger, 'error')
  })

  it('exits with an internal error when target env variables fail to load', async () => {
    const processExitSpy = mockProcessExit()
    jest
      .spyOn(loadEnvVariablesModule, 'loadTargetEnvVariables')
      .mockImplementation(() => Promise.reject(new Error('env file missing')))

    const command = new TargetCommand(['node', 'sasjs', 'job'], {
      strict: false
    })

    await command.getTargetInfo()

    expect(process.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error loading environment variables'),
      expect.any(Error)
    )
    expect(processExitSpy).toHaveBeenCalledWith(ReturnCode.InternalError)
  })

  it('exits with an internal error when the target cannot be found in configuration', async () => {
    const processExitSpy = mockProcessExit()
    jest
      .spyOn(loadEnvVariablesModule, 'loadTargetEnvVariables')
      .mockImplementation(() => Promise.resolve())
    jest
      .spyOn(configUtils, 'findTargetInConfiguration')
      .mockImplementation(() => Promise.reject(new Error('target not found')))

    const command = new TargetCommand(['node', 'sasjs', 'job'], {
      strict: false
    })

    await command.getTargetInfo()

    expect(process.logger.error).toHaveBeenCalledWith(
      'Error reading target from configuration: ',
      expect.any(Error)
    )
    expect(processExitSpy).toHaveBeenCalledWith(ReturnCode.InternalError)
  })
})

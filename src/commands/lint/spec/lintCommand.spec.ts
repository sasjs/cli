import * as initModule from '../initLint'
import * as processModule from '../processLint'
import { LintCommand } from '../lintCommand'
import { Logger, LogLevel } from '@sasjs/utils'
import { ReturnCode } from '../../../types/command'

const defaultArgs = ['node', 'sasjs']

describe('LintCommand', () => {
  beforeEach(() => {
    setupMocks()
  })

  it('should parse a simple sasjs lint command', () => {
    const args = [...defaultArgs, 'lint']

    const command = new LintCommand(args)

    expect(command.name).toEqual('lint')
    expect(command.subCommand).toEqual('find')
  })

  it('should parse a sasjs lint command with filter strings', () => {
    const args = [...defaultArgs, 'lint', 'find', 'pattern1', 'pattern2']

    const command = new LintCommand(args)

    expect(command.name).toEqual('lint')
    expect(command.subCommand).toEqual('find')
  })

  it('should log success and return the success code when execution is successful', async () => {
    const args = [...defaultArgs, 'lint']

    const command = new LintCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.Success)
    expect(process.logger.success).toHaveBeenCalled()
  })

  it('should log warning and return the success code when execution has lint warnings', async () => {
    const args = [...defaultArgs, 'lint']
    jest.spyOn(processModule, 'processLint').mockImplementation(() =>
      Promise.resolve({
        warnings: true,
        errors: false,
        warningCount: 3,
        errorCount: 0
      })
    )

    const command = new LintCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.Success)
    expect(process.logger.warn).toHaveBeenCalled()
  })

  it('should log the error and return the error code when execution is unsuccessful', async () => {
    const args = [...defaultArgs, 'lint']
    jest
      .spyOn(processModule, 'processLint')
      .mockImplementation(() => Promise.reject(new Error('Test Error')))

    const command = new LintCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(process.logger.error).toHaveBeenCalled()
  })

  it('should log the error and return the error code when execution has lint errors', async () => {
    const args = [...defaultArgs, 'lint']
    jest.spyOn(processModule, 'processLint').mockImplementation(() =>
      Promise.resolve({
        warnings: false,
        errors: true,
        warningCount: 0,
        errorCount: 1
      })
    )

    const command = new LintCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.LintError)
    expect(process.logger.error).toHaveBeenCalled()
  })

  it('should default the subcommand when --fail-on comes before the filter', () => {
    const args = [...defaultArgs, 'lint', '--fail-on', 'warning', 'appinit']

    const command = new LintCommand(args)

    expect(command.name).toEqual('lint')
    expect(command.subCommand).toEqual('find')
  })

  it('should default the subcommand when only --fail-on is given', () => {
    const args = [...defaultArgs, 'lint', '--fail-on=warning']

    const command = new LintCommand(args)

    expect(command.name).toEqual('lint')
    expect(command.subCommand).toEqual('find')
  })

  it('should keep an explicit subcommand ahead of --fail-on', () => {
    const args = [...defaultArgs, 'lint', 'find', '--fail-on', 'warning']

    const command = new LintCommand(args)

    expect(command.subCommand).toEqual('find')
  })

  it('should fail on warnings when --fail-on warning is passed', async () => {
    const args = [...defaultArgs, 'lint', '--fail-on', 'warning']
    jest.spyOn(processModule, 'processLint').mockImplementation(() =>
      Promise.resolve({
        warnings: true,
        errors: false,
        warningCount: 2,
        errorCount: 0
      })
    )

    const command = new LintCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.LintError)
    expect(process.logger.error).toHaveBeenCalledWith(
      '',
      '2 lint warnings treated as errors because of --fail-on warning. Please fix them.'
    )
  })

  it('should word a single warning as one error', async () => {
    const args = [...defaultArgs, 'lint', '--fail-on', 'warning']
    jest.spyOn(processModule, 'processLint').mockImplementation(() =>
      Promise.resolve({
        warnings: true,
        errors: false,
        warningCount: 1,
        errorCount: 0
      })
    )

    const command = new LintCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.LintError)
    expect(process.logger.error).toHaveBeenCalledWith(
      '',
      '1 lint warning treated as an error because of --fail-on warning. Please fix it.'
    )
  })

  it('should not fail on warnings when --fail-on error is passed', async () => {
    const args = [...defaultArgs, 'lint', '--fail-on', 'error']
    jest.spyOn(processModule, 'processLint').mockImplementation(() =>
      Promise.resolve({
        warnings: true,
        errors: false,
        warningCount: 2,
        errorCount: 0
      })
    )

    const command = new LintCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.Success)
    expect(process.logger.warn).toHaveBeenCalled()
  })

  it('should reject an unknown --fail-on value', async () => {
    const args = [...defaultArgs, 'lint', '--fail-on', 'note']
    const command = new LintCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InvalidCommand)
    expect(processModule.processLint).not.toHaveBeenCalled()
  })
})

describe('LintCommand - fix', () => {
  beforeEach(() => {
    setupMocks()
  })

  it('should parse a simple sasjs lint command', () => {
    const args = [...defaultArgs, 'lint', 'fix']

    const command = new LintCommand(args)

    expect(command.name).toEqual('lint')
    expect(command.subCommand).toEqual('fix')
  })

  it('should parse sasjs lint command', () => {
    const args = [...defaultArgs, 'lint', 'fix', 'pattern1', 'pattern2']

    const command = new LintCommand(args)

    expect(command.name).toEqual('lint')
    expect(command.subCommand).toEqual('fix')
  })

  it('should log success and return the success code when execution is successful', async () => {
    const args = [...defaultArgs, 'lint', 'fix']

    const command = new LintCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.Success)
  })

  it('should log the error and return the error code when execution is unsuccessful', async () => {
    const args = [...defaultArgs, 'lint', 'fix']
    jest
      .spyOn(processModule, 'lintFix')
      .mockImplementation(() => Promise.reject(new Error('Test Error')))

    const command = new LintCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.LintError)
    expect(process.logger.error).toHaveBeenCalled()
  })
})

describe('LintCommand - init', () => {
  beforeEach(() => {
    setupMocks()
  })

  it('should parse a simple sasjs lint command', () => {
    const args = [...defaultArgs, 'lint', 'init']

    const command = new LintCommand(args)

    expect(command.name).toEqual('lint')
    expect(command.subCommand).toEqual('init')
  })

  it('should log success and return the success code when execution is successful', async () => {
    const args = [...defaultArgs, 'lint', 'init']

    const command = new LintCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.Success)
    expect(process.logger.success).toHaveBeenCalled()
  })

  it('should log the error and return the error code when execution is unsuccessful', async () => {
    const args = [...defaultArgs, 'lint', 'init']
    jest
      .spyOn(initModule, 'initLint')
      .mockImplementation(() => Promise.reject(new Error('Test Error')))

    const command = new LintCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(process.logger.error).toHaveBeenCalled()
  })
})

const setupMocks = () => {
  jest.resetAllMocks()
  jest.mock('../processLint')
  jest.mock('../initLint')
  jest.spyOn(processModule, 'processLint').mockImplementation(() =>
    Promise.resolve({
      warnings: false,
      errors: false,
      warningCount: 0,
      errorCount: 0
    })
  )
  jest
    .spyOn(processModule, 'lintFix')
    .mockImplementation(() => Promise.resolve())
  jest
    .spyOn(initModule, 'initLint')
    .mockImplementation(() => Promise.resolve({ fileAlreadyExisted: false }))

  process.logger = new Logger(LogLevel.Off)
  jest.spyOn(process.logger, 'success')
  jest.spyOn(process.logger, 'error')
  jest.spyOn(process.logger, 'warn')
}

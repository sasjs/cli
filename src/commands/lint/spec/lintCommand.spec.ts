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

  it('should log success and return the success code when execution is successful', async () => {
    const args = [...defaultArgs, 'lint']

    const command = new LintCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.Success)
    expect(process.logger.success).toHaveBeenCalled()
  })

  it('should log warning and return the success code when execution has lint warnings', async () => {
    const args = [...defaultArgs, 'lint']
    jest
      .spyOn(processModule, 'processLint')
      .mockImplementation(() =>
        Promise.resolve({ warnings: true, errors: false })
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
    jest
      .spyOn(processModule, 'processLint')
      .mockImplementation(() =>
        Promise.resolve({ warnings: false, errors: true })
      )

    const command = new LintCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.LintError)
    expect(process.logger.error).toHaveBeenCalled()
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
  jest
    .spyOn(processModule, 'processLint')
    .mockImplementation(() =>
      Promise.resolve({ warnings: false, errors: false })
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

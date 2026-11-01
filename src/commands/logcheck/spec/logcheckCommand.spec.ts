import * as configModule from '../logCheckConfig'
import * as processModule from '../processLogCheck'
import * as renderModule from '../renderLogCheck'
import { LogCheckCommand } from '../logcheckCommand'
import { Logger, LogLevel } from '@sasjs/utils'
import { ReturnCode } from '../../../types/command'
import { defaultLogCheckConfig, LogCheckSummary } from '../types'

const defaultArgs = ['node', 'sasjs', 'logcheck']

const summary = (
  overrides: Partial<LogCheckSummary> = {}
): LogCheckSummary => ({
  logs: [],
  skipped: [],
  missing: [],
  unreadable: [],
  usedDefaultInput: false,
  searched: ['sasjsresults'],
  totals: {
    errors: 0,
    warnings: 0,
    notes: 0,
    suppressed: 0,
    logs: 0,
    skipped: 0
  },
  ...overrides
})

const setupMocks = () => {
  jest
    .spyOn(configModule, 'readLogCheckConfig')
    .mockImplementation(() => Promise.resolve({ ...defaultLogCheckConfig }))
  jest
    .spyOn(processModule, 'processLogCheck')
    .mockImplementation(() => Promise.resolve(summary()))
  jest.spyOn(renderModule, 'renderLogCheck').mockImplementation(() => undefined)

  process.logger = new Logger(LogLevel.Off)
  jest.spyOn(process.logger, 'error')
  jest.spyOn(process.logger, 'log')
}

describe('LogCheckCommand', () => {
  beforeEach(() => {
    setupMocks()
  })

  it('parses the paths it was given', () => {
    const command = new LogCheckCommand([...defaultArgs, 'a.log', 'logs'])

    expect(command.name).toEqual('logcheck')
    expect((command as any).parsed.paths).toEqual(['a.log', 'logs'])
  })

  it('answers to its alias', () => {
    const command = new LogCheckCommand(['node', 'sasjs', 'lc', 'a.log'])

    expect(command.name).toEqual('logcheck')
    expect((command as any).parsed.paths).toEqual(['a.log'])
  })

  it('checks the default folder when it is given no path', async () => {
    const command = new LogCheckCommand(defaultArgs)

    await command.execute()

    expect(processModule.processLogCheck).toHaveBeenCalledWith({
      paths: [],
      config: expect.objectContaining({ failOn: 'error' })
    })
  })

  it('passes the flags over the config file', async () => {
    const command = new LogCheckCommand([
      ...defaultArgs,
      '--fail-on',
      'warning',
      '--max-warnings',
      '3',
      '--ignore-code',
      '49-169',
      '--ignore-path',
      'legacy/*'
    ])

    await command.execute()

    expect(processModule.processLogCheck).toHaveBeenCalledWith({
      paths: [],
      config: expect.objectContaining({
        failOn: 'warning',
        maxWarnings: 3,
        ignoreCodes: ['49-169'],
        ignorePaths: ['legacy/*']
      })
    })
  })

  it('reads a single value of a repeatable option as a list', async () => {
    const command = new LogCheckCommand([
      ...defaultArgs,
      '--ignore-code',
      '22-322'
    ])

    await command.execute()

    expect(
      (processModule.processLogCheck as jest.Mock).mock.calls[0][0].config
        .ignoreCodes
    ).toEqual(['22-322'])
  })

  it('renders the human report by default', async () => {
    const command = new LogCheckCommand([...defaultArgs, 'a.log'])

    await command.execute()

    expect(renderModule.renderLogCheck).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { format: 'human', verbose: false }
    )
  })

  it('renders JSON when the shorthand flag is used', async () => {
    const command = new LogCheckCommand([...defaultArgs, '--json'])

    await command.execute()

    expect(renderModule.renderLogCheck).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { format: 'json', verbose: false }
    )
  })

  it('passes the verbose flag on to the report', async () => {
    const command = new LogCheckCommand([...defaultArgs, '--verbose'])

    await command.execute()

    expect(renderModule.renderLogCheck).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { format: 'human', verbose: true }
    )
  })

  it('returns success when the summary carries no failure', async () => {
    const command = new LogCheckCommand(defaultArgs)

    expect(await command.execute()).toEqual(ReturnCode.Success)
  })

  it('returns the logcheck code when the summary failed', async () => {
    jest
      .spyOn(processModule, 'processLogCheck')
      .mockImplementation(() =>
        Promise.resolve(summary({ failure: '2 errors' }))
      )

    const command = new LogCheckCommand(defaultArgs)

    expect(await command.execute()).toEqual(ReturnCode.LogCheckError)
  })

  it('refuses a failOn that is not a policy', async () => {
    const command = new LogCheckCommand([...defaultArgs, '--fail-on', 'loud'])

    expect(await command.execute()).toEqual(ReturnCode.InvalidCommand)
    expect(process.logger.error).toHaveBeenCalled()
    expect(processModule.processLogCheck).not.toHaveBeenCalled()
  })

  it('refuses a format that is not one of the three', async () => {
    const command = new LogCheckCommand([...defaultArgs, '--format', 'xml'])

    expect(await command.execute()).toEqual(ReturnCode.InvalidCommand)
    expect(processModule.processLogCheck).not.toHaveBeenCalled()
  })

  it('reports a broken config as an internal error', async () => {
    jest
      .spyOn(configModule, 'readLogCheckConfig')
      .mockImplementation(() => Promise.reject(new Error('bad config')))

    const command = new LogCheckCommand(defaultArgs)

    expect(await command.execute()).toEqual(ReturnCode.InternalError)
    expect(process.logger.error).toHaveBeenCalled()
  })

  it('reports a scan that threw as an internal error', async () => {
    jest
      .spyOn(processModule, 'processLogCheck')
      .mockImplementation(() => Promise.reject(new Error('boom')))

    const command = new LogCheckCommand(defaultArgs)

    expect(await command.execute()).toEqual(ReturnCode.InternalError)
  })
})

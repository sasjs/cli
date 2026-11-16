import * as processFormatModule from '../processFormat'
import { FormatOutcome } from '../processFormat'
import { FormatCommand } from '../formatCommand'
import { Logger, LogLevel } from '@sasjs/utils'
import { ReturnCode } from '../../../types/command'

const defaultArgs = ['node', 'sasjs']

/** `parsed` is protected - the command's own business - so the spec reads it through a cast. */
const parsedOf = (command: FormatCommand) => (command as any).parsed

const outcome = (json: Partial<FormatOutcome> = {}): FormatOutcome => ({
  changedFilePaths: [],
  examinedCount: 3,
  unsettledFilePaths: [],
  rejectedFilePaths: [],
  failedFilePaths: [],
  engineUnavailable: false,
  ...json
})

describe('FormatCommand', () => {
  beforeEach(() => setupMocks())

  it('parses a format command with no filter', () => {
    const command = new FormatCommand([...defaultArgs, 'format'])

    expect(command.name).toEqual('format')
    // Absent rather than empty; the command applies the empty default at the call,
    // which is what the next case pins.
    expect(parsedOf(command).filterStrings).toBeUndefined()
  })

  it('parses filter strings', () => {
    const command = new FormatCommand([
      ...defaultArgs,
      'format',
      'sasjs/macros',
      'src/app'
    ])

    expect(parsedOf(command).filterStrings).toEqual(['sasjs/macros', 'src/app'])
  })

  it('reports success when every file is already canonical', async () => {
    const command = new FormatCommand([...defaultArgs, 'format'])

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.Success)
    expect(process.logger.success).toHaveBeenCalledWith(
      'All 3 files are canonically formatted.'
    )
  })

  it('rewrites files and reports how many changed', async () => {
    jest
      .spyOn(processFormatModule, 'processFormat')
      .mockResolvedValue(outcome({ changedFilePaths: ['/p/a.sas'] }))

    const command = new FormatCommand([...defaultArgs, 'format'])

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.Success)
    expect(process.logger.success).toHaveBeenCalledWith('Rewrote 1 of 3 files.')
  })

  it('fails without rewriting when --check finds a file that would change', async () => {
    jest
      .spyOn(processFormatModule, 'processFormat')
      .mockResolvedValue(
        outcome({ changedFilePaths: ['/p/a.sas', '/p/b.sas'] })
      )

    const command = new FormatCommand([...defaultArgs, 'format', '--check'])

    const returnCode = await command.execute()

    // Distinct from a lint failure: a pipeline can tell formatting drift from it.
    expect(returnCode).toEqual(ReturnCode.FormatError)
    // Nothing was written, so nothing is claimed as rewritten.
    expect(process.logger.success).not.toHaveBeenCalled()
  })

  it('passes the check flag through to the work', async () => {
    const spy = jest.spyOn(processFormatModule, 'processFormat')

    const command = new FormatCommand([...defaultArgs, 'format', '--check'])

    await command.execute()

    // `filterStrings` is absent when nothing was given, so the command passes [].
    expect(spy).toHaveBeenCalledWith([], true)
  })

  it('fails when the engine could not load, so a rule-only run is not green', async () => {
    jest
      .spyOn(processFormatModule, 'processFormat')
      .mockResolvedValue(outcome({ engineUnavailable: true }))

    const command = new FormatCommand([...defaultArgs, 'format', '--check'])

    const returnCode = await command.execute()

    // A broken install must not pass the gate the command exists to provide.
    expect(returnCode).toEqual(ReturnCode.FormatError)
    expect(process.logger.success).not.toHaveBeenCalled()
  })

  it('fails when a file did not settle, since nothing was written to it', async () => {
    jest
      .spyOn(processFormatModule, 'processFormat')
      .mockResolvedValue(outcome({ unsettledFilePaths: ['/p/odd.sas'] }))

    const command = new FormatCommand([...defaultArgs, 'format'])

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.FormatError)
    expect(process.logger.info).toHaveBeenCalledWith(
      '1 file(s) did not settle and were left unchanged:'
    )
  })

  it('fails when a filter named a path it will not format', async () => {
    jest.spyOn(processFormatModule, 'processFormat').mockResolvedValue(
      outcome({
        rejectedFilePaths: [
          { filePath: '/p/README.md', message: 'not a .sas file' }
        ]
      })
    )

    const command = new FormatCommand([
      ...defaultArgs,
      'format',
      '/p/README.md'
    ])

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.FormatError)
    expect(process.logger.warn).toHaveBeenCalledWith(
      '/p/README.md: not a .sas file'
    )
  })

  it('fails when a file could not be formatted part way', async () => {
    jest.spyOn(processFormatModule, 'processFormat').mockResolvedValue(
      outcome({
        failedFilePaths: [{ filePath: '/p/locked.sas', message: 'EACCES' }]
      })
    )

    const command = new FormatCommand([...defaultArgs, 'format'])

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.FormatError)
    expect(process.logger.error).toHaveBeenCalledWith('/p/locked.sas: EACCES')
  })

  it('returns the internal error code when formatting throws', async () => {
    jest
      .spyOn(processFormatModule, 'processFormat')
      .mockRejectedValue(new Error('cannot write'))

    const command = new FormatCommand([...defaultArgs, 'format'])

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
  })
})

const setupMocks = () => {
  jest.restoreAllMocks()
  jest.spyOn(processFormatModule, 'processFormat').mockResolvedValue(outcome())

  process.logger = new Logger(LogLevel.Off)
  jest.spyOn(process.logger, 'success')
  jest.spyOn(process.logger, 'info')
  jest.spyOn(process.logger, 'warn')
  jest.spyOn(process.logger, 'error')
}

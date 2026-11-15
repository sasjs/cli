import * as processFormatModule from '../processFormat'
import { FormatCommand } from '../formatCommand'
import { Logger, LogLevel } from '@sasjs/utils'
import { ReturnCode } from '../../../types/command'

const defaultArgs = ['node', 'sasjs']

/** `parsed` is protected - the command's own business - so the spec reads it through a cast. */
const parsedOf = (command: FormatCommand) => (command as any).parsed

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
    jest.spyOn(processFormatModule, 'processFormat').mockResolvedValue({
      changedFilePaths: ['/p/a.sas'],
      examinedCount: 3
    })

    const command = new FormatCommand([...defaultArgs, 'format'])

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.Success)
    expect(process.logger.success).toHaveBeenCalledWith('Rewrote 1 of 3 files.')
  })

  it('fails without rewriting when --check finds a file that would change', async () => {
    jest.spyOn(processFormatModule, 'processFormat').mockResolvedValue({
      changedFilePaths: ['/p/a.sas', '/p/b.sas'],
      examinedCount: 3
    })

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

    expect(spy).toHaveBeenCalledWith([], true)
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
  jest.resetAllMocks()
  jest.mock('../processFormat')
  jest
    .spyOn(processFormatModule, 'processFormat')
    .mockResolvedValue({ changedFilePaths: [], examinedCount: 3 })

  process.logger = new Logger(LogLevel.Off)
  jest.spyOn(process.logger, 'success')
  jest.spyOn(process.logger, 'info')
  jest.spyOn(process.logger, 'warn')
  jest.spyOn(process.logger, 'error')
}

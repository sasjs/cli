import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import { Logger, LogLevel } from '@sasjs/utils'

import { processFormat, resolveSasFiles } from '../processFormat'
import * as engineModule from '../formatEngine'

/**
 * The work, exercised against real files on disk with an engine supplied by the
 * test - the loader is the one seam that matters here, because jest's module
 * runtime cannot require an ES module and the engine publishes one.
 *
 * `reprint` is passed through `options`, which is also how a caller with its own
 * engine would use the function.
 */
const reprint = async (text: string) =>
  text.replace(/DATA |SET /g, (m) => m.toLowerCase())

const write = (dir: string, name: string, text: string) => {
  const filePath = path.join(dir, name)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, text)
  return filePath
}

/**
 * A reprint that never settles, so the fixed-point loop reaches its bound.
 *
 * Adding a trailing space does not work: the rules strip it on the same pass, so
 * the result comes back equal and the file looks settled. Toggling a comment line
 * alternates between two states that neither pass normalises.
 */
const restless = async (text: string) =>
  text.includes('/* toggle */')
    ? text.replace('/* toggle */\n', '')
    : text + '/* toggle */\n'

describe('processFormat', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sasjs-format-'))
    process.projectDir = dir
    process.logger = new Logger(LogLevel.Off)
    jest.restoreAllMocks()
  })

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  it('rewrites a file whose content would change', async () => {
    const filePath = write(dir, 'a.sas', 'DATA a;\nSET b;\nRUN;\n')

    const outcome = await processFormat([filePath], false, { reprint })

    expect(outcome.changedFilePaths).toEqual([filePath])
    expect(fs.readFileSync(filePath, 'utf8')).toContain('data a;')
  })

  it('is idempotent, so a formatted file is not rewritten again', async () => {
    // "Already canonical" cannot be written by hand: the rules in .sasjslint add a
    // header and wrap lines, so the only honest fixture is the formatter's own
    // output. Formatting that a second time must change nothing.
    const filePath = write(dir, 'b.sas', 'DATA a;\nSET b;\nRUN;\n')

    await processFormat([filePath], false, { reprint })
    const once = fs.readFileSync(filePath, 'utf8')

    const outcome = await processFormat([filePath], false, { reprint })

    expect(outcome.changedFilePaths).toEqual([])
    expect(fs.readFileSync(filePath, 'utf8')).toEqual(once)
  })

  it('writes nothing under check, and still names the files that would change', async () => {
    const filePath = write(dir, 'c.sas', 'DATA a;\nSET b;\nRUN;\n')

    const outcome = await processFormat([filePath], true, { reprint })

    expect(outcome.changedFilePaths).toEqual([filePath])
    // The file is byte-identical: check reports, it does not reformat.
    expect(fs.readFileSync(filePath, 'utf8')).toEqual('DATA a;\nSET b;\nRUN;\n')
  })

  it('walks the project when no filter is given, and skips generated folders', async () => {
    const source = write(dir, 'sasjs/app.sas', 'data a;\nrun;\n')
    write(dir, 'sasjs/macros/mf_x.sas', 'data b;\nrun;\n')
    // What `sasjs build` writes is not the project's source, and formatting it
    // would make `sasjs build && sasjs format --check` fail on generated files.
    write(dir, 'sasjsbuild/app.sas', 'data c;\nrun;\n')
    write(dir, 'sasjsresults/run.sas', 'data d;\nrun;\n')

    const files = await resolveSasFiles()

    expect(files).toContain(source)
    expect(files).toHaveLength(2)
    expect(files.some((file) => file.includes('sasjsbuild'))).toBe(false)
    expect(files.some((file) => file.includes('sasjsresults'))).toBe(false)
  })

  it('matches a pattern filter against the project walk', async () => {
    const macros = write(dir, 'sasjs/macros/mf_x.sas', 'data b;\nrun;\n')
    write(dir, 'sasjs/services/svc.sas', 'data c;\nrun;\n')

    const files = await resolveSasFiles(['macros'])

    expect(files).toEqual([macros])
  })

  it('walks an absolute folder filter', async () => {
    const nested = write(dir, 'nested/deep/x.sas', 'data a;\nrun;\n')

    const files = await resolveSasFiles([path.join(dir, 'nested')])

    expect(files).toEqual([nested])
  })

  it('leaves an unsettled file exactly as it was, and names it', async () => {
    const filePath = write(dir, 'e.sas', 'data a;\nrun;\n')

    const outcome = await processFormat([filePath], false, {
      reprint: restless
    })

    expect(outcome.unsettledFilePaths).toEqual([filePath])
    // Writing the last pass would leave a file that the next --check flags again.
    expect(fs.readFileSync(filePath, 'utf8')).toEqual('data a;\nrun;\n')
    expect(outcome.changedFilePaths).toEqual([])
  })

  it('retries the engine after a failed load, and says the run was rule-only', async () => {
    const filePath = write(dir, 'f.sas', 'DATA a;\nRUN;\n')
    jest
      .spyOn(engineModule, 'getFormatEngine')
      .mockRejectedValue(new Error('module not found'))

    const outcome = await processFormat([filePath], false)

    // The rules still ran, and the outcome says the layout pass did not.
    expect(outcome.engineUnavailable).toBe(true)
    expect(outcome.changedFilePaths).toEqual([filePath])
  })
})

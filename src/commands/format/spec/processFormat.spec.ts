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
 * the result comes back equal and the file looks settled. A new comment line each
 * call cannot be normalised back to what came before.
 */
/** Each call appends a line the rules leave alone, so the text never settles. */
let restlessPass = 0
const restless = async (text: string) =>
  `${text}\n/* pass ${++restlessPass} */\n`

describe('processFormat', () => {
  let dir: string
  const originalProjectDir = process.projectDir
  const originalLogger = process.logger

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sasjs-format-'))
    process.projectDir = dir
    process.logger = new Logger(LogLevel.Off)
    jest.restoreAllMocks()
  })

  // Both are process-wide, so a suite that leaves them pointing at a deleted
  // directory leaks into every suite that runs after it in this worker.
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
    process.projectDir = originalProjectDir
    process.logger = originalLogger
  })

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

    const { files } = await resolveSasFiles()

    expect(files).toContain(source)
    expect(files).toHaveLength(2)
    expect(files.some((file) => file.includes('sasjsbuild'))).toBe(false)
    expect(files.some((file) => file.includes('sasjsresults'))).toBe(false)
  })

  it('matches a pattern filter against the project walk', async () => {
    const macros = write(dir, 'sasjs/macros/mf_x.sas', 'data b;\nrun;\n')
    write(dir, 'sasjs/services/svc.sas', 'data c;\nrun;\n')

    const { files } = await resolveSasFiles(['macros'])

    expect(files).toEqual([macros])
  })

  it('walks an absolute folder filter', async () => {
    const nested = write(dir, 'nested/deep/x.sas', 'data a;\nrun;\n')

    const { files } = await resolveSasFiles([path.join(dir, 'nested')])

    expect(files).toEqual([nested])
  })

  it('refuses an absolute path that is not a .sas file', async () => {
    // The engine will happily reprint a markdown file; a formatter that rewrites
    // what it was not asked to is worse than one that says no.
    const readme = write(dir, 'README.md', '# notes\n')

    const { files, rejected } = await resolveSasFiles([readme])

    expect(files).toEqual([])
    expect(rejected).toEqual([
      { filePath: readme, message: 'not a .sas file, so it was not formatted' }
    ])
  })

  it('names a file once when a path and a pattern both match it', async () => {
    // `sasjs format /p/sasjs/macros macros` names the same file twice, and would
    // otherwise format, report and count it twice.
    const macros = write(dir, 'sasjs/macros/mf_x.sas', 'data b;\nrun;\n')

    const { files } = await resolveSasFiles([macros, 'macros'])

    expect(files).toEqual([macros])
  })

  it('treats a filter as literal text, so a metacharacter cannot over-match', async () => {
    // A filter is a path the user typed, not a regular expression: as one, `a.c`
    // matched `abc.sas` as well.
    const literal = write(dir, 'a.c.sas', 'data a;\nrun;\n')
    write(dir, 'abc.sas', 'data b;\nrun;\n')

    const { files } = await resolveSasFiles(['a.c'])

    expect(files).toEqual([literal])
  })

  it('does not throw on a filter that is not a valid regular expression', async () => {
    // `sasjs format "["` used to throw SyntaxError out of the walk, before any
    // file was handled, and surface as the generic internal-error message.
    write(dir, 'x.sas', 'data a;\nrun;\n')

    const { files, unmatchedFilters } = await resolveSasFiles(['['])

    expect(files).toEqual([])
    expect(unmatchedFilters).toEqual(['['])
  })

  it('normalises the walker output, so a forward-slash filter still matches', async () => {
    // Windows hands back native separators, so the documented
    // `sasjs format sasjs/macros` matched nothing there while reporting success.
    // A literal backslash is legal in a Linux filename, which is how the separator
    // can be exercised here without mocking the walker.
    const nested = write(dir, 'sasjs\\macros/mf_x.sas', 'data b;\nrun;\n')

    const { files, unmatchedFilters } = await resolveSasFiles(['sasjs/macros'])

    expect(files).toEqual([nested])
    expect(unmatchedFilters).toEqual([])
  })

  it('names a filter that matched no file, so a typo cannot pass a gate', async () => {
    write(dir, 'x.sas', 'data a;\nrun;\n')

    const { unmatchedFilters } = await resolveSasFiles(['no-such-folder'])

    expect(unmatchedFilters).toEqual(['no-such-folder'])
  })

  it('does not list a file as rewritten when its write fails', async () => {
    // Pushing before the write reported a file as both rewritten and failed. The
    // failure is a real EACCES on a read-only file, not a mocked one: the suite
    // runs unprivileged, where chmod 0444 is enough.
    const filePath = write(dir, 'h.sas', 'DATA a;\nRUN;\n')
    fs.chmodSync(filePath, 0o444)

    const outcome = await processFormat([filePath], false, { reprint })

    expect(outcome.changedFilePaths).toEqual([])
    expect(outcome.failedFilePaths.map((failure) => failure.filePath)).toEqual([
      filePath
    ])
  })

  it('collects a file it could not read, instead of skipping the rest', async () => {
    // One unreadable file in a tree must not stop the walk, which is the rule
    // formatFolder follows for the same reason.
    const missing = path.join(dir, 'gone.sas')
    const good = write(dir, 'ok.sas', 'DATA a;\nRUN;\n')

    const outcome = await processFormat([missing, good], false, { reprint })

    expect(outcome.failedFilePaths.map((f) => f.filePath)).toEqual([missing])
    expect(outcome.changedFilePaths).toEqual([good])
  })

  it('leaves an unsettled file exactly as it was, and names it', async () => {
    restlessPass = 0
    const filePath = write(dir, 'e.sas', 'data a;\nrun;\n')

    const outcome = await processFormat([filePath], false, {
      reprint: restless
    })

    expect(outcome.unsettledFilePaths).toEqual([filePath])
    // Writing the last pass would leave a file that the next --check flags again.
    expect(fs.readFileSync(filePath, 'utf8')).toEqual('data a;\nrun;\n')
    expect(outcome.changedFilePaths).toEqual([])
  })

  it('reports the run as rule-only when the engine cannot load', async () => {
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

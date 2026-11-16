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
 * Puts a `.sasjslint` in `dir` and works from there, returning the directory the
 * caller must change back to.
 *
 * `getLintConfig` walks up from the working directory, which is where a user runs
 * the command from, so a spec that wants a setting has to run from the project.
 */
const withLintConfig = (dir: string, json: string) => {
  fs.writeFileSync(path.join(dir, '.sasjslint'), json)

  const previous = process.cwd()
  process.chdir(dir)

  return previous
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
    // matched the `abc` folder as well.
    const literal = write(dir, 'a.c/mf_x.sas', 'data a;\nrun;\n')
    write(dir, 'abc/mf_y.sas', 'data b;\nrun;\n')

    const { files } = await resolveSasFiles(['a.c'])

    expect(files).toEqual([literal])
  })

  it('matches whole path segments, not a substring of the path', async () => {
    // Matching the absolute path let a filter hit a folder *above* the project:
    // `macros` rewrote everything under a checkout called `/home/macros-dev`.
    const macros = write(dir, 'sasjs/macros/mf_x.sas', 'data a;\nrun;\n')
    write(dir, 'sasjs/macros_old/mf_y.sas', 'data b;\nrun;\n')

    const { files } = await resolveSasFiles(['macros'])

    expect(files).toEqual([macros])
  })

  it('matches a filter that names a file', async () => {
    const appinit = write(dir, 'sasjs/services/appinit.sas', 'data a;\nrun;\n')
    write(dir, 'sasjs/services/other.sas', 'data b;\nrun;\n')

    const { files } = await resolveSasFiles(['sasjs/services/appinit.sas'])

    expect(files).toEqual([appinit])
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
    // failure is a real permission error, induced the way each platform can:
    // POSIX denies creating the sibling temporary file by making the folder
    // unwritable, while Windows has no directory permissions to use and a
    // read-only file cannot be replaced by MoveFileEx. Either way the original
    // must come through untouched.
    const folder = path.join(dir, 'locked')
    const filePath = write(folder, 'h.sas', 'DATA a;\nRUN;\n')
    const posix = process.platform !== 'win32'

    if (posix) fs.chmodSync(folder, 0o555)
    else fs.chmodSync(filePath, 0o444)

    try {
      const outcome = await processFormat([filePath], false, { reprint })

      expect(outcome.changedFilePaths).toEqual([])
      expect(
        outcome.failedFilePaths.map((failure) => failure.filePath)
      ).toEqual([filePath])
      expect(fs.readFileSync(filePath, 'utf8')).toEqual('DATA a;\nRUN;\n')
    } finally {
      if (posix) fs.chmodSync(folder, 0o755)
      else fs.chmodSync(filePath, 0o644)
    }
  })

  // A rewrite replaces the file rather than truncating it, so an interrupted run
  // cannot leave the source empty. A replaced file has a new inode; one written in
  // place keeps it, which is what this asserts. `ino` says nothing on Windows, and
  // there the property holds by construction - the rename is a MoveFileEx.
  const posixOnly = process.platform === 'win32' ? it.skip : it

  posixOnly('replaces the file instead of truncating it', async () => {
    const filePath = write(dir, 'i.sas', 'DATA a;\nRUN;\n')
    const inodeBefore = fs.statSync(filePath).ino

    await processFormat([filePath], false, { reprint })

    expect(fs.statSync(filePath).ino).not.toEqual(inodeBefore)
    expect(fs.readdirSync(dir).filter((name) => name.includes('tmp'))).toEqual(
      []
    )
  })

  // `chmod` on a directory denies nothing on Windows, so there the path is simply
  // missing and the missing-path route is taken instead.
  posixOnly('treats a path it cannot stat as not a folder', async () => {
    // `throwIfNoEntry` covers a missing path; an EACCES on the walk down to it is
    // the other way `statSync` throws, and a formatter must not die on it.
    const blocked = path.join(dir, 'blocked')
    fs.mkdirSync(blocked)
    fs.chmodSync(blocked, 0o000)

    const named = path.join(blocked, 'x.sas')

    try {
      const { files, rejected } = await resolveSasFiles([named])

      expect(files).toEqual([])
      expect(rejected.map((entry) => entry.message)).toEqual([
        'no such path, so nothing was formatted'
      ])
    } finally {
      fs.chmodSync(blocked, 0o755)
    }
  })

  posixOnly("keeps the source file's mode through a rewrite", async () => {
    // The replacement is a new file, created with the process's mode, so the
    // source's has to be carried across or a 0640 file comes back 0644.
    const filePath = write(dir, 'mode.sas', 'DATA a;\nRUN;\n')
    fs.chmodSync(filePath, 0o640)

    await processFormat([filePath], false, { reprint })

    expect(fs.statSync(filePath).mode & 0o777).toEqual(0o640)
  })

  it('names a missing path as missing, not as the wrong file type', async () => {
    // A mistyped path is not "not a .sas file", and saying so sends the reader
    // looking for the wrong mistake.
    const missing = path.join(dir, 'nope/missing.sas')

    const { rejected } = await resolveSasFiles([missing])

    expect(rejected).toEqual([
      { filePath: missing, message: 'no such path, so nothing was formatted' }
    ])
  })

  posixOnly('follows a symlink instead of replacing it', async () => {
    // A `.sas` file that is a link into a shared directory must stay a link: a
    // rename over the link's path would leave a regular copy behind and break it.
    const target = write(dir, 'shared/real.sas', 'DATA a;\nRUN;\n')
    const link = path.join(dir, 'linked.sas')
    fs.symlinkSync(target, link)

    await processFormat([link], false, { reprint })

    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true)
    expect(fs.readFileSync(target, 'utf8')).toContain('data a;')
  })

  posixOnly(
    'does not reuse a stale temporary file from an earlier run',
    async () => {
      // The temporary name carries the pid and a random token, so a leftover from a
      // killed run cannot be mistaken for this one's.
      const filePath = write(dir, 'stale.sas', 'DATA a;\nRUN;\n')
      const stale = `${filePath}.sasjs-format.tmp`
      fs.writeFileSync(stale, 'left behind by a killed run')

      await processFormat([filePath], false, { reprint })

      expect(fs.readFileSync(stale, 'utf8')).toEqual(
        'left behind by a killed run'
      )
      expect(fs.readFileSync(filePath, 'utf8')).toContain('data a;')
    }
  )

  it('records an absolute folder that holds no .sas file', async () => {
    // The pattern branch reports a filter that names nothing; the absolute branch
    // reached the same green gate, so a renamed folder read as a clean run.
    const empty = path.join(dir, 'empty')
    fs.mkdirSync(empty)

    const { unmatchedFilters } = await resolveSasFiles([empty])

    expect(unmatchedFilters).toEqual([empty])
  })

  it('keeps a byte-order mark, which is encoding rather than formatting', async () => {
    // `readFile` hands the mark back as the first character and the layout pass
    // does not carry it through, so it has to be put back.
    const filePath = write(dir, 'j.sas', '\uFEFFDATA a;\nRUN;\n')

    await processFormat([filePath], false, { reprint })

    expect(fs.readFileSync(filePath, 'utf8').charCodeAt(0)).toEqual(0xfeff)
  })

  it('writes the line endings .sasjslint asks for', async () => {
    // CRLF is a project decision when the project states one: the `lineEndings`
    // rule reads the same setting, so `format` and `lint` agree on the canonical
    // form. `getLintConfig` resolves the file from the working directory, which is
    // where a user runs the command from.
    const filePath = write(dir, 'k.sas', 'DATA a;\nRUN;\n')
    const previous = withLintConfig(dir, '{"lineEndings": "crlf"}')

    try {
      await processFormat([filePath], false, { reprint })
    } finally {
      process.chdir(previous)
    }

    const written = fs.readFileSync(filePath, 'utf8')
    expect(written).toContain('\r\n')
    expect(written.replace(/\r\n/g, '').includes('\n')).toBe(false)
  })

  it('normalises to LF when .sasjslint says so', async () => {
    const filePath = write(dir, 'l.sas', 'DATA a;\r\nRUN;\r\n')
    const previous = withLintConfig(dir, '{"lineEndings": "lf"}')

    try {
      await processFormat([filePath], false, { reprint })
    } finally {
      process.chdir(previous)
    }

    expect(fs.readFileSync(filePath, 'utf8').includes('\r\n')).toBe(false)
  })

  it('normalises to LF by default, because no ending is selected', async () => {
    // Not because the `lineEndings` rule asks for LF - its default is `off`, so no
    // rule runs. The engine returns lines joined on LF and nothing re-joins them,
    // which is why `format` and `lint` disagree on a default project.
    const filePath = write(dir, 'm.sas', 'DATA a;\r\nRUN;\r\n')

    await processFormat([filePath], false, { reprint })

    expect(fs.readFileSync(filePath, 'utf8').includes('\r\n')).toBe(false)
  })

  posixOnly(
    'collects a file it could not read, instead of skipping the rest',
    async () => {
      // One unreadable file in a tree must not stop the walk, which is the rule
      // formatFolder follows for the same reason. The file exists and cannot be
      // read, so it gets past the "no such path" check and fails at the read.
      const unreadable = write(dir, 'gone.sas', 'DATA a;\nRUN;\n')
      fs.chmodSync(unreadable, 0o000)
      const good = write(dir, 'ok.sas', 'DATA a;\nRUN;\n')

      try {
        const outcome = await processFormat([unreadable, good], false, {
          reprint
        })

        expect(outcome.failedFilePaths.map((f) => f.filePath)).toEqual([
          unreadable
        ])
        expect(outcome.changedFilePaths).toEqual([good])
      } finally {
        fs.chmodSync(unreadable, 0o644)
      }
    }
  )

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

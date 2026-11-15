import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import { Logger, LogLevel } from '@sasjs/utils'

import { processFormat } from '../processFormat'

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
  fs.writeFileSync(filePath, text)
  return filePath
}

describe('processFormat', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sasjs-format-'))
    process.projectDir = dir
    process.logger = new Logger(LogLevel.Off)
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

  it('counts what it examined, so an empty result is distinguishable from an empty project', async () => {
    write(dir, 'd.sas', 'data a;\nrun;\n')
    write(dir, 'e.sas', 'data b;\nrun;\n')

    const outcome = await processFormat([dir], false, { reprint })

    expect(outcome.examinedCount).toEqual(2)
  })
})

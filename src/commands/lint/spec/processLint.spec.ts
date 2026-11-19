import fs from 'fs'
import os from 'os'
import path from 'path'
import { processLint } from '../processLint'

/**
 * `sasjs lint` is documented to run without a `sasjsconfig.json`, and loading
 * that file is the only thing that sets `process.projectDir` - so these cases
 * run with it empty, the way a project directory without a config does.
 */
describe('processLint', () => {
  const originalCwd = process.cwd()
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sasjs-lint-'))
    fs.writeFileSync(path.join(tmpDir, 'trailing.sas'), "%put 'hello';  \n")
    process.chdir(tmpDir)
    process.projectDir = ''
  })

  afterEach(() => {
    process.chdir(originalCwd)
    process.projectDir = ''
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should resolve a filter string against the current directory when no project is loaded', async () => {
    const result = await processLint(['trailing'])

    expect(result.warnings).toEqual(true)
    expect(result.warningCount).toBeGreaterThan(0)
    expect(result.errors).toEqual(false)
    expect(result.errorCount).toEqual(0)
  })

  it('should still accept an absolute path when no project is loaded', async () => {
    const result = await processLint([path.join(tmpDir, 'trailing.sas')])

    expect(result.warningCount).toBeGreaterThan(0)
  })

  it('should report no findings when the filter matches nothing', async () => {
    const result = await processLint(['no-such-file'])

    expect(result).toEqual({
      warnings: false,
      errors: false,
      warningCount: 0,
      errorCount: 0
    })
  })

  /**
   * `@sasjs/lint` 5.5.7 scans `%unquote`'s argument as code and respects the
   * masks nested inside it, so a call that a mask keeps literal is not an
   * invocation - and reporting one is a finding against code the project never
   * wrote. 5.5.1 only knew `%str` and `%nrstr` as masks, so a `%bquote` inside
   * `%unquote` left the scanner in quoted state and the masked call was reported
   * as undeclared.
   */
  it('should report no finding for macro calls a mask keeps literal', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'masked.sas'),
      '/**\n  @file masked.sas\n  @brief masked calls\n**/\n' +
        '%put %unquote(%str(%fake_one()));\n' +
        '%put %bquote(%fake_two());\n' +
        '%put %unquote(%bquote(%fake_three()));\n'
    )

    const result = await processLint(['masked'])

    expect(result).toEqual({
      warnings: false,
      errors: false,
      warningCount: 0,
      errorCount: 0
    })
  })

  /**
   * The other half of the same policy: `%unquote` resolves its argument, so a
   * call inside it really does run and must still be reported. A scanner that
   * skips `%unquote` wholesale loses that finding instead of the false one.
   */
  it('should report a macro call inside %unquote as an invocation', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'evaluated.sas'),
      '/**\n  @file evaluated.sas\n  @brief evaluated call\n**/\n' +
        '%put %unquote(%fake_visible());\n'
    )

    const result = await processLint(['evaluated'])

    expect(result.warnings).toEqual(true)
    expect(result.warningCount).toBe(1)
    expect(result.errorCount).toEqual(0)
  })

  it('should count errors separately from warnings', async () => {
    fs.writeFileSync(path.join(tmpDir, 'password.sas'), "%put '{SASENC}';  \n")

    const result = await processLint(['password'])

    expect(result.errorCount).toBe(1)
    expect(result.errors).toEqual(true)
    // The trailing spaces and the missing header are both warnings, so the
    // counts stay independent of the error.
    expect(result.warningCount).toBeGreaterThanOrEqual(1)
  })
})

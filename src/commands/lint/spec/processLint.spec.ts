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

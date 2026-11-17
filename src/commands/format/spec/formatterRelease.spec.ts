import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { spawnSync } from 'child_process'

// Run the built executable, not Jest's mocked engine: this also exercises the
// published language bundle and the linter's real fixed-point pipeline.
describe('sasjs format released formatter integration', () => {
  const cli = path.resolve(__dirname, '../../../../build/index.js')
  let dir: string
  let file: string

  const run = (...args: string[]) =>
    spawnSync(process.execPath, [cli, 'format', file, ...args], {
      cwd: dir,
      encoding: 'utf8'
    })

  // `npm run test:mocked` does not build, so a missing artifact would exit 1 for
  // every spawn - which the `--check` assertion reads as the gate working. Fail
  // here, naming the step, rather than reporting the wrong reason.
  beforeAll(() => {
    if (!fs.existsSync(cli))
      throw new Error(
        `The built CLI is missing at ${cli}. Run \`npm run build\` before this suite.`
      )
  })

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sasjs-format-release-'))
    file = path.join(dir, 'regression.sas')
  })

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  it('keeps standalone calls separate and preserves header sample indentation', () => {
    const original = `/**\n  @file regression.sas\n  @example\n      %let x = 1;\n        proc sql; quit;\n**/\n%mp_assert(\n  iftrue=(%mf_existfunction(CAT)=1),\n  desc=Checking if CAT function exists,\n  outds=work.test_results\n)\n\n%mp_assert(\n  iftrue=(%mf_existfunction(DOG)=0),\n  desc=Checking DOG function does not exist,\n  outds=work.test_results\n)\n%let x=1;\n`
    fs.writeFileSync(file, original)
    const check = run('--check')
    expect(check.status).not.toBe(0)
    expect(fs.readFileSync(file, 'utf8')).toBe(original)

    const formatted = run()
    expect(formatted.status).toBe(0)
    const output = fs.readFileSync(file, 'utf8')
    expect(output).toContain('      %let x = 1;\n        proc sql; quit;')
    expect(output).toMatch(/\)\s*\n\s*%mp_assert\(/)
    expect(output).toMatch(/\)\s*\n\s*%let x\s*=\s*1;/)

    const secondCheck = run('--check')
    expect(secondCheck.status).toBe(0)
    expect(fs.readFileSync(file, 'utf8')).toBe(output)
  })
})

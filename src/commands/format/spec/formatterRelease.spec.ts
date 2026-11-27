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

  it('keeps returned macro values separate from their closing do blocks', () => {
    const header = [
      '/**',
      '  @file',
      '  @brief <Your brief here>',
      '',
      '  <h4> SAS Macros </h4>',
      '',
      '**/'
    ]
    const original = [
      ...header,
      '%macro f();',
      '%if &type=N %then %do;',
      '&valn',
      '%end;',
      '%else %if &type=C %then %do;',
      '&valc',
      '%end;',
      '%mend f;',
      ''
    ].join('\n')
    const expected = [
      ...header,
      '%macro f();',
      '  %if &type=N %then %do;',
      '    &valn',
      '  %end;',
      '  %else %if &type=C %then %do;',
      '    &valc',
      '  %end;',
      '%mend f;',
      ''
    ].join('\n')
    fs.writeFileSync(file, original)

    expect(run().status).toBe(0)
    expect(fs.readFileSync(file, 'utf8')).toBe(expected)
    expect(run().status).toBe(0)
    expect(fs.readFileSync(file, 'utf8')).toBe(expected)
    expect(run('--check').status).toBe(0)
  })

  it.each([
    [
      'PARMCARDS4 indented terminator record (sas-language#45)',
      'filename f temp;\nparmcards4;\nalpha\n  ;;;;\n  x   y\n;;;;\n%put TAIL;\n',
      'parmcards4;\nalpha\n  ;;;;\n  x   y\n;;;;\n'
    ],
    [
      'masked parenthesis (sas-language#48)',
      '%let z=%bquote(%();\n%put TAIL;\n',
      '%let z=%bquote(%();'
    ],
    [
      'masked parenthesis in nrbquote (sas-language#48)',
      '%let z=%nrbquote(%();\n%put TAIL;\n',
      '%let z=%nrbquote(%();'
    ]
  ])(
    'preserves %s through the CLI on repeated formatting',
    (_name, input, preserved) => {
      fs.writeFileSync(file, input)
      expect(run().status).toBe(0)
      const formatted = fs.readFileSync(file, 'utf8')
      expect(formatted).toContain(preserved)
      expect(formatted).toContain('%put TAIL;')
      expect(run().status).toBe(0)
      expect(fs.readFileSync(file, 'utf8')).toBe(formatted)
      expect(run('--check').status).toBe(0)
    }
  )

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

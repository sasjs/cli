import path from 'path'
import os from 'os'
import { promises as fs } from 'fs'
import {
  defaultInputPath,
  describeFailure,
  processLogCheck,
  sumTotals
} from '../processLogCheck'
import { defaultLogCheckConfig, LogCheckConfig, ScannedLog } from '../types'

const sasLog = (note: string = 'NOTE: Variable flag is uninitialized.') =>
  `NOTE: Copyright (c) 2016 by SAS Institute Inc., Cary, NC, USA.

1    data work.x;
2      set work.y;
3    run;
ERROR 22-322: Syntax error.
WARNING: Apparent symbolic reference X not resolved.
${note}
`

const cleanLog = `NOTE: Copyright (c) 2016 by SAS Institute Inc., Cary, NC, USA.

1    data work.x;
2      x = 1;
3    run;
`

const warningsOnly = `NOTE: Copyright (c) 2016 by SAS Institute Inc., Cary, NC, USA.

1    data work.x;
2      set work.y;
3    run;
WARNING: Apparent symbolic reference X not resolved.
`

const buildLog = `> tsc -p .
ERROR: Cannot find module './config'
`

const tempFolder = async () =>
  await fs.mkdtemp(path.join(os.tmpdir(), 'sasjs-logcheck-process-'))

const config = (overrides: Partial<LogCheckConfig> = {}): LogCheckConfig => ({
  ...defaultLogCheckConfig,
  ignoreCodes: [],
  ignorePaths: [],
  ...overrides
})

describe('processLogCheck', () => {
  const originalProjectDir = process.projectDir

  afterEach(() => {
    process.projectDir = originalProjectDir
  })

  it('checks every log in the results folder when given no path', async () => {
    const folder = await tempFolder()
    process.projectDir = folder
    await fs.mkdir(path.join(folder, 'sasjsresults'))
    await fs.writeFile(path.join(folder, 'sasjsresults', 'run.log'), sasLog())
    await fs.writeFile(path.join(folder, 'sasjsresults', 'build.log'), buildLog)

    const summary = await processLogCheck({ config: config() })

    expect(summary.usedDefaultInput).toBe(true)
    expect(summary.searched).toEqual(['sasjsresults'])
    expect(summary.logs).toHaveLength(2)
    expect(summary.totals).toEqual({
      errors: 1,
      warnings: 1,
      notes: 1,
      suppressed: 0,
      logs: 1,
      skipped: 1
    })
    expect(summary.skipped).toEqual([
      { displayPath: 'sasjsresults/build.log', reason: 'not a SAS log' }
    ])
    expect(summary.failure).toEqual('1 error')
  })

  it('checks only the paths it was given', async () => {
    const folder = await tempFolder()
    process.projectDir = folder
    await fs.writeFile(path.join(folder, 'one.log'), sasLog())
    await fs.writeFile(path.join(folder, 'two.log'), sasLog())

    const summary = await processLogCheck({
      paths: [path.join(folder, 'one.log')],
      config: config()
    })

    expect(summary.usedDefaultInput).toBe(false)
    expect(summary.logs).toHaveLength(1)
    expect(summary.logs[0].displayPath).toEqual('one.log')
  })

  it('counts a log excluded by ignorePaths as skipped, not as clean', async () => {
    const folder = await tempFolder()
    process.projectDir = folder
    await fs.writeFile(path.join(folder, 'keep.log'), cleanLog)
    await fs.writeFile(path.join(folder, 'legacy.log'), sasLog())

    const summary = await processLogCheck({
      paths: [folder],
      config: config({ ignorePaths: ['legacy.log'] })
    })

    expect(summary.totals.logs).toEqual(1)
    expect(summary.skipped).toEqual([
      { displayPath: 'legacy.log', reason: 'excluded by ignorePaths' }
    ])
    expect(summary.failure).toBeUndefined()
  })

  it('sets a suppressed issue aside without counting it', async () => {
    const folder = await tempFolder()
    process.projectDir = folder
    await fs.writeFile(path.join(folder, 'run.log'), sasLog())

    const summary = await processLogCheck({
      paths: [folder],
      config: config({ ignoreCodes: ['22-322'] })
    })

    expect(summary.totals.errors).toEqual(0)
    expect(summary.totals.suppressed).toEqual(1)
    expect(summary.failure).toBeUndefined()
  })

  it('reports a path that does not exist as a failure', async () => {
    const folder = await tempFolder()
    process.projectDir = folder

    const summary = await processLogCheck({
      paths: [path.join(folder, 'nope.log')],
      config: config()
    })

    expect(summary.missing).toEqual([path.join(folder, 'nope.log')])
    expect(summary.failure).toEqual('1 path not found')
  })

  it('reports the default folder as missing rather than throwing', async () => {
    const folder = await tempFolder()
    process.projectDir = folder

    const summary = await processLogCheck({ config: config() })

    expect(summary.usedDefaultInput).toBe(true)
    expect(summary.failure).toEqual('1 path not found')
  })
})

describe('defaultInputPath', () => {
  const originalProjectDir = process.projectDir

  afterEach(() => {
    process.projectDir = originalProjectDir
  })

  it('is sasjsresults under the project folder', () => {
    process.projectDir = path.join('some', 'project')

    expect(defaultInputPath(config())).toEqual(
      path.resolve(path.join('some', 'project'), 'sasjsresults')
    )
  })

  it('falls back to the working directory when no project is set', () => {
    process.projectDir = undefined as any

    expect(defaultInputPath(config())).toEqual(
      path.resolve(process.cwd(), 'sasjsresults')
    )
  })

  it('honours the folder the config names', () => {
    process.projectDir = 'some/project'

    expect(defaultInputPath(config({ folder: 'logs' }))).toEqual(
      path.resolve('some/project', 'logs')
    )
  })
})

describe('describeFailure', () => {
  const totals = (
    errors: number,
    warnings: number,
    notes: number
  ): ReturnType<typeof sumTotals> => ({
    errors,
    warnings,
    notes,
    suppressed: 0,
    logs: 1,
    skipped: 0
  })

  it('fails on an error under the default policy', () => {
    expect(describeFailure(totals(1, 0, 0), config())).toEqual('1 error')
  })

  it('passes a warning under the default policy', () => {
    expect(describeFailure(totals(0, 3, 0), config())).toBeUndefined()
  })

  it('fails on a warning when the policy says warning', () => {
    expect(
      describeFailure(totals(0, 3, 0), config({ failOn: 'warning' }))
    ).toEqual('3 warnings')
  })

  it('fails on a note only when the policy says note', () => {
    expect(
      describeFailure(totals(0, 0, 2), config({ failOn: 'warning' }))
    ).toBeUndefined()
    expect(
      describeFailure(totals(0, 0, 2), config({ failOn: 'note' }))
    ).toEqual('2 notes')
  })

  it('never fails under the never policy', () => {
    expect(
      describeFailure(totals(9, 9, 9), config({ failOn: 'never' }))
    ).toBeUndefined()
  })

  it('fails when the warnings exceed the budget', () => {
    expect(
      describeFailure(totals(0, 3, 0), config({ maxWarnings: 2 }))
    ).toEqual('3 warnings (budget 2)')
    expect(
      describeFailure(totals(0, 2, 0), config({ maxWarnings: 2 }))
    ).toBeUndefined()
  })

  it('reports a missing path before any issue', () => {
    expect(describeFailure(totals(4, 0, 0), config(), 2)).toEqual(
      '2 paths not found'
    )
  })
})

describe('sumTotals', () => {
  it('treats every log it was given as a file it read', () => {
    expect(
      sumTotals([
        { counts: { errors: 0, warnings: 0, notes: 0 }, suppressed: [] } as any
      ]).skipped
    ).toEqual(0)
  })

  it('adds the counts of the logs it was given', () => {
    const logs = [
      {
        counts: { errors: 2, warnings: 1, notes: 0 },
        suppressed: [{}]
      },
      {
        counts: { errors: 0, warnings: 0, notes: 3 },
        suppressed: []
      }
    ] as ScannedLog[]

    expect(sumTotals(logs, 3)).toEqual({
      errors: 2,
      warnings: 1,
      notes: 3,
      suppressed: 1,
      logs: 2,
      skipped: 1
    })
  })
})

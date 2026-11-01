import path from 'path'
import os from 'os'
import { promises as fs } from 'fs'
import {
  collectLogFiles,
  countIssues,
  partitionIssues,
  scanLogFile,
  toDisplayPath
} from '../collectLogs'
import { defaultLogCheckConfig } from '../types'

const sasLog = `NOTE: Copyright (c) 2016 by SAS Institute Inc., Cary, NC, USA.
NOTE: SAS (r) Proprietary Software 9.4 (TS1M9)

1    data work.x;
2      set work.y;
3    run;
ERROR 22-322: Syntax error, expecting one of the following: ;, RUN, QUIT.
WARNING: Apparent symbolic reference X not resolved.
NOTE: Variable flag is uninitialized.
NOTE: The data set WORK.X has 5 observations and 2 variables.
`

const cleanLog = `NOTE: Copyright (c) 2016 by SAS Institute Inc., Cary, NC, USA.

1    data work.x;
2      x = 1;
3    run;
NOTE: The data set WORK.X has 1 observations and 1 variables.
`

const buildLog = `> tsc -p .
ERROR: Cannot find module './config'
ERROR: Command failed with exit code 2
`

const tempFolder = async () =>
  await fs.mkdtemp(path.join(os.tmpdir(), 'sasjs-logcheck-collect-'))

const writeFiles = async (
  folder: string,
  files: { [name: string]: string }
) => {
  for (const [name, contents] of Object.entries(files)) {
    const filePath = path.join(folder, name)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, contents)
  }
}

describe('collectLogFiles', () => {
  it('returns a single file as it was given', async () => {
    const folder = await tempFolder()
    await writeFiles(folder, { 'run.log': sasLog })

    const { files, missing } = await collectLogFiles([
      path.join(folder, 'run.log')
    ])

    expect(files).toEqual([path.join(folder, 'run.log')])
    expect(missing).toEqual([])
  })

  it('walks a folder, and the folders under it', async () => {
    const folder = await tempFolder()
    await writeFiles(folder, {
      'a.log': sasLog,
      'nested/b.log': sasLog,
      'nested/deep/c.log': sasLog
    })

    const { files } = await collectLogFiles([folder])

    expect(files.map((file) => path.relative(folder, file))).toEqual(
      expect.arrayContaining([
        'a.log',
        path.join('nested', 'b.log'),
        path.join('nested', 'deep', 'c.log')
      ])
    )
    expect(files).toHaveLength(3)
  })

  it('does not walk into node_modules', async () => {
    const folder = await tempFolder()
    await writeFiles(folder, {
      'a.log': sasLog,
      'node_modules/pkg/b.log': sasLog
    })

    const { files } = await collectLogFiles([folder])

    expect(files).toHaveLength(1)
    expect(files[0]).toEqual(path.join(folder, 'a.log'))
  })

  it('reports a folder it cannot list instead of treating it as empty', async () => {
    const folder = await tempFolder()
    await writeFiles(folder, { 'logs/a.log': sasLog })
    const readdir = jest
      .spyOn(require('fs/promises'), 'readdir')
      .mockRejectedValue(Object.assign(new Error('denied'), { code: 'EACCES' }))

    const { files, unreadable } = await collectLogFiles([
      path.join(folder, 'logs')
    ])

    readdir.mockRestore()

    expect(files).toEqual([])
    expect(unreadable).toHaveLength(1)
    expect(unreadable[0].reason).toEqual('could not be listed (EACCES)')
  })

  it('reports a path that does not exist instead of failing', async () => {
    const folder = await tempFolder()

    const { files, missing } = await collectLogFiles([
      path.join(folder, 'nope.log')
    ])

    expect(files).toEqual([])
    expect(missing).toEqual([path.join(folder, 'nope.log')])
  })

  it('lists the same file once when a file and its folder are both named', async () => {
    const folder = await tempFolder()
    await writeFiles(folder, { 'a.log': sasLog })

    const { files } = await collectLogFiles([
      folder,
      path.join(folder, 'a.log')
    ])

    expect(files).toEqual([path.join(folder, 'a.log')])
  })

  it('sorts the files so two runs produce the same report', async () => {
    const folder = await tempFolder()
    await writeFiles(folder, { 'b.log': sasLog, 'a.log': sasLog })

    const { files } = await collectLogFiles([folder])

    expect(files.map((file) => path.basename(file))).toEqual(['a.log', 'b.log'])
  })
})

describe('toDisplayPath', () => {
  const originalProjectDir = process.projectDir

  afterEach(() => {
    process.projectDir = originalProjectDir
  })

  it('is relative to the project folder', () => {
    process.projectDir = path.join('project', 'root')

    expect(
      toDisplayPath(path.join('project', 'root', 'sasjsresults', 'run.log'))
    ).toEqual('sasjsresults/run.log')
  })

  it('is absolute for a file outside the project folder', () => {
    process.projectDir = path.join(os.tmpdir(), 'sasjs-logcheck-project')
    const outside = path.join(os.tmpdir(), 'elsewhere', 'run.log')

    expect(toDisplayPath(outside)).toEqual(outside.split(path.sep).join('/'))
  })
})

describe('scanLogFile', () => {
  it('reports the issues a SAS log carries', async () => {
    const folder = await tempFolder()
    const filePath = path.join(folder, 'run.log')
    await fs.writeFile(filePath, sasLog)

    const log = await scanLogFile(filePath, defaultLogCheckConfig)

    expect(log.skippedReason).toBeUndefined()
    expect(log.counts).toEqual({ errors: 1, warnings: 1, notes: 1 })
    expect(log.issues.map((issue) => issue.severity)).toEqual([
      'error',
      'warning',
      'note'
    ])
  })

  it('reports a clean log as checked, with nothing in it', async () => {
    const folder = await tempFolder()
    const filePath = path.join(folder, 'clean.log')
    await fs.writeFile(filePath, cleanLog)

    const log = await scanLogFile(filePath, defaultLogCheckConfig)

    expect(log.skippedReason).toBeUndefined()
    expect(log.counts).toEqual({ errors: 0, warnings: 0, notes: 0 })
  })

  it('skips a log another tool wrote', async () => {
    const folder = await tempFolder()
    const filePath = path.join(folder, 'build.log')
    await fs.writeFile(filePath, buildLog)

    const log = await scanLogFile(filePath, defaultLogCheckConfig)

    expect(log.skippedReason).toEqual('not a SAS log')
    expect(log.issues).toEqual([])
  })

  it('reports a path that is not a file', async () => {
    const folder = await tempFolder()

    const log = await scanLogFile(folder, defaultLogCheckConfig)

    expect(log.skippedReason).toEqual('not a file')
  })

  it('reports a file that vanished before it could be read', async () => {
    const folder = await tempFolder()

    const log = await scanLogFile(
      path.join(folder, 'missing.log'),
      defaultLogCheckConfig
    )

    expect(log.skippedReason).toEqual('could not be read')
  })

  it('sets a suppressed issue aside instead of reporting it', async () => {
    const folder = await tempFolder()
    const filePath = path.join(folder, 'run.log')
    await fs.writeFile(filePath, sasLog)

    const log = await scanLogFile(filePath, {
      ...defaultLogCheckConfig,
      ignoreCodes: ['22-322']
    })

    expect(log.issues.map((issue) => issue.severity)).toEqual([
      'warning',
      'note'
    ])
    expect(log.suppressed).toHaveLength(1)
    expect(log.suppressed[0].code).toEqual('22-322')
    expect(log.counts).toEqual({ errors: 0, warnings: 1, notes: 1 })
  })
})

describe('partitionIssues', () => {
  const issues = [
    {
      line: 0,
      endLine: 0,
      column: 0,
      endColumn: 5,
      severity: 'error' as const,
      code: '22-322',
      message: 'Syntax error'
    },
    {
      line: 1,
      endLine: 1,
      column: 0,
      endColumn: 5,
      severity: 'warning' as const,
      message: 'Apparent symbolic reference'
    },
    {
      line: 2,
      endLine: 2,
      column: 0,
      endColumn: 5,
      severity: 'note' as const,
      code: '49-169',
      message: 'Line was truncated'
    }
  ]

  it('keeps every issue when nothing is suppressed', () => {
    const { issues: kept, suppressed } = partitionIssues(issues, [])

    expect(kept).toHaveLength(3)
    expect(suppressed).toHaveLength(0)
  })

  it('suppresses by message code, and leaves an uncoded issue alone', () => {
    const { issues: kept, suppressed } = partitionIssues(issues, [
      '22-322',
      '49-169'
    ])

    expect(kept).toHaveLength(1)
    expect(kept[0].severity).toEqual('warning')
    expect(suppressed).toHaveLength(2)
  })
})

describe('countIssues', () => {
  it('counts by severity', () => {
    expect(
      countIssues([
        { severity: 'error' } as any,
        { severity: 'error' } as any,
        { severity: 'warning' } as any,
        { severity: 'note' } as any
      ])
    ).toEqual({ errors: 2, warnings: 1, notes: 1 })
  })
})

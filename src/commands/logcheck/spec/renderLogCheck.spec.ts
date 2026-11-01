import {
  columns,
  fileFails,
  lineLabel,
  severityLabel,
  renderHuman,
  renderLogCheck,
  summarise,
  toAnnotations,
  toJson,
  truncate
} from '../renderLogCheck'
import { defaultLogCheckConfig, LogCheckSummary, ScannedLog } from '../types'

const config = defaultLogCheckConfig

const issue = (overrides: any = {}) => ({
  line: 11,
  endLine: 11,
  column: 4,
  endColumn: 20,
  severity: 'error' as const,
  message: 'Syntax error, expecting one of the following',
  ...overrides
})

const log = (overrides: Partial<ScannedLog> = {}): ScannedLog => ({
  filePath: '/project/sasjsresults/run.log',
  displayPath: 'sasjsresults/run.log',
  issues: [],
  suppressed: [],
  counts: { errors: 0, warnings: 0, notes: 0 },
  ...overrides
})

const summary = (
  overrides: Partial<LogCheckSummary> = {}
): LogCheckSummary => ({
  logs: [],
  skipped: [],
  missing: [],
  usedDefaultInput: false,
  searched: ['sasjsresults'],
  totals: {
    errors: 0,
    warnings: 0,
    notes: 0,
    suppressed: 0,
    logs: 0,
    skipped: 0
  },
  ...overrides
})

const setupLogger = () => {
  const logger = {
    log: jest.fn(),
    table: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    success: jest.fn()
  }

  process.logger = logger as any

  return {
    logger,
    output: () => logger.log.mock.calls.map((call) => call[0]).join('\n')
  }
}

describe('renderHuman', () => {
  afterEach(() => {
    process.logger = undefined as any
  })

  it('prints a file table, the issues and the verdict', () => {
    const { output } = setupLogger()

    renderHuman(
      summary({
        logs: [
          log({
            issues: [issue()],
            counts: { errors: 1, warnings: 0, notes: 0 }
          })
        ],
        totals: {
          errors: 1,
          warnings: 0,
          notes: 0,
          suppressed: 0,
          logs: 1,
          skipped: 0
        },
        failure: '1 error'
      }),
      config
    )

    const printed = output()

    expect(printed).toContain('SASjs logcheck')
    expect(printed).toContain('sasjsresults/run.log')
    expect(printed).toContain('FAIL')
    expect(printed).toContain('12:5')
    expect(printed).toContain('Syntax error, expecting one of the following')
    expect(printed).toContain('1 error in 1 log')
    expect(printed).toContain('Logcheck failed: 1 error')
  })

  it('says so when the policy is not to fail', () => {
    const { output } = setupLogger()

    renderHuman(
      summary({
        logs: [
          log({
            issues: [issue()],
            counts: { errors: 1, warnings: 0, notes: 0 }
          })
        ],
        totals: {
          errors: 1,
          warnings: 0,
          notes: 0,
          suppressed: 0,
          logs: 1,
          skipped: 0
        }
      }),
      { ...config, failOn: 'never' }
    )

    expect(output()).toContain('Logcheck passed (fail-on: never)')
  })

  it('reports the suppressed issues as a count, with the codes', () => {
    const { output } = setupLogger()

    renderHuman(
      summary({
        logs: [
          log({
            issues: [issue()],
            suppressed: [issue({ code: '49-169' })],
            counts: { errors: 1, warnings: 0, notes: 0 }
          })
        ],
        totals: {
          errors: 1,
          warnings: 0,
          notes: 0,
          suppressed: 1,
          logs: 1,
          skipped: 0
        }
      }),
      { ...config, ignoreCodes: ['49-169'] }
    )

    expect(output()).toContain('1 issue suppressed by message code (49-169)')
  })

  it('names a missing path, and hints when it was the default', () => {
    const { output } = setupLogger()

    renderHuman(
      summary({
        missing: ['sasjsresults'],
        usedDefaultInput: true,
        failure: '1 path not found'
      }),
      config
    )

    const printed = output()

    expect(printed).toContain('Path not found: sasjsresults')
    expect(printed).toContain('nothing has run yet, or pass a path')
    expect(printed).not.toContain('No logs found at the path searched.')
  })

  it('says when a folder holds nothing to check', () => {
    const { output } = setupLogger()

    renderHuman(summary(), config)

    expect(output()).toContain('No logs found at the path searched.')
  })

  it('counts the skipped files, and lists them only when asked', () => {
    const { output } = setupLogger()
    const withSkips = summary({
      logs: [log({ counts: { errors: 0, warnings: 0, notes: 0 } })],
      skipped: [
        { displayPath: 'sasjsresults/build.log', reason: 'not a SAS log' }
      ],
      totals: {
        errors: 0,
        warnings: 0,
        notes: 0,
        suppressed: 0,
        logs: 1,
        skipped: 1
      }
    })

    renderHuman(withSkips, config)

    expect(output()).toContain('1 file skipped')
    expect(output()).not.toContain('SKIPPED FILE')

    const verbose = setupLogger()
    renderHuman(withSkips, config, true)

    expect(verbose.output()).toContain('SKIPPED FILE')
    expect(verbose.output()).toContain('sasjsresults/build.log')
  })
})

describe('fileFails', () => {
  it('fails a log carrying an error under the default policy', () => {
    expect(fileFails({ errors: 1, warnings: 0, notes: 0 }, config)).toBe(true)
    expect(fileFails({ errors: 0, warnings: 4, notes: 4 }, config)).toBe(false)
  })

  it('follows the policy for warnings and notes', () => {
    const warning = { errors: 0, warnings: 1, notes: 0 }
    const note = { errors: 0, warnings: 0, notes: 1 }

    expect(fileFails(warning, { ...config, failOn: 'warning' })).toBe(true)
    expect(fileFails(warning, { ...config, failOn: 'note' })).toBe(true)
    expect(fileFails(note, { ...config, failOn: 'warning' })).toBe(false)
    expect(fileFails(note, { ...config, failOn: 'note' })).toBe(true)
  })

  it('fails nothing under the never policy', () => {
    expect(
      fileFails(
        { errors: 9, warnings: 9, notes: 9 },
        { ...config, failOn: 'never' }
      )
    ).toBe(false)
  })

  it('does not apply the run-wide warnings budget to one log', () => {
    expect(
      fileFails(
        { errors: 0, warnings: 3, notes: 0 },
        { ...config, maxWarnings: 1 }
      )
    ).toBe(false)
  })
})

describe('columns', () => {
  it('pads each column to the widest cell and underlines the head', () => {
    const lines = columns(
      [
        ['a.log', '3'],
        ['much-longer-name.log', '12']
      ],
      ['FILE', 'ERRORS']
    )

    expect(lines).toEqual([
      'FILE                  ERRORS',
      '--------------------  ------',
      'a.log                 3',
      'much-longer-name.log  12'
    ])
  })

  it('measures colour codes as no width at all', () => {
    const coloured = '\u001b[31mred\u001b[39m'
    const lines = columns([[coloured]], ['HEADER'])

    expect(lines[1]).toEqual('------')
  })

  it('indents every line it returns', () => {
    const lines = columns([['a']], ['A'], '  ', '    ')

    expect(lines.every((line) => line.startsWith('    '))).toBe(true)
  })
})

describe('truncate', () => {
  it('leaves a short message alone', () => {
    expect(truncate('Syntax error')).toEqual('Syntax error')
  })

  it('collapses the whitespace SAS wrapped', () => {
    expect(truncate('a message\n      wrapped by SAS')).toEqual(
      'a message wrapped by SAS'
    )
  })

  it('cuts a long message on a word boundary', () => {
    const message = 'word '.repeat(40).trim()

    const cut = truncate(message)

    expect(cut.length).toBeLessThanOrEqual(110)
    expect(cut.endsWith('...')).toBe(true)
    expect(cut).not.toContain('  ')
    expect(message.startsWith(cut.replace('...', '').trim())).toBe(true)
  })
})

describe('severityLabel', () => {
  it('states the severity in words', () => {
    expect(severityLabel('error')).toEqual('error')
    expect(severityLabel('warning')).toEqual('warning')
    expect(severityLabel('note')).toEqual('note')
  })
})

describe('lineLabel', () => {
  it('is one-based, and names the range a message was wrapped over', () => {
    expect(lineLabel(issue())).toEqual('12:5')
    expect(lineLabel(issue({ endLine: 14 }))).toEqual('12-15:5')
  })
})

describe('summarise', () => {
  it('states what was found and over how many logs', () => {
    expect(
      summarise(
        summary({
          totals: {
            errors: 2,
            warnings: 1,
            notes: 0,
            suppressed: 0,
            logs: 2,
            skipped: 0
          }
        }),
        2
      )
    ).toEqual('2 errors, 1 warning in 2 logs')
  })

  it('says so when there is nothing to report', () => {
    expect(
      summarise(
        summary({
          totals: {
            errors: 0,
            warnings: 0,
            notes: 0,
            suppressed: 0,
            logs: 1,
            skipped: 0
          }
        }),
        1
      )
    ).toEqual('No issues in 1 log')
  })

  it('names the files it read out of the files it saw', () => {
    expect(
      summarise(
        summary({
          totals: {
            errors: 1,
            warnings: 0,
            notes: 0,
            suppressed: 0,
            logs: 1,
            skipped: 2
          }
        }),
        1
      )
    ).toEqual('1 error in 1 of 3 files')
  })
})

describe('toJson', () => {
  it('states line and column from one', () => {
    const json = toJson(
      summary({
        logs: [
          log({
            issues: [issue({ code: '22-322' })],
            counts: { errors: 1, warnings: 0, notes: 0 }
          })
        ]
      }),
      config
    )

    expect(json.logs[0].issues[0]).toEqual({
      line: 12,
      endLine: 12,
      column: 5,
      endColumn: 21,
      severity: 'error',
      code: '22-322',
      message: 'Syntax error, expecting one of the following'
    })
  })

  it('leaves out a code an issue does not carry', () => {
    const json = toJson(summary({ logs: [log({ issues: [issue()] })] }), config)

    expect(json.logs[0].issues[0]).not.toHaveProperty('code')
  })

  it('carries the counts, the policy and the verdict', () => {
    const json = toJson(
      summary({
        logs: [
          log({
            issues: [issue()],
            counts: { errors: 1, warnings: 0, notes: 0 },
            skippedReason: undefined
          })
        ],
        skipped: [{ displayPath: 'build.log', reason: 'not a SAS log' }],
        totals: {
          errors: 1,
          warnings: 0,
          notes: 0,
          suppressed: 0,
          logs: 1,
          skipped: 1
        },
        failure: '1 error'
      }),
      { ...config, maxWarnings: 2 }
    )

    expect(json.summary).toEqual({
      logs: 1,
      skipped: 1,
      errors: 1,
      warnings: 0,
      notes: 0,
      suppressed: 0,
      failed: true,
      failure: '1 error'
    })
    expect(json.config.maxWarnings).toEqual(2)
    expect(json.skipped).toEqual([
      { file: 'build.log', reason: 'not a SAS log' }
    ])
  })
})

describe('toAnnotations', () => {
  it('writes one workflow command per issue, with one-based positions', () => {
    const annotations = toAnnotations(
      summary({
        logs: [
          log({
            issues: [
              issue({ code: '22-322' }),
              issue({ severity: 'warning', message: 'Symbol not resolved' }),
              issue({ severity: 'note', message: 'Division by zero' })
            ]
          })
        ]
      })
    )

    expect(annotations).toEqual([
      '::error file=sasjsresults/run.log,line=12,col=5,endLine=12,endColumn=21,title=SAS ERROR 22-322::Syntax error, expecting one of the following',
      '::warning file=sasjsresults/run.log,line=12,col=5,endLine=12,endColumn=21,title=SAS WARNING::Symbol not resolved',
      '::notice file=sasjsresults/run.log,line=12,col=5,endLine=12,endColumn=21,title=SAS NOTE::Division by zero'
    ])
  })

  it('escapes what a workflow command reads as syntax', () => {
    const annotations = toAnnotations(
      summary({
        logs: [
          log({
            displayPath: 'logs/with,comma.log',
            issues: [issue({ message: '100% wrong\nsecond line' })]
          })
        ]
      })
    )

    expect(annotations[0]).toContain('file=logs/with%2Ccomma.log')
    expect(annotations[0]).toContain('::100%25 wrong%0Asecond line')
  })
})

describe('renderLogCheck', () => {
  afterEach(() => {
    jest.restoreAllMocks()
    process.logger = undefined as any
  })

  it('writes JSON to stdout, and nothing through the logger', () => {
    const { logger } = setupLogger()
    const write = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true)

    renderLogCheck(summary(), config, { format: 'json' })

    expect(write).toHaveBeenCalled()
    expect(JSON.parse(String(write.mock.calls[0][0])).tool).toEqual(
      'sasjs logcheck'
    )
    expect(logger.log).not.toHaveBeenCalled()
  })

  it('writes annotations to stdout, and nothing when there are none', () => {
    const write = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true)

    renderLogCheck(summary({ logs: [log({ issues: [issue()] })] }), config, {
      format: 'annotations'
    })
    expect(String(write.mock.calls[0][0])).toContain('::error file=')

    write.mockClear()

    renderLogCheck(summary(), config, { format: 'annotations' })
    expect(write).not.toHaveBeenCalled()
  })

  it('prints the human report by default', () => {
    const { output } = setupLogger()

    renderLogCheck(summary(), config)

    expect(output()).toContain('SASjs logcheck')
  })
})

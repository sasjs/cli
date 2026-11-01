import chalk from 'chalk'
import { LogIssue } from '@sasjs/utils/logs'
import {
  defaultLogCheckConfig,
  LogCheckConfig,
  LogCheckSummary,
  OutputFormat,
  ScannedLog
} from './types'

/** Longest message shown in the human report before it is cut short. */
export const MAX_MESSAGE_WIDTH = 110

/** Blank line between two blocks of the human report. */
const GAP = ''

/** An issue as a report states it: line and column counted from one. */
export interface ReportIssue {
  line: number
  endLine: number
  column: number
  endColumn: number
  severity: LogIssue['severity']
  code?: string
  message: string
}

export interface RenderOptions {
  format?: OutputFormat
  /** List every file that was skipped, rather than just counting them. */
  verbose?: boolean
}

/**
 * Prints the result in the requested format.
 *
 * The three formats are three views of one summary, never three scans: the
 * terminal report, the JSON document and the CI annotations must all be
 * describing the same parse, or they will disagree about the same log.
 */
export const renderLogCheck = (
  summary: LogCheckSummary,
  config: LogCheckConfig,
  options: RenderOptions = {}
): void => {
  const format = options.format || 'human'

  if (format === 'json') {
    process.stdout.write(
      `${JSON.stringify(toJson(summary, config), null, 2)}\n`
    )
    return
  }

  if (format === 'annotations') {
    const lines = toAnnotations(summary)
    if (lines.length) process.stdout.write(`${lines.join('\n')}\n`)
    return
  }

  renderHuman(summary, config, options.verbose || false)
}

/**
 * The human report: what was checked, what was found, and the verdict.
 *
 * Colour carries severity and nothing else, so a reader scanning for trouble
 * has one thing to look at, and the same report pasted into a ticket or
 * piped into a log file without a terminal is still readable.
 */
export const renderHuman = (
  summary: LogCheckSummary,
  config: LogCheckConfig,
  verbose: boolean = false
): void => {
  const lines: string[] = []

  lines.push(
    `${chalk.bold('SASjs logcheck')}${chalk.dim(
      summary.searched.length ? `  ${summary.searched.join(', ')}` : ''
    )}`
  )
  lines.push(GAP)

  for (const missing of summary.missing) {
    lines.push(
      chalk.red(`  Path not found: ${missing}`) +
        (summary.usedDefaultInput
          ? chalk.dim('  - nothing has run yet, or pass a path')
          : '')
    )
  }

  for (const folder of summary.unreadable) {
    lines.push(
      chalk.red(`  Could not read: ${folder.displayPath}`) +
        chalk.dim(`  (${folder.reason}) - its logs were not checked`)
    )
  }

  const scanned = summary.logs.filter((entry) => !entry.skippedReason)

  if (!scanned.length) {
    if (!summary.missing.length) {
      lines.push(
        summary.skipped.length
          ? chalk.yellow('  No SAS logs found - every file was skipped.')
          : chalk.yellow('  No logs found at the path searched.')
      )
    }
  } else {
    lines.push(...fileSummary(scanned, config))
    lines.push(...skippedLines(summary, verbose))

    const details = issueDetails(scanned)
    if (details.length) lines.push(GAP, ...details)

    lines.push(GAP)
    lines.push(`  ${summarise(summary, scanned.length)}`)

    if (summary.totals.suppressed) {
      lines.push(
        chalk.dim(
          `  ${plural(summary.totals.suppressed, 'issue')} suppressed by message code${
            config.ignoreCodes.length
              ? ` (${config.ignoreCodes.join(', ')})`
              : ''
          }`
        )
      )
    }
  }

  if (summary.failure) {
    lines.push(
      `${chalk.red.bold('  Logcheck failed: ')}${chalk.red(summary.failure)}` +
        chalk.dim(`  (fail-on: ${config.failOn})`)
    )
  } else if (scanned.length) {
    lines.push(chalk.green(`  Logcheck passed (fail-on: ${config.failOn})`))
  }

  lines.push('')

  process.logger?.log(lines.join('\n'))
}

/** The one-line-per-file table: what each log carried, and whether it failed. */
export const fileSummary = (
  scanned: ScannedLog[],
  config: LogCheckConfig = defaultLogCheckConfig
): string[] => {
  const rows = scanned.map((entry) => [
    entry.displayPath,
    countCell(entry.counts.errors, chalk.red),
    countCell(entry.counts.warnings, chalk.yellow),
    countCell(entry.counts.notes, chalk.cyan),
    fileFails(entry.counts, config)
      ? chalk.red.bold('FAIL')
      : chalk.green('pass')
  ])

  return columns(rows, ['FILE', 'ERRORS', 'WARNINGS', 'NOTES', 'STATUS'], '  ')
}

/**
 * Whether a single log breaks the policy.
 *
 * The warnings budget is deliberately not applied here: it is a budget for the
 * whole run, so a log carrying three warnings is not the one that broke it.
 */
export const fileFails = (
  counts: ScannedLog['counts'],
  config: LogCheckConfig
): boolean => {
  if (config.failOn === 'never') return false
  if (counts.errors) return true
  if (config.failOn === 'warning' || config.failOn === 'note') {
    if (counts.warnings) return true
  }

  return config.failOn === 'note' && counts.notes > 0
}

/**
 * The issues themselves, grouped under the log they came from.
 *
 * This is the shape a compiler prints and a reader already knows how to scan:
 * the file once, then `line:column`, the severity, the SAS code where there is
 * one, and the message.
 */
export const issueDetails = (scanned: ScannedLog[]): string[] => {
  const blocks: string[][] = []

  for (const entry of scanned) {
    if (!entry.issues.length) continue

    blocks.push([
      chalk.bold(`  ${entry.displayPath}`),
      ...columns(
        entry.issues.map((issue) => [
          lineLabel(issue),
          severityLabel(issue.severity),
          issue.code || chalk.dim('-'),
          truncate(issue.message)
        ]),
        ['LINE:COL', 'SEVERITY', 'CODE', 'MESSAGE'],
        '  ',
        '    '
      )
    ])
  }

  // One blank between two logs' issues, none after the last: the caller adds
  // the gap before the summary line, and two would leave a hole in the report.
  return blocks.reduce<string[]>(
    (lines, block, index) =>
      index === blocks.length - 1
        ? [...lines, ...block]
        : [...lines, ...block, GAP],
    []
  )
}

const skippedLines = (summary: LogCheckSummary, verbose: boolean): string[] => {
  if (!summary.skipped.length) return []

  if (!verbose) {
    return [
      GAP,
      chalk.dim(
        `  ${plural(summary.skipped.length, 'file')} skipped (not a SAS log, or excluded) - rerun with --verbose to list them.`
      )
    ]
  }

  return [
    GAP,
    ...columns(
      summary.skipped.map((entry) => [
        chalk.dim(entry.displayPath),
        chalk.dim(entry.reason)
      ]),
      ['SKIPPED FILE', 'REASON'],
      '  ',
      '  '
    )
  ]
}

/**
 * Lays rows out in aligned columns, with the header underlined by dashes.
 *
 * Colour codes take no space on screen, so widths are measured on the text
 * with the codes removed - otherwise every coloured cell is padded by the
 * length of its own escape sequences and the table drifts.
 */
export const columns = (
  rows: string[][],
  head: string[],
  gap: string = '  ',
  indent: string = ''
): string[] => {
  const widths: number[] = []

  const measure = (row: string[]) =>
    row.forEach((cell, index) => {
      widths[index] = Math.max(widths[index] || 0, visibleLength(cell))
    })

  measure(head.map((header) => chalk.white.bold(header)))
  rows.forEach(measure)

  const render = (row: string[]) =>
    `${indent}${row
      .map(
        (cell, index) =>
          cell + ' '.repeat(Math.max(0, widths[index] - visibleLength(cell)))
      )
      .join(gap)
      .trimEnd()}`

  return [
    render(head.map((header) => chalk.white.bold(header))),
    `${indent}${widths.map((width) => '-'.repeat(width)).join(gap)}`,
    ...rows.map(render)
  ]
}

const visibleLength = (value: string): number =>
  value.replace(/\u001b\[[0-9;]*m/g, '').length

/** `13:5` for a one-line message, `13-15:5` for one SAS wrapped. */
export const lineLabel = (issue: LogIssue): string =>
  issue.endLine > issue.line
    ? `${issue.line + 1}-${issue.endLine + 1}:${issue.column + 1}`
    : `${issue.line + 1}:${issue.column + 1}`

export const severityLabel = (severity: LogIssue['severity']): string => {
  if (severity === 'error') return chalk.red.bold('error')
  if (severity === 'warning') return chalk.yellow.bold('warning')

  return chalk.cyan.bold('note')
}

/** Trims a message to the report width, on a word boundary where there is one. */
export const truncate = (message: string): string => {
  const flat = message.replace(/\s+/g, ' ').trim()

  if (flat.length <= MAX_MESSAGE_WIDTH) return flat

  const cut = flat.slice(0, MAX_MESSAGE_WIDTH - 3)
  const boundary = cut.lastIndexOf(' ')

  return `${boundary > 0 ? cut.slice(0, boundary) : cut}...`
}

const countCell = (count: number, colour: (text: string) => string): string =>
  count ? colour(String(count)) : chalk.dim('0')

/**
 * The one-line answer: what was found, and over how many logs.
 *
 * It names the logs that were checked rather than the files that were not,
 * because the number a reader compares against is the size of the result they
 * have just looked at.
 */
export const summarise = (
  summary: LogCheckSummary,
  scannedCount: number
): string => {
  const { errors, warnings, notes, logs, skipped } = summary.totals
  const parts: string[] = []

  if (errors) parts.push(plural(errors, 'error'))
  if (warnings) parts.push(plural(warnings, 'warning'))
  if (notes) parts.push(plural(notes, 'note'))

  const scope =
    skipped > 0 ? `${logs} of ${logs + skipped} files` : plural(logs, 'log')

  return parts.length
    ? `${parts.join(', ')} in ${scope}`
    : `No issues in ${scope}`
}

/**
 * The machine report.
 *
 * Line and column are one-based here, as an editor and a CI annotation count
 * them, while the parser works in indexes - the conversion happens once, at
 * this boundary, so no consumer has to remember which convention it holds.
 */
export const toJson = (summary: LogCheckSummary, config: LogCheckConfig) => ({
  tool: 'sasjs logcheck',
  version: 1,
  config: {
    failOn: config.failOn,
    maxWarnings: config.maxWarnings ?? null,
    ignoreCodes: config.ignoreCodes,
    ignorePaths: config.ignorePaths
  },
  summary: {
    logs: summary.totals.logs,
    skipped: summary.totals.skipped,
    errors: summary.totals.errors,
    warnings: summary.totals.warnings,
    notes: summary.totals.notes,
    suppressed: summary.totals.suppressed,
    failed: !!summary.failure,
    failure: summary.failure ?? null
  },
  searched: summary.searched,
  missing: summary.missing,
  unreadable: summary.unreadable.map((folder) => ({
    folder: folder.displayPath,
    reason: folder.reason
  })),
  logs: summary.logs.map((entry) => ({
    file: entry.displayPath,
    errors: entry.counts.errors,
    warnings: entry.counts.warnings,
    notes: entry.counts.notes,
    suppressed: entry.suppressed.length,
    skipped: entry.skippedReason ?? null,
    issues: entry.issues.map(toReportIssue)
  })),
  skipped: summary.skipped.map((entry) => ({
    file: entry.displayPath,
    reason: entry.reason
  }))
})

export const toReportIssue = (issue: LogIssue): ReportIssue => ({
  line: issue.line + 1,
  endLine: issue.endLine + 1,
  column: issue.column + 1,
  endColumn: issue.endColumn + 1,
  severity: issue.severity,
  ...(issue.code ? { code: issue.code } : {}),
  message: issue.message
})

/**
 * GitHub Actions annotations, one line per issue.
 *
 * The workflow commands escape three characters in the message and five in the
 * properties; doing it here means SAS's own text arrives intact, commas and
 * colons included.
 */
export const toAnnotations = (summary: LogCheckSummary): string[] =>
  summary.logs.flatMap((entry) =>
    entry.issues.map((issue) => {
      const properties = [
        `file=${escapeProperty(entry.displayPath)}`,
        `line=${issue.line + 1}`,
        `col=${issue.column + 1}`,
        `endLine=${issue.endLine + 1}`,
        `endColumn=${issue.endColumn + 1}`,
        `title=${escapeProperty(
          `SAS ${issue.severity.toUpperCase()}${issue.code ? ` ${issue.code}` : ''}`
        )}`
      ].join(',')

      return `::${annotationLevel(issue.severity)} ${properties}::${escapeData(
        issue.message
      )}`
    })
  )

const annotationLevel = (severity: LogIssue['severity']): string =>
  severity === 'error' ? 'error' : severity === 'warning' ? 'warning' : 'notice'

const escapeData = (value: string): string =>
  value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')

const escapeProperty = (value: string): string =>
  escapeData(value).replace(/:/g, '%3A').replace(/,/g, '%2C')

const plural = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? '' : 's'}`

import { parseLog } from '@sasjs/utils/logs'
import chalk from 'chalk'
import { countIssues, partitionIssues } from '../commands/logcheck/collectLogs'
import { readLogCheckConfig } from '../commands/logcheck/logCheckConfig'
import { describeFailure } from '../commands/logcheck/processLogCheck'
import {
  columns,
  lineLabel,
  severityLabel,
  truncate
} from '../commands/logcheck/renderLogCheck'
import { IssueCounts, LogCheckConfig } from '../commands/logcheck/types'

/**
 * How the log a command just received is treated.
 *
 * `auto` decides from `logCheck.autoCheck` in the project config, which is off
 * by default; `on` and `off` are the `--logcheck` / `--no-logcheck` flags. The
 * distinction matters because the two halves of the behaviour are separate:
 * reporting what SAS printed is always worth doing, while changing the exit
 * code of a command whose status a pipeline already trusts is not something to
 * do behind a project's back.
 */
export type LogCheckMode = 'auto' | 'on' | 'off'

let mode: LogCheckMode = 'auto'

export const setLogCheckMode = (value: LogCheckMode): void => {
  mode = value
}

export const getLogCheckMode = (): LogCheckMode => mode

/** Reads a tri-state yargs boolean: absent is `undefined`, not `false`. */
export const logCheckModeOf = (flag: unknown): LogCheckMode =>
  flag === true ? 'on' : flag === false ? 'off' : 'auto'

/**
 * A run whose log broke the policy, once `autoCheck` or `--logcheck` asked for
 * the verdict to count.
 *
 * It is an error rather than a return value because it is raised several
 * frames below the command, from whichever executor received the log, and the
 * command is the only place that can turn it into an exit code.
 */
export class LogCheckFailure extends Error {
  /**
   * Marker rather than `instanceof`: the CLI is compiled to a target where a
   * subclass of a built-in loses its prototype chain, so `instanceof` answers
   * false in the built artefact while answering true under the test transform.
   * The flag is read by {@link isLogCheckFailure} and cannot be faked by an
   * unrelated error.
   */
  readonly logCheckFailure = true

  constructor(message: string) {
    super(message)
    this.name = 'LogCheckFailure'
  }
}

export const isLogCheckFailure = (error: unknown): error is LogCheckFailure =>
  (error as LogCheckFailure | undefined)?.logCheckFailure === true

/**
 * Reports the issues in a log a command just received, and throws when the
 * policy says the run should fail.
 *
 * Nothing is printed for a clean log: the commands this runs inside already
 * have their own success output, and a check that announces itself on every
 * green run is noise that gets switched off.
 */
export const checkLog = async (
  logText: string | undefined | null,
  label: string
): Promise<void> => {
  if (mode === 'off' || !logText) return

  let config: LogCheckConfig

  try {
    config = await readLogCheckConfig()
  } catch (error) {
    // An automatic check must never break the command it is riding on: a
    // config it cannot read is worth a warning, not a failed run.
    process.logger?.warn(
      `Skipping the SAS log check: ${(error as Error).message}`
    )

    return
  }

  const { issues, suppressed } = partitionIssues(
    parseLog(logText),
    config.ignoreCodes
  )

  if (!issues.length) return

  const counts = countIssues(issues)
  const failing = mode === 'on' || config.autoCheck === true
  const totals = {
    ...counts,
    suppressed: suppressed.length,
    logs: 1,
    skipped: 0
  }
  const failure = failing ? describeFailure(totals, config) : undefined

  renderInline(label, issues, counts, suppressed.length, config, failure)

  if (failure) {
    throw new LogCheckFailure(`SAS log check failed for ${label}: ${failure}`)
  }
}

/**
 * The inline report: the heading, the issues, and the verdict when there is
 * one. Deliberately narrower than the `logcheck` report - there is one log
 * here and its name is already on screen, so there is no file table.
 */
const renderInline = (
  label: string,
  issues: ReturnType<typeof parseLog>,
  counts: IssueCounts,
  suppressedCount: number,
  config: LogCheckConfig,
  failure: string | undefined
): void => {
  const lines: string[] = [
    `${chalk.bold('SAS log check')} ${chalk.dim(label)} - ${describe(counts)}`
  ]

  lines.push(
    ...columns(
      issues.map((issue) => [
        lineLabel(issue),
        severityLabel(issue.severity),
        issue.code || chalk.dim('-'),
        truncate(issue.message)
      ]),
      ['LINE:COL', 'SEVERITY', 'CODE', 'MESSAGE'],
      '  ',
      '  '
    )
  )

  if (suppressedCount) {
    lines.push(
      chalk.dim(
        `  ${suppressedCount} issue${
          suppressedCount === 1 ? '' : 's'
        } suppressed by message code${
          config.ignoreCodes.length ? ` (${config.ignoreCodes.join(', ')})` : ''
        }`
      )
    )
  }

  if (failure) {
    lines.push(`${chalk.red.bold('  Logcheck failed: ')}${chalk.red(failure)}`)
  }

  process.logger?.log(lines.join('\n'))
}

const describe = (counts: IssueCounts): string => {
  const parts: string[] = []

  if (counts.errors) parts.push(plural(counts.errors, 'error'))
  if (counts.warnings) parts.push(plural(counts.warnings, 'warning'))
  if (counts.notes) parts.push(plural(counts.notes, 'note'))

  return parts.join(', ')
}

const plural = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? '' : 's'}`

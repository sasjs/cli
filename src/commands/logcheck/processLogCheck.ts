import path from 'path'
import {
  collectLogFiles,
  scanLogFile,
  toDisplayPath,
  toSkippedFile
} from './collectLogs'
import { DEFAULT_FOLDER, isIgnoredPath } from './logCheckConfig'
import {
  emptyCounts,
  LogCheckConfig,
  LogCheckSummary,
  ScannedLog,
  SkippedFile
} from './types'

export interface LogCheckOptions {
  /** Paths named on the command line. Empty means the project's results folder. */
  paths?: string[]
  config: LogCheckConfig
}

/**
 * Runs the check: expands the input, parses every log, applies the policy and
 * says whether the run passes.
 *
 * The report is built here rather than in the renderer so that the three
 * output formats cannot disagree about what was found - the summary is the
 * single answer, and human, JSON and CI annotations are three ways of printing
 * it.
 */
export const processLogCheck = async ({
  paths = [],
  config
}: LogCheckOptions): Promise<LogCheckSummary> => {
  const inputPaths = paths.length ? paths : [defaultInputPath(config)]
  const searched = inputPaths.map((inputPath) =>
    toDisplayPath(path.resolve(inputPath))
  )

  const { files, missing, unreadable } = await collectLogFiles(inputPaths)

  const skipped: SkippedFile[] = []
  const toScan: string[] = []

  for (const file of files) {
    const displayPath = toDisplayPath(file)

    if (isIgnoredPath(displayPath, config.ignorePaths)) {
      skipped.push({ displayPath, reason: 'excluded by ignorePaths' })
      continue
    }

    toScan.push(file)
  }

  const logs = await Promise.all(
    toScan.map((file) => scanLogFile(file, config))
  )

  const scanned = logs.filter((log) => !log.skippedReason)

  skipped.push(
    ...logs.filter((log) => log.skippedReason).map((log) => toSkippedFile(log))
  )

  // Every collected file is accounted for in `totals`, whether it was read,
  // excluded by a rule, or declined by the scanner - the count in the summary
  // and the entries in the report have to describe the same run.
  const totals = sumTotals(scanned, files.length)

  return {
    logs,
    skipped: sortSkipped(skipped),
    missing,
    unreadable,
    usedDefaultInput: !paths.length,
    searched,
    totals,
    failure: describeFailure(totals, config, missing.length, unreadable.length)
  }
}

/**
 * Where a run with no arguments looks. The project's results folder is where
 * `run`, `job run` and `test` leave their logs, which makes the bare command
 * do the useful thing inside a project.
 */
export const defaultInputPath = (config: LogCheckConfig): string => {
  const projectDir = process.projectDir || process.cwd()

  return path.resolve(projectDir, config.folder || DEFAULT_FOLDER)
}

/**
 * Adds up what the run found. Skipped logs contribute nothing but are counted
 * so the report can say how many files it passed over.
 */
export const sumTotals = (
  scanned: ScannedLog[],
  fileCount: number = scanned.length
): LogCheckSummary['totals'] => {
  const totals = {
    ...emptyCounts(),
    suppressed: 0,
    logs: scanned.length,
    skipped: fileCount - scanned.length
  }

  for (const log of scanned) {
    totals.errors += log.counts.errors
    totals.warnings += log.counts.warnings
    totals.notes += log.counts.notes
    totals.suppressed += log.suppressed.length
  }

  return totals
}

/**
 * The verdict, as a phrase for the report.
 *
 * An ERROR always fails unless the policy is `never`; warnings and notes fail
 * only when the policy asks for them, because notable notes are what legacy
 * code emits in bulk and a gate that is red on its first run is a gate that
 * gets commented out.
 *
 * A warnings budget is checked first and applies even under `never`: writing
 * `maxWarnings: 0` is a specific instruction, and a specific instruction
 * outranks a blanket one. `never` therefore means "do not fail on what you
 * find", not "ignore the budget I also asked for".
 *
 * A path that could not be checked fails the run ahead of everything else: the
 * answer to "is this log clean" is unknown, and unknown is not a pass.
 */
export const describeFailure = (
  totals: LogCheckSummary['totals'],
  config: LogCheckConfig,
  missingCount: number = 0,
  unreadableCount: number = 0
): string | undefined => {
  if (missingCount) {
    return `${missingCount} path${missingCount === 1 ? '' : 's'} not found`
  }

  if (unreadableCount) {
    return `${unreadableCount} folder${
      unreadableCount === 1 ? '' : 's'
    } could not be read`
  }

  if (
    config.maxWarnings !== undefined &&
    totals.warnings > config.maxWarnings
  ) {
    return `${plural(totals.warnings, 'warning')} (budget ${
      config.maxWarnings
    })`
  }

  if (config.failOn === 'never') return undefined

  if (totals.errors) return plural(totals.errors, 'error')

  if (config.failOn === 'warning' || config.failOn === 'note') {
    if (totals.warnings) return plural(totals.warnings, 'warning')
  }

  if (config.failOn === 'note' && totals.notes) {
    return plural(totals.notes, 'note')
  }

  return undefined
}

const plural = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? '' : 's'}`

const sortSkipped = (skipped: SkippedFile[]): SkippedFile[] =>
  [...skipped].sort((a, b) => a.displayPath.localeCompare(b.displayPath))

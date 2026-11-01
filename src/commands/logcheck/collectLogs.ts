import path from 'path'
import { readdir, readFile, stat } from 'fs/promises'
import { isSasLog, LogIssue, parseLog } from '@sasjs/utils/logs'
import { toPosix } from './logCheckConfig'
import { emptyCounts, LogCheckConfig, ScannedLog, SkippedFile } from './types'

/** A log bigger than this is reported and skipped rather than read. */
export const MAX_LOG_BYTES = 25 * 1024 * 1024

/** Folders never walked when a directory is given. */
const IGNORED_FOLDERS = ['node_modules', '.git']

export interface CollectedFiles {
  /** Absolute paths of the files that will be read, in report order. */
  files: string[]
  /** Paths the user named that do not exist. */
  missing: string[]
}

/**
 * Expands the paths a user named into the files to read.
 *
 * A file is taken as it is; a folder is walked, because the reason a user
 * points at `sasjsresults` is that they do not know which run left which log.
 * Order is sorted so that two runs over the same folder produce the same
 * report, which is what makes a diff of two reports readable.
 */
export const collectLogFiles = async (
  paths: string[]
): Promise<CollectedFiles> => {
  const files = new Set<string>()
  const missing: string[] = []

  for (const candidate of paths) {
    const resolved = path.resolve(candidate)
    const info = await stat(resolved).catch(() => undefined)

    if (!info) {
      missing.push(candidate)
      continue
    }

    if (info.isDirectory()) {
      for (const found of await walk(resolved)) files.add(found)
      continue
    }

    files.add(resolved)
  }

  return {
    files: Array.from(files).sort((a, b) => a.localeCompare(b)),
    missing
  }
}

/**
 * Recursively lists the files under a folder.
 *
 * Symlinks are not followed: a link back up the tree would make the walk
 * endless, and a log reached through a link is not something to report on
 * twice.
 */
const walk = async (folder: string): Promise<string[]> => {
  const entries = await readdir(folder, { withFileTypes: true }).catch(() => [])
  const found: string[] = []

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue

    const fullPath = path.join(folder, entry.name)

    if (entry.isDirectory()) {
      if (IGNORED_FOLDERS.includes(entry.name)) continue
      found.push(...(await walk(fullPath)))
      continue
    }

    if (entry.isFile()) found.push(fullPath)
  }

  return found
}

/**
 * The path a report shows for a file: relative to the project folder where
 * that is shorter and does not climb out of it, absolute otherwise.
 *
 * Forward slashes throughout, so a report generated on Windows and one
 * generated on Linux describe the same log the same way, and so a path can be
 * dropped into a CI annotation without escaping.
 */
export const toDisplayPath = (filePath: string): string => {
  const base = process.projectDir || process.cwd()
  const relative = path.relative(base, filePath)

  return relative && !relative.startsWith('..')
    ? toPosix(relative)
    : toPosix(filePath)
}

/**
 * Parses one log and splits its issues into the ones reported and the ones
 * suppressed by message code.
 *
 * A file that is not a SAS log is skipped rather than reported as clean: a
 * Python traceback and a shell build log both begin lines with `ERROR:`, and
 * `isSasLog` is what tells them from the real thing.
 */
export const scanLogFile = async (
  filePath: string,
  config: LogCheckConfig
): Promise<ScannedLog> => {
  const displayPath = toDisplayPath(filePath)
  const blank: ScannedLog = {
    filePath,
    displayPath,
    issues: [],
    suppressed: [],
    counts: emptyCounts()
  }

  const info = await stat(filePath).catch(() => undefined)

  if (!info) {
    return { ...blank, skippedReason: 'could not be read' }
  }

  if (!info.isFile()) {
    return { ...blank, skippedReason: 'not a file' }
  }

  if (info.size > MAX_LOG_BYTES) {
    return {
      ...blank,
      skippedReason: `larger than ${Math.round(
        MAX_LOG_BYTES / (1024 * 1024)
      )} MB`
    }
  }

  const text = await readFile(filePath, 'utf8').catch(() => undefined)

  if (text === undefined) {
    return { ...blank, skippedReason: 'could not be read' }
  }

  if (!isSasLog(text)) {
    return { ...blank, skippedReason: 'not a SAS log' }
  }

  const { issues, suppressed } = partitionIssues(
    parseLog(text),
    config.ignoreCodes
  )

  return {
    ...blank,
    issues,
    suppressed,
    counts: countIssues(issues)
  }
}

/**
 * Splits parsed issues by the suppressed message codes.
 *
 * Matching is on the code alone, because that is what SAS keeps stable: the
 * text of a note carries values from the data and changes between runs, while
 * `49-169` means the same thing every time.
 */
export const partitionIssues = (
  issues: LogIssue[],
  ignoreCodes: string[]
): { issues: LogIssue[]; suppressed: LogIssue[] } => {
  const codes = new Set(ignoreCodes.map((code) => code.trim()))

  const kept: LogIssue[] = []
  const suppressed: LogIssue[] = []

  for (const issue of issues) {
    if (issue.code && codes.has(issue.code)) suppressed.push(issue)
    else kept.push(issue)
  }

  return { issues: kept, suppressed }
}

export const countIssues = (issues: LogIssue[]) => {
  const counts = emptyCounts()

  for (const issue of issues) {
    if (issue.severity === 'error') counts.errors++
    else if (issue.severity === 'warning') counts.warnings++
    else counts.notes++
  }

  return counts
}

/** A file the check declined to open, as the report shows it. */
export const toSkippedFile = (log: ScannedLog): SkippedFile => ({
  displayPath: log.displayPath,
  reason: log.skippedReason || 'skipped'
})

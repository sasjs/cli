import { LogIssue } from '@sasjs/utils/logs'

/**
 * When a log check fails. `error` is the default: an ERROR is SAS refusing to
 * do something, and a gate red on day one gets switched off, so the notable
 * notes legacy code produces in bulk are reported but do not fail the run.
 */
export type FailOn = 'error' | 'warning' | 'note' | 'never'

/** How the result is presented. Only `human` carries colour. */
export type OutputFormat = 'human' | 'json' | 'annotations'

/**
 * The policy for a log check: what fails it, and what is suppressed. The
 * defaults are set here, a `logCheck` section in `sasjsconfig.json` may
 * override them, and the flags on the command line override both.
 */
export interface LogCheckConfig {
  /**
   * Lowest severity that fails the check - see {@link FailOn}.
   *
   * `never` does not disable `maxWarnings`: a budget is a specific
   * instruction and still fails the run when it is exceeded.
   */
  failOn: FailOn
  /**
   * Number of warnings tolerated before the check fails, whatever `failOn`
   * says. Undefined means no budget, which is not the same as zero.
   */
  maxWarnings?: number
  /**
   * SAS message codes to suppress, e.g. `49-169` for the note about a
   * quoted string being truncated. The code is the stable identifier SAS
   * gives a message, which is what makes it the right thing to key on.
   */
  ignoreCodes: string[]
  /**
   * Log paths to leave out, as a plain substring (`sasjsresults/legacy`) or a
   * glob (`**&#47;build*.log`). Matched against the path shown in the report.
   */
  ignorePaths: string[]
  /**
   * Folder to check when no path is given on the command line. Resolved
   * against the project folder.
   */
  folder?: string
}

export const defaultLogCheckConfig: LogCheckConfig = {
  failOn: 'error',
  ignoreCodes: [],
  ignorePaths: []
}

/** Counts of the issues a log carries, after suppression. */
export interface IssueCounts {
  errors: number
  warnings: number
  notes: number
}

export const emptyCounts = (): IssueCounts => ({
  errors: 0,
  warnings: 0,
  notes: 0
})

/**
 * One log as the check found it. A log that could not be read, is too large,
 * or is not a SAS log carries a `skippedReason` and no issues - it is still
 * part of the report, because a file the user asked about that was quietly
 * dropped is worse than one reported as skipped.
 */
export interface ScannedLog {
  /** Absolute path, as it was read. */
  filePath: string
  /** Path as shown to the user, relative to the project folder where possible. */
  displayPath: string
  /** Issues that survive the suppression rules. */
  issues: LogIssue[]
  /** Issues removed by `ignoreCodes`, reported only as a count. */
  suppressed: LogIssue[]
  counts: IssueCounts
  /** Set when the file was not checked at all. */
  skippedReason?: string
}

/** A file the check did not look inside, with the reason it did not. */
export interface SkippedFile {
  displayPath: string
  reason: string
}

/** Everything one run of the check produced, before any rendering. */
export interface LogCheckSummary {
  logs: ScannedLog[]
  skipped: SkippedFile[]
  /** Paths the user named that do not exist. */
  missing: string[]
  /** Folders the check could not list, so their logs were never looked at. */
  unreadable: SkippedFile[]
  /** Whether the paths were defaulted rather than named by the user. */
  usedDefaultInput: boolean
  /** Folders and files that were searched, as shown in the report. */
  searched: string[]
  totals: IssueCounts & {
    suppressed: number
    /** Logs actually parsed. */
    logs: number
    /** Files that were passed over, for whatever reason. */
    skipped: number
  }
  /** Why the check failed, or undefined when it passed. */
  failure?: string
}

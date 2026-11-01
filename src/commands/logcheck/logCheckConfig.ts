import path from 'path'
import { readFile } from '@sasjs/utils'
import { defaultLogCheckConfig, FailOn, LogCheckConfig } from './types'

/** The section of `sasjsconfig.json` this command reads. */
export const CONFIG_KEY = 'logCheck'

/** Folder checked when the command is given no path of its own. */
export const DEFAULT_FOLDER = 'sasjsresults'

const failOnValues: FailOn[] = ['error', 'warning', 'note', 'never']

/**
 * Builds a config from an untrusted `logCheck` section.
 *
 * Values a user gets wrong are refused rather than ignored: a typo in
 * `failOn` that silently fell back to the default would leave a gate that
 * never fails, which is the one failure mode a quality gate must not have.
 *
 * @param section - the parsed `logCheck` object from `sasjsconfig.json`.
 * @param source - the file it came from, named in the error message.
 */
export const parseLogCheckSection = (
  section: unknown,
  source: string = 'sasjsconfig.json'
): LogCheckConfig => {
  const config: LogCheckConfig = {
    ...defaultLogCheckConfig,
    ignoreCodes: [],
    ignorePaths: []
  }

  if (section === undefined || section === null) return config

  if (typeof section !== 'object' || Array.isArray(section)) {
    throw new Error(
      `The \`${CONFIG_KEY}\` property in ${source} must be an object.`
    )
  }

  const { failOn, maxWarnings, ignoreCodes, ignorePaths, folder, autoCheck } =
    section as Record<string, unknown>

  if (failOn !== undefined) {
    if (!failOnValues.includes(failOn as FailOn)) {
      throw new Error(
        `The \`${CONFIG_KEY}.failOn\` property in ${source} must be one of ${failOnValues.join(
          ', '
        )} - received \`${String(failOn)}\`.`
      )
    }
    config.failOn = failOn as FailOn
  }

  if (maxWarnings !== undefined) {
    if (
      typeof maxWarnings !== 'number' ||
      !Number.isInteger(maxWarnings) ||
      maxWarnings < 0
    ) {
      throw new Error(
        `The \`${CONFIG_KEY}.maxWarnings\` property in ${source} must be a whole number of zero or more - received \`${String(
          maxWarnings
        )}\`.`
      )
    }
    config.maxWarnings = maxWarnings
  }

  if (ignoreCodes !== undefined) {
    config.ignoreCodes = stringList(
      ignoreCodes,
      `${CONFIG_KEY}.ignoreCodes`,
      source
    )
  }

  if (ignorePaths !== undefined) {
    config.ignorePaths = stringList(
      ignorePaths,
      `${CONFIG_KEY}.ignorePaths`,
      source
    )
  }

  if (autoCheck !== undefined) {
    if (typeof autoCheck !== 'boolean') {
      throw new Error(
        `The \`${CONFIG_KEY}.autoCheck\` property in ${source} must be true or false - received \`${String(
          autoCheck
        )}\`.`
      )
    }
    config.autoCheck = autoCheck
  }

  if (folder !== undefined) {
    if (typeof folder !== 'string' || !folder.trim()) {
      throw new Error(
        `The \`${CONFIG_KEY}.folder\` property in ${source} must be a non-empty string.`
      )
    }
    config.folder = folder.trim()
  }

  return config
}

/**
 * Reads the `logCheck` policy from the project's `sasjsconfig.json`.
 *
 * A missing file, or one without the section, is not an error - the command
 * has to work in a folder that is not a SASjs project at all, which is the
 * whole point of checking a log somebody else produced.
 */
export const readLogCheckConfig = async (): Promise<LogCheckConfig> => {
  const projectDir = process.projectDir || process.cwd()
  const configPath = path.join(projectDir, 'sasjsconfig.json')
  const raw = await readFile(configPath).catch(() => undefined)

  if (!raw)
    return { ...defaultLogCheckConfig, ignoreCodes: [], ignorePaths: [] }

  let parsed: any

  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(
      `Could not parse ${configPath}: ${(error as Error).message}`
    )
  }

  const section = parsed?.config?.[CONFIG_KEY] ?? parsed?.[CONFIG_KEY]
  const config = parseLogCheckSection(section, configPath)

  // A project may have moved its results folder; the bare command follows it,
  // unless the logCheck section names a folder of its own.
  if (!config.folder) {
    const resultsFolder =
      parsed?.config?.sasjsResultsFolder ?? parsed?.sasjsResultsFolder

    if (typeof resultsFolder === 'string' && resultsFolder.trim()) {
      config.folder = resultsFolder.trim()
    }
  }

  return config
}

/** Flags a user can set on the command line, all optional. */
export interface ConfigOverrides {
  failOn?: string
  maxWarnings?: number
  ignoreCodes?: string[]
  ignorePaths?: string[]
}

/**
 * Layers the command line over the config file. Suppressions are added, never
 * replaced: a flag silences one more code for one run, it does not un-silence
 * the codes a team has already agreed to accept.
 */
export const mergeConfig = (
  base: LogCheckConfig,
  overrides: ConfigOverrides = {}
): LogCheckConfig => {
  const merged: LogCheckConfig = {
    ...base,
    ignoreCodes: [...base.ignoreCodes],
    ignorePaths: [...base.ignorePaths]
  }

  if (overrides.failOn !== undefined) {
    merged.failOn = overrides.failOn as FailOn
  }

  if (overrides.maxWarnings !== undefined) {
    merged.maxWarnings = overrides.maxWarnings
  }

  if (overrides.ignoreCodes?.length) {
    merged.ignoreCodes = unique([
      ...merged.ignoreCodes,
      ...overrides.ignoreCodes
    ])
  }

  if (overrides.ignorePaths?.length) {
    merged.ignorePaths = unique([
      ...merged.ignorePaths,
      ...overrides.ignorePaths
    ])
  }

  return merged
}

/**
 * Whether a log path is excluded by one of the `ignorePaths` entries.
 *
 * An entry with no wildcard is matched against whole path segments, not as a
 * bare substring of the text: `test` covers `test/run.log` and
 * `sasjsresults/test/run.log`, but not `latest.log`, and `logs` does not cover
 * `nested-logs/x.log`. A suppression rule that quietly covers files the author
 * did not name is the failure mode this whole config guards against, so an
 * entry has to name a path, not a fragment of one.
 *
 * An entry with a wildcard is a glob over the display path, anchored at both
 * ends, where `**&#47;` crosses folders and `*` does not.
 */
export const matchesPath = (displayPath: string, pattern: string): boolean => {
  const subject = toPosix(displayPath)
  const candidate = normalisePattern(toPosix(pattern))

  if (!candidate) return false

  if (!candidate.includes('*') && !candidate.includes('?')) {
    return matchesSegments(subject, candidate)
  }

  return globToRegExp(candidate).test(subject)
}

/**
 * A non-glob entry matches when it names the path itself, or a run of whole
 * segments inside it.
 *
 * Padding both sides with a separator makes one `includes` do the work: the
 * needle can only be found where it begins at a segment boundary and ends at
 * one, which is exactly the difference between `test` and `latest`.
 */
export const matchesSegments = (
  subject: string,
  candidate: string
): boolean => {
  const haystack = `/${stripSlashes(subject)}/`
  const needle = `/${stripSlashes(candidate)}/`

  return haystack.includes(needle)
}

export const isIgnoredPath = (
  displayPath: string,
  patterns: string[]
): boolean => patterns.some((pattern) => matchesPath(displayPath, pattern))

/**
 * Compiles a glob into an expression anchored at both ends.
 *
 * `**&#47;` at the start matches zero or more leading folders so that
 * `**&#47;build.log` covers `build.log` in the project folder as well as one
 * several folders down - a pattern that only matched the deep case would make
 * the obvious spelling useless.
 */
export const globToRegExp = (pattern: string): RegExp => {
  const source = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '\u0000')
    .replace(/\*\*/g, '\u0001')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\u0000/g, '(?:.*/)?')
    .replace(/\u0001/g, '.*')

  return new RegExp(`^${source}$`)
}

/** Path text as it appears in a report: forward slashes, no wrapping quotes. */
export const toPosix = (value: string): string =>
  value.split(path.sep).join('/')

/**
 * A suppression entry as it is compared: no `./` lead-in, no trailing
 * separators, so `./logs/` and `logs` are one entry rather than two.
 */
const normalisePattern = (value: string): string =>
  stripSlashes(value.trim().replace(/^(?:\.\/)+/, ''))

const stripSlashes = (value: string): string =>
  value.replace(/^\/+/, '').replace(/\/+$/, '')

const stringList = (value: unknown, name: string, source: string): string[] => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(
      `The \`${name}\` property in ${source} must be an array of strings.`
    )
  }

  return unique(value as string[])
}

const unique = (values: string[]): string[] =>
  Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))

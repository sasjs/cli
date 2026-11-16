import path from 'path'
import { chmod, rename, rm, stat, writeFile } from 'fs/promises'
import { statSync } from 'fs'

import {
  formatText,
  FormatOptions,
  getLintConfig,
  LintConfig
} from '@sasjs/lint'
import { listSasFilesInFolder, readFile } from '@sasjs/utils'

import { getFormatEngine } from './formatEngine'

/**
 * `sasjs format`, like `sasjs lint`, is documented to work without a
 * `sasjsconfig.json`, and loading that file is the only thing that sets
 * `process.projectDir` - so a filter is resolved against the current directory
 * when no project was loaded.
 */
const getProjectDir = () => process.projectDir || process.cwd()

/**
 * The folders a project walk skips.
 *
 * The same list `sasjs lint fix` uses through `formatFolder`, and for the same
 * reason: `sasjsbuild` and `sasjsresults` hold what the last `sasjs build` and
 * run wrote, so formatting them would dirty a generated tree and make
 * `sasjs build && sasjs format --check` fail on files nobody edits.
 */
const EXCLUDED_FOLDERS = [
  '.git',
  '.github',
  '.vscode',
  'node_modules',
  'sasjsbuild',
  'sasjsresults'
]

/** A file that could not be read, formatted or written, and why. */
export interface FileFailure {
  filePath: string
  message: string
}

/** What a format run did, so a caller can report it and a pipeline can gate. */
export interface FormatOutcome {
  /** Files whose content changed - or, with `check`, whose content would change. */
  changedFilePaths: string[]
  /** Files read, whether or not they changed. */
  examinedCount: number
  /** Files whose formatting never settled, and so were left exactly as found. */
  unsettledFilePaths: string[]
  /** Files a filter named that this command will not format. */
  rejectedFilePaths: FileFailure[]
  /** Files that failed part way, so the run did not cover them. */
  failedFilePaths: FileFailure[]
  /** Filters that named no file, so the run did not cover what was asked. */
  unmatchedFilters: string[]
  /** Set when the layout engine could not be loaded, so only the rules ran. */
  engineUnavailable: boolean
}

/** Whether a path is one this command formats. */
const isSasFile = (filePath: string) =>
  path.extname(filePath).toLowerCase() === '.sas'

/**
 * A path as a filter would be written.
 *
 * The walker returns native separators, which are `\\` on Windows, while a filter
 * is typed with `/` - so `sasjs format sasjs/macros`, the form in this command's
 * own examples, would match nothing there and still report success.
 */
const toForwardSlashes = (value: string) => value.replace(/\\/g, '/')

/**
 * Whether an absolute path names a folder, without throwing on a path this
 * process may not stat.
 *
 * @param absolutePath - the path as the user typed it
 * @returns `true` for a folder, `false` for anything else
 */
const isFolder = (absolutePath: string): boolean => {
  try {
    return (
      statSync(absolutePath, { throwIfNoEntry: false })?.isDirectory() ?? false
    )
  } catch {
    return false
  }
}

/**
 * The byte-order mark, which is an encoding marker rather than formatting.
 *
 * `readFile` hands it back as the first character of the text, and the layout
 * pipeline does not carry it through, so a file that had one would come back
 * without - a change to the file's encoding that nothing asked for.
 */
const BOM = '\uFEFF'

/**
 * Puts back the encoding envelope the layout pass does not carry.
 *
 * A byte-order mark records how the file is encoded rather than how it is
 * formatted, so it is not this command's to remove: `readFile` hands it back as
 * the first character, the pipeline does not carry it through, and it is restored
 * here. Line endings need no such treatment: the engine joins lines on LF, so a
 * CRLF file is normalised either way, and `.sasjslint`'s `lineEndings` only decides
 * whether CRLF is produced instead. Its default is `off`, which registers no rule
 * at all - so `sasjs lint` says nothing about endings on a default project while
 * this command still rewrites them.
 *
 * @param before - the file as it was read
 * @param formatted - the settled formatting of it
 * @returns what to write
 */
const restoreEnvelope = (before: string, formatted: string): string => {
  const hadBom = before.startsWith(BOM)

  if (hadBom && !formatted.startsWith(BOM)) return BOM + formatted
  if (!hadBom && formatted.startsWith(BOM)) return formatted.slice(BOM.length)

  return formatted
}

/**
 * Writes a file so that an interrupted run cannot leave it truncated.
 *
 * `writeFile` opens the target and truncates it before writing: a process killed
 * in between leaves the user's `.sas` file empty, which is the one failure mode a
 * tool that rewrites source must not have. The new content goes to a sibling
 * temporary file and is renamed onto the original, which is a single atomic
 * replacement on every platform this runs on. The temporary file is in the same
 * folder, so it is the same filesystem and the rename cannot become a copy.
 */
const replaceFile = async (filePath: string, text: string): Promise<void> => {
  const temporary = `${filePath}.sasjs-format.tmp`

  try {
    // The temporary file is created with the process's mode, so the source's has
    // to be carried across: a group-writable or executable file must not come
    // back 0644 because it was rewritten.
    const original = await stat(filePath)

    await writeFile(temporary, text)
    await chmod(temporary, original.mode)
    await rename(temporary, filePath)
  } catch (error) {
    await rm(temporary, { force: true })

    throw error
  }
}

/**
 * Whether a filter names a whole run of path segments in a project relative path.
 *
 * A filter is a path, so `macros` must not match `sasjs/macros_old/x.sas`, and a
 * filter naming a file - `sasjs/services/appinit.sas` - matches it exactly.
 *
 * @param relativePath - the file's path, `/`-separated, inside the project
 * @param filter - the filter, with its leading and trailing slashes removed
 * @returns `true` when the filter names that run of segments
 */
const matchesSegments = (relativePath: string, filter: string): boolean =>
  filter === '' ||
  relativePath === filter ||
  relativePath.startsWith(`${filter}/`) ||
  relativePath.includes(`/${filter}/`) ||
  relativePath.endsWith(`/${filter}`)

/** Removes duplicates, keeping the order a user would expect to read. */
const unique = (paths: string[]) => [...new Set(paths)]

/**
 * The `.sas` files a filter list names, and the paths it names that this command
 * will not format.
 *
 * Absolute paths are taken as given, unless they name a folder, in which case the
 * folder is walked; anything else is matched against the project's own paths, as a
 * run of whole segments. That is deliberately *not* how `sasjs lint` reads a
 * filter: it builds a regular expression from the arguments and tests it anywhere
 * in the path, so `macros` there also matches `sasjs/macros_old`, and `[` throws.
 * Parity would restore both of those, so the difference is the point. An absolute
 * path that
 * is not a `.sas` file is refused rather than formatted: the language engine will
 * happily reprint a markdown file, and a formatter that rewrites what it was not
 * asked to is worse than one that says no.
 *
 * The result is deduplicated, because `sasjs format /p/sasjs/macros macros` names
 * the same file twice and would otherwise format, report and count it twice.
 *
 * @param filterArray - absolute paths or patterns; empty means the whole project
 * @returns the files to format, and the absolute paths refused
 */
export const resolveSasFiles = async (
  filterArray: string[] = []
): Promise<{
  files: string[]
  rejected: FileFailure[]
  unmatchedFilters: string[]
}> => {
  if (!filterArray.length) {
    const projectDir = getProjectDir()

    return {
      files: (
        await listSasFilesInFolder(projectDir, true, EXCLUDED_FOLDERS)
      ).map((file) => path.resolve(projectDir, file)),
      rejected: [],
      unmatchedFilters: []
    }
  }

  const absolute = filterArray.filter((pattern) => path.isAbsolute(pattern))
  const patterns = filterArray.filter((pattern) => !path.isAbsolute(pattern))

  const files: string[] = []
  const rejected: FileFailure[] = []
  const unmatchedFilters: string[] = []

  // An absolute path may name a folder - `sasjs format /p/sasjs/macros` is the
  // obvious thing to type - and reading a directory as a file fails.
  for (const absolutePath of absolute) {
    if (isFolder(absolutePath)) {
      const folderFiles =
        // The walker returns paths relative to the folder it was given.
        (await listSasFilesInFolder(absolutePath, true, EXCLUDED_FOLDERS)).map(
          (file) => path.resolve(absolutePath, file)
        )

      // A folder that holds no `.sas` file names nothing, exactly like a pattern
      // that matches nothing: a renamed or wrong path must not read as a clean run.
      if (!folderFiles.length) unmatchedFilters.push(absolutePath)

      files.push(...folderFiles)

      continue
    }

    if (!isSasFile(absolutePath)) {
      rejected.push({
        filePath: absolutePath,
        message: 'not a .sas file, so it was not formatted'
      })

      continue
    }

    files.push(absolutePath)
  }

  if (patterns.length) {
    const projectDir = getProjectDir()
    const relativeFiles = await listSasFilesInFolder(
      projectDir,
      true,
      EXCLUDED_FOLDERS
    )
    // Compared as plain text rather than as a pattern: a filter is a path the
    // user typed, so `sasjs format "["` must name nothing instead of throwing a
    // SyntaxError out of the walk.
    const matchers = patterns.map((pattern) =>
      toForwardSlashes(pattern).replace(/^\/+|\/+$/g, '')
    )
    const matchedPatterns = new Set<string>()

    for (const relative of relativeFiles) {
      const absolutePath = path.resolve(projectDir, relative)
      // Compared against the path *inside* the project: matching the absolute path
      // made a filter a substring of everything above the project too, so
      // `sasjs format macros` also rewrote a checkout at `/home/macros-dev/...`.
      const candidate = toForwardSlashes(
        path.relative(projectDir, absolutePath)
      )

      patterns.forEach((pattern, index) => {
        if (matchesSegments(candidate, matchers[index])) {
          files.push(absolutePath)
          matchedPatterns.add(pattern)
        }
      })
    }

    // A filter that named nothing is reported rather than treated as a run over
    // zero files: a mistyped path would otherwise pass a `--check` gate green.
    unmatchedFilters.push(
      ...patterns.filter((pattern) => !matchedPatterns.has(pattern))
    )
  }

  return { files: unique(files), rejected, unmatchedFilters }
}

/**
 * How many times one file may be formatted before it is called unstable.
 *
 * Three, because two passes are normal rather than exceptional: the rules add a
 * header from `.sasjslint`'s template, and the language printer then re-indents
 * comment bodies, so the second pass moves the header the first just wrote. A
 * third settles it. A file still changing at three means the two passes disagree
 * in a way no number of runs will fix, so it is left as it was found and
 * reported - writing the last pass would leave a repository that fails
 * `--check` on a file `format` had just written.
 */
const MAX_PASSES = 3

/**
 * Formats until the text stops changing.
 *
 * One pass leaves a file whose next format moves its header, which would make
 * `format` followed by `--check` fail - and `--check` exists to run in a
 * pipeline, where that reads as a broken repository rather than as a formatter
 * that needs two goes.
 *
 * @param text - the file's content
 * @param config - the project's lint configuration, resolved once per run
 * @param options - the reprint engine
 * @returns the settled text, or `undefined` when the passes never settled
 */
const formatToFixedPoint = async (
  text: string,
  config: LintConfig,
  options: FormatOptions
): Promise<string | undefined> => {
  let current = text

  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    const next = await formatText(current, config, options)

    if (next === current) return current

    current = next
  }
}

/**
 * Rewrites `.sas` files into the project's canonical form.
 *
 * The order is `@sasjs/lint`'s, and it is deliberate there: the language engine
 * reprints the file first - indentation, statement breaks, keyword case - and the
 * `.sasjslint` rules then run over its output, because a rule that wraps or trims
 * has to see the lines the printer produced.
 *
 * Two modes, and the difference is only whether the result is written:
 *
 * - `check: false` writes each file that changed;
 * - `check: true` writes nothing, reports the files that would change, and the
 *   command fails, so "is this repository canonically formatted?" becomes a gate
 *   in the way `sasjs lint` gates on rules.
 *
 * A file that cannot be read, formatted or written is collected rather than
 * thrown: one unreadable file in a tree must not skip every file after it, which
 * is the rule `formatFolder` follows in `@sasjs/lint` for the same reason.
 *
 * When the engine cannot be loaded the rules still run, but the outcome says so:
 * a rule-only run must not read as a clean one, or a broken install passes the
 * gate the command exists to provide.
 *
 * @param filterArray - absolute paths or patterns; empty means the whole project
 * @param check - report instead of write
 * @param options - a caller-supplied engine, for tests and embedding
 * @returns what changed, what was examined, and what could not be done
 */
export const processFormat = async (
  filterArray: string[] = [],
  check = false,
  options: FormatOptions = {}
): Promise<FormatOutcome> => {
  const {
    files: filePaths,
    rejected,
    unmatchedFilters
  } = await resolveSasFiles(filterArray)

  // Read once, so every file and every pass works from the same configuration
  // rather than re-reading `.sasjslint` per pass.
  const config = await getLintConfig()

  // Resolved once, before the loop: a load failure should be reported once, and
  // the rules applied to every file regardless.
  let reprint = options.reprint
  let engineUnavailable = false

  if (!reprint) {
    try {
      reprint = await getFormatEngine()
    } catch (error: any) {
      engineUnavailable = true

      process.logger?.warn(
        `The SAS language engine could not be loaded, so only the linting rules were applied: ${
          error?.message ?? error
        }`
      )
    }
  }

  const formatOptions: FormatOptions = reprint
    ? { ...options, reprint }
    : options
  const changedFilePaths: string[] = []
  const unsettledFilePaths: string[] = []
  const failedFilePaths: FileFailure[] = []

  for (const filePath of filePaths) {
    try {
      // `@sasjs/utils`' reader, which is what `sasjs lint` reads through: the two
      // commands must not decode the same file differently.
      const before = await readFile(filePath)
      const formatted = await formatToFixedPoint(before, config, formatOptions)

      // Unsettled: left exactly as found, and named in the outcome.
      if (formatted === undefined) {
        unsettledFilePaths.push(filePath)

        continue
      }

      const after = restoreEnvelope(before, formatted)

      if (after === before) continue

      // After the write, not before: a write that throws must not leave the file
      // listed as both rewritten and failed. The write replaces the file rather
      // than truncating it, so a killed run leaves the original intact.
      if (!check) await replaceFile(filePath, after)

      changedFilePaths.push(filePath)
    } catch (error: any) {
      failedFilePaths.push({
        filePath,
        message: error?.message ?? String(error)
      })
    }
  }

  return {
    changedFilePaths,
    examinedCount: filePaths.length,
    unsettledFilePaths,
    rejectedFilePaths: rejected,
    unmatchedFilters,
    failedFilePaths,
    engineUnavailable
  }
}

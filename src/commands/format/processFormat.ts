import path from 'path'
import { readFile, writeFile } from 'fs/promises'
import { statSync } from 'fs'

import { formatText, FormatOptions } from '@sasjs/lint'
import { listSasFilesInFolder } from '@sasjs/utils'

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

/** What a format run did, so a caller can report it and a pipeline can gate. */
export interface FormatOutcome {
  /** Files whose content changed - or, with `check`, whose content would change. */
  changedFilePaths: string[]
  /** Files read, whether or not they changed. */
  examinedCount: number
  /** Files whose formatting never settled, and so were left exactly as found. */
  unsettledFilePaths: string[]
  /** Set when the layout engine could not be loaded, so only the rules ran. */
  engineUnavailable: boolean
}

/**
 * The `.sas` files a filter list names.
 *
 * Absolute paths are taken as given, unless they name a folder, in which case the
 * folder is walked; anything else is a pattern matched against every `.sas` file
 * in the project, which is how `sasjs lint` reads a filter.
 *
 * @param filterArray - absolute paths or patterns; empty means the whole project
 * @returns absolute paths, in no particular order
 */
export const resolveSasFiles = async (
  filterArray: string[] = []
): Promise<string[]> => {
  if (!filterArray.length) {
    const projectDir = getProjectDir()

    return (await listSasFilesInFolder(projectDir, true, EXCLUDED_FOLDERS)).map(
      (file) => path.resolve(projectDir, file)
    )
  }

  const absolute = filterArray.filter((pattern) => path.isAbsolute(pattern))
  const patterns = filterArray.filter((pattern) => !path.isAbsolute(pattern))

  // An absolute path may name a folder - `sasjs format /p/sasjs/macros` is the
  // obvious thing to type - and reading a directory as a file fails.
  const files: string[] = []

  for (const absolutePath of absolute) {
    const isFolder = statSync(absolutePath, {
      throwIfNoEntry: false
    })?.isDirectory()

    if (isFolder)
      files.push(
        // The walker returns paths relative to the folder it was given.
        ...(
          await listSasFilesInFolder(absolutePath, true, EXCLUDED_FOLDERS)
        ).map((file) => path.resolve(absolutePath, file))
      )
    else files.push(absolutePath)
  }

  if (!patterns.length) return files

  const regex = new RegExp(patterns.map((pattern) => `(${pattern})`).join('|'))
  const projectDir = getProjectDir()
  const sasFiles = (
    await listSasFilesInFolder(projectDir, true, EXCLUDED_FOLDERS)
  ).map((file) => path.resolve(projectDir, file))

  return [...files, ...sasFiles.filter((file) => regex.test(file))]
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
 * @param options - the lint configuration and the reprint engine
 * @param unstable - collects the path when the passes do not settle
 * @param filePath - named in that report, so the caller knows which file
 * @returns the settled text, or `undefined` when the passes never settled
 */
const formatToFixedPoint = async (
  text: string,
  options: FormatOptions,
  unstable: string[],
  filePath: string
): Promise<string | undefined> => {
  let current = text

  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    const next = await formatText(current, undefined, options)

    if (next === current) return current

    current = next
  }

  unstable.push(filePath)
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
  const filePaths = await resolveSasFiles(filterArray)

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

  for (const filePath of filePaths) {
    const before = await readFile(filePath, 'utf8')
    const after = await formatToFixedPoint(
      before,
      formatOptions,
      unsettledFilePaths,
      filePath
    )

    // Unsettled: left exactly as found, and named in the outcome.
    if (after === undefined || after === before) continue

    changedFilePaths.push(filePath)

    if (!check) await writeFile(filePath, after)
  }

  return {
    changedFilePaths,
    examinedCount: filePaths.length,
    unsettledFilePaths,
    engineUnavailable
  }
}

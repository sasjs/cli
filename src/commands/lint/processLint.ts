import path from 'path'
import chalk from 'chalk'
import {
  lintProject,
  lintFile,
  Diagnostic,
  Severity,
  formatProject,
  FormatResult,
  formatFile
} from '@sasjs/lint'
import { asyncForEach, listSasFilesInFolder } from '@sasjs/utils'

interface LintResult {
  warnings: boolean
  errors: boolean
}

/**
 * Fixes lint violations in all .sas files in the current project if no filterArray is provided
 * Otherwise fixes lint violations of only those .sas files which matches filter array
 * @returns {Promise<void>} resolves successfully when formatting has completed
 */
export async function lintFix(filterArray: string[] = []) {
  const results: FormatResult[] = []
  let result: FormatResult = {
    updatedFilePaths: [],
    fixedDiagnosticsCount: 0,
    unfixedDiagnostics: new Map<string, Diagnostic[]>()
  }

  if (filterArray.length) {
    // We can simply format files with absolute path.
    // No need to include these filter values to regex for matching patterns
    const absoluteFilePaths = filterArray.filter((pattern) =>
      path.isAbsolute(pattern)
    )
    await asyncForEach(absoluteFilePaths, async (filePath) => {
      const formatResult = await formatFile(filePath)

      result.updatedFilePaths.push(...formatResult.updatedFilePaths)
      result.fixedDiagnosticsCount += formatResult.fixedDiagnosticsCount

      const unfixedDiagnostics = formatResult.unfixedDiagnostics as Diagnostic[]
      if (unfixedDiagnostics.length) {
        ;(<Map<string, Diagnostic[]>>result.unfixedDiagnostics).set(
          filePath,
          unfixedDiagnostics
        )
      }
    })

    // Remove absolute file path patterns.
    // No need to include these patterns in regex,
    // Because we have already formatted on these patterns
    const nonAbsoluteFilePathPatterns = filterArray.filter(
      (pattern) => !path.isAbsolute(pattern)
    )

    if (nonAbsoluteFilePathPatterns.length) {
      const regexPattern = nonAbsoluteFilePathPatterns
        .map((pattern) => `(${pattern})`)
        .join('|')

      const regex = new RegExp(regexPattern)
      const sasFiles = await listSasFilesInFolder(process.projectDir, true, [
        'node_modules'
      ])

      const filesToLint = sasFiles.filter((file) => regex.test(file))

      await asyncForEach(filesToLint, async (file) => {
        const formatResult = await formatFile(file)

        result.updatedFilePaths.push(...formatResult.updatedFilePaths)
        result.fixedDiagnosticsCount += formatResult.fixedDiagnosticsCount

        const unfixedDiagnostics =
          formatResult.unfixedDiagnostics as Diagnostic[]
        if (unfixedDiagnostics.length) {
          ;(<Map<string, Diagnostic[]>>result.unfixedDiagnostics).set(
            file,
            unfixedDiagnostics
          )
        }
      })
    }
  } else {
    result = await formatProject()
  }

  process.logger?.success(
    `Resolved ${result.fixedDiagnosticsCount} violations.`
  )

  if (result.updatedFilePaths.length) {
    process.logger?.info('Updated files:')
    result.updatedFilePaths.forEach((filePath: string) => {
      process.logger?.info(filePath)
    })
  }

  const unfixedDiagnostics = <Map<string, Diagnostic[]>>(
    result.unfixedDiagnostics
  )

  if (unfixedDiagnostics.size) {
    process.logger?.warn('Unresolved violations: ')
    ;(<Map<string, Diagnostic[]>>result.unfixedDiagnostics).forEach(
      (diagnostics: Diagnostic[], filePath: string) => {
        if (diagnostics.length) {
          displayDiagnostics(filePath, diagnostics)
        }
      }
    )
  }
}

/**
 * Lints all .sas files in the current project if no filterArray is provided
 * Otherwise lints .sas files which matches filter array
 * @returns an object containing booleans `warnings` and `errors`
 */
export async function processLint(
  filterArray: string[] = []
): Promise<LintResult> {
  const found: LintResult = { warnings: false, errors: false }
  let sasjsDiagnosticsMap: Map<string, Diagnostic[]> = new Map<
    string,
    Diagnostic[]
  >()

  if (filterArray.length) {
    // We can simply run lintFile on files with absolute path.
    // No need to include these filter values to regex for matching patterns
    const absoluteFilePaths = filterArray.filter((pattern) =>
      path.isAbsolute(pattern)
    )
    await asyncForEach(absoluteFilePaths, async (filePath) => {
      sasjsDiagnosticsMap.set(filePath, await lintFile(filePath))
    })

    // Remove absolute file path patterns.
    // No need to include these patterns in regex,
    // Because we have already run lint on these patterns
    const nonAbsoluteFilePathPatterns = filterArray.filter(
      (pattern) => !path.isAbsolute(pattern)
    )

    if (nonAbsoluteFilePathPatterns.length) {
      const regexPattern = nonAbsoluteFilePathPatterns
        .map((pattern) => `(${pattern})`)
        .join('|')

      const regex = new RegExp(regexPattern)
      const sasFiles = await listSasFilesInFolder(process.projectDir, true, [
        'node_modules'
      ])

      const filesToLint = sasFiles.filter((file) => regex.test(file))

      await asyncForEach(filesToLint, async (file) => {
        const filePath = path.join(process.projectDir, file)
        sasjsDiagnosticsMap.set(filePath, await lintFile(filePath))
      })
    }
  } else {
    // if filterArray is empty, lint whole project
    sasjsDiagnosticsMap = await lintProject()
  }

  sasjsDiagnosticsMap.forEach(
    (sasjsDiagnostics: Diagnostic[], filePath: string) => {
      found.warnings =
        found.warnings ||
        !!sasjsDiagnostics.find(
          (d: Diagnostic) => d.severity === Severity.Warning
        )
      found.errors =
        found.errors ||
        !!sasjsDiagnostics.find(
          (d: Diagnostic) => d.severity === Severity.Error
        )
      if (sasjsDiagnostics.length) {
        displayDiagnostics(filePath, sasjsDiagnostics)
      }
    }
  )

  return found
}

/**
 * Prints Lint Diagnostics as table
 * @param {string} filePath- the path to file having lint violations
 * @param {Diagnostic[]} sasjsDiagnostics- list of lint violations in particular file
 */
const displayDiagnostics = (
  filePath: string,
  sasjsDiagnostics: Diagnostic[]
) => {
  process.logger?.info(`File: ${filePath}`)

  process.logger?.table(
    sasjsDiagnostics.map((d: Diagnostic) => {
      const severity =
        d.severity === Severity.Info
          ? chalk.cyan.bold('Info')
          : d.severity === Severity.Warning
          ? chalk.yellow.bold('Warning')
          : d.severity === Severity.Error
          ? chalk.red.bold('Error')
          : 'Unknown'

      return [severity, d.message, `[${d.lineNumber}, ${d.startColumnNumber}]`]
    })
  ),
    {
      head: ['Severity', 'Message', '[Line #, Col #]']
    }
}

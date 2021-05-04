import chalk from 'chalk'
import { lintProject, Diagnostic, Severity } from '@sasjs/lint'

interface LintResult {
  warnings: boolean
  errors: boolean
}

/**
 * Linting all .sas files in project
 * @returns an object containing booleans `warnings` and `errors`
 */
export async function processLint(): Promise<LintResult> {
  const found: LintResult = { warnings: false, errors: false }
  const sasjsDiagnosticsMap: Map<string, Diagnostic[]> = await lintProject()

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
 * @param {string} filePath- the path to file having offences
 * @param {Diagnostic[]} sasjsDiagnostics- list of offences in particular file
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

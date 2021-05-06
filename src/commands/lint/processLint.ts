import chalk from 'chalk'
import cliTable from 'cli-table'
import { lintProject, Diagnostic, Severity, formatProject } from '@sasjs/lint'

interface LintResult {
  warnings: boolean
  errors: boolean
}

export async function lintFix() {
  await formatProject().then((result) => {
    process.logger?.success(
      `Resolved ${result.fixedDiagnosticsCount} violations.`
    )
    process.logger?.info('Updated files:')
    result.updatedFilePaths.forEach((filePath: string) => {
      process.logger?.info(filePath)
    })
    process.logger?.warn('Unresolved violations: ')
    ;(<Map<string, Diagnostic[]>>result.unfixedDiagnostics).forEach(
      (diagnostics: Diagnostic[], filePath: string) => {
        displayDiagnostics(filePath, diagnostics)
      }
    )
  })
}

/**
 * Lints all .sas files in the current project
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
 * @param {string} filePath- the path to file having lint violations
 * @param {Diagnostic[]} sasjsDiagnostics- list of lint violations in particular file
 */
const displayDiagnostics = (
  filePath: string,
  sasjsDiagnostics: Diagnostic[]
) => {
  process.logger?.info(`File: ${filePath}`)

  const table = new cliTable({
    chars: {
      top: '═',
      'top-mid': '╤',
      'top-left': '╔',
      'top-right': '╗',
      bottom: '═',
      'bottom-mid': '╧',
      'bottom-left': '╚',
      'bottom-right': '╝',
      left: '║',
      'left-mid': '╟',
      mid: '─',
      'mid-mid': '┼',
      right: '║',
      'right-mid': '╢',
      middle: '│'
    },
    head: [
      chalk.white.bold('Severity'),
      chalk.white.bold('Message'),
      chalk.white.bold('[Line #, Col #]')
    ]
  })

  sasjsDiagnostics.forEach((d: Diagnostic) => {
    const severity =
      d.severity === Severity.Info
        ? chalk.cyan.bold('Info')
        : d.severity === Severity.Warning
        ? chalk.yellow.bold('Warning')
        : d.severity === Severity.Error
        ? chalk.red.bold('Error')
        : 'Unknown'

    table.push([
      severity,
      d.message,
      `[${d.lineNumber}, ${d.startColumnNumber}]`
    ])
  })
  process.logger?.log(table.toString() + '\n')
}

import path from 'path'
import chalk from 'chalk'
import cliTable from 'cli-table'
import { lintProject, Diagnostic, Severity } from '@sasjs/lint'

import { asyncForEach } from '../../utils/utils'
import { getSubFoldersInFolder, getFilesInFolder } from '../../utils/file'

interface LintResult {
  warnings: boolean
  errors: boolean
}

const excludeFolders = [
  '.git',
  '.github',
  '.vscode',
  'node_modules',
  'sasjsbuild',
  'sasjsresults'
]

/**
 * Looks for parent folder containing .sasjslint, if found that will be starting point else project directory
 * Linting all .sas files from starting point to sub-directories
 * @returns an object containing booleans `warnings` and `errors`
 */
export async function processLint(): Promise<LintResult> {
  const found = { warnings: false, errors: false }
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

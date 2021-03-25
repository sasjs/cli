import path from 'path'
import chalk from 'chalk'
import cliTable from 'cli-table'
import { lintFile, Diagnostic, Severity } from '@sasjs/lint'
import { getProjectRoot as getDirectoryContainingLintConfig } from '@sasjs/lint/utils/getProjectRoot'

import { asyncForEach } from '../../utils/utils'
import { getSubFoldersInFolder, getFilesInFolder } from '../../utils/file'

interface LintResult {
  warnings: boolean
  errors: boolean
}

/**
 * Looks for parent folder containing .sasjslint, if found that will be starting point else project directory
 * Linting all .sas files from starting point to sub-directories
 * @returns an object containing booleans `warnings` and `errors`
 */
export async function processLint(): Promise<LintResult> {
  const lintConfigFolder =
    (await getDirectoryContainingLintConfig()) || process.projectDir

  return await executeLint(lintConfigFolder)
}

/**
 * Linting all .sas files from provided folder
 * @param {string} folderPath- the path to folder as starting point
 * @returns an object containing booleans `warnings` and `errors`
 */
async function executeLint(folderPath: string): Promise<LintResult> {
  const found = { warnings: false, errors: false }
  const files = (await getFilesInFolder(folderPath)).filter((f: string) =>
    f.endsWith('.sas')
  )

  await asyncForEach(files, async (file) => {
    const filePath = path.join(folderPath, file)
    const sasjsDiagnostics = await lintFile(filePath)

    if (sasjsDiagnostics.length) {
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
      displayDiagnostics(filePath, sasjsDiagnostics)
    }
  })

  const subFolders = (await getSubFoldersInFolder(folderPath)).filter(
    (f: string) => !f.includes('node_modules')
  )

  await asyncForEach(subFolders, async (subFolder) => {
    const result = await executeLint(path.join(folderPath, subFolder))
    found.warnings = found.warnings || result.warnings
    found.errors = found.errors || result.errors
  })

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
  console.log(`File: ${chalk.cyan(filePath)}`)

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
  console.log(table.toString(), '\n')
}

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

export async function processLint(): Promise<LintResult> {
  const lintConfigFolder =
    (await getDirectoryContainingLintConfig()) || process.projectDir

  return await executeLint(lintConfigFolder)
}

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

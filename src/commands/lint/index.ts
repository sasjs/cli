import path from 'path'
import chalk from 'chalk'
import { lintFile, Diagnostic, Severity } from '@sasjs/lint'

import { asyncForEach } from '../../utils/utils'
import { getDirectoryContainingLintConfig } from '../../utils/config'
import { getSubFoldersInFolder, getFilesInFolder } from '../../utils/file'
import { ReturnCode } from '../../types'

export async function processLint(): Promise<ReturnCode> {
  const lintConfigFolder =
    (await getDirectoryContainingLintConfig()) || process.currentDir

  const foundLintErrors = await executeLint(lintConfigFolder)
  return foundLintErrors ? ReturnCode.LintError : ReturnCode.Success
}

async function executeLint(folderPath: string): Promise<boolean> {
  let errorsFound = false
  const files = (await getFilesInFolder(folderPath)).filter((f: string) =>
    f.endsWith('.sas')
  )

  await asyncForEach(files, async (file) => {
    const filePath = path.join(folderPath, file)
    const sasjsDiagnostics = await lintFile(filePath)

    if (sasjsDiagnostics.length) {
      errorsFound = true
      displayDiagnostics(filePath, sasjsDiagnostics)
    }
  })

  const subFolders = (await getSubFoldersInFolder(folderPath)).filter(
    (f: string) => !f.includes('node_modules')
  )

  await asyncForEach(subFolders, async (subFolder) => {
    errorsFound =
      (await executeLint(path.join(folderPath, subFolder))) || errorsFound
  })

  return errorsFound
}

const displayDiagnostics = (
  filePath: string,
  sasjsDiagnostics: Diagnostic[]
) => {
  console.log(`File: ${chalk.cyan(filePath)}`)

  sasjsDiagnostics.forEach((d: Diagnostic) => {
    const message = `${d.message} [${d.lineNumber}, ${d.startColumnNumber}]`

    if (d.severity === Severity.Info) {
      console.log(`  ${chalk.cyan.bold('Info')}:`, message)
    } else if (d.severity === Severity.Warning) {
      console.log(`  ${chalk.yellow.bold('Warning')}:`, message)
    } else if (d.severity === Severity.Error) {
      console.log(`  ${chalk.red.bold('Error')}:`, message)
    }
  })
  console.log('\n')
}

import path from 'path'
import shelljs from 'shelljs'
import chalk from 'chalk'
import ora from 'ora'

import { isWindows } from '../../utils/command'
import { createFolder, deleteFolder } from '../../utils/file'
import { findTargetInConfiguration, getLocalConfig } from '../../utils/config'
import { getConstants } from '../../constants'

import { getFoldersForDocs } from './internal/getFoldersForDocs'
import { getFoldersForDocsAllTargets } from './internal/getFoldersForDocsAllTargets'

export async function generateDocs(targetName: string, outDirectory: string) {
  const { doxyContent, buildDestinationDocsFolder } = getConstants()

  const config = await getLocalConfig()

  if (!outDirectory)
    outDirectory =
      config.docConfig && config.docConfig.outDirectory
        ? config.docConfig.outDirectory
        : buildDestinationDocsFolder

  const rootFolders = getFoldersForDocs(config)
  const targetFolders: string[] = []
  if (targetName) {
    const { target } = await findTargetInConfiguration(targetName)
    targetFolders.push(...getFoldersForDocs(target))
  } else {
    targetFolders.push(...getFoldersForDocsAllTargets(config))
  }

  const combinedFolders = [...new Set([...rootFolders, ...targetFolders])].join(
    ' '
  )

  if (combinedFolders.length === 0) {
    throw new Error(
      `Unable to locate folders for generating docs.\n` +
        `Please add one of these:\n` +
        ` - 'macroFolders'\n` +
        ` - 'programFolders'\n` +
        ` - 'serviceConfig.serviceFolders'\n` +
        ` - 'jobConfig.jobFolders'\n`
    )
  }

  const doxyParams = setVariableCmd({
    DOXY_CONTENT: `${doxyContent}${path.sep}`,
    DOXY_INPUT: combinedFolders,
    DOXY_HTML_OUTPUT: outDirectory
  })

  const doxyConfigPath = path.join(doxyContent, 'Doxyfile')

  const spinner = ora(
    chalk.greenBright('Generating docs', chalk.cyanBright(outDirectory))
  )
  spinner.start()

  await deleteFolder(outDirectory)
  await createFolder(outDirectory)

  const { stderr, code } = shelljs.exec(
    `${doxyParams} doxygen ${doxyConfigPath}`,
    {
      silent: true
    }
  )
  spinner.stop()

  if (code !== 0) {
    if (stderr.startsWith('error: ')) {
      throw new Error(`\n${stderr}`)
    }
    throw new Error(
      `The Doxygen application is not installed or configured. This external tool is used by 'sasjs doc'.\n${stderr}\nPlease download and install from here: https://www.doxygen.nl/download.html#srcbin`
    )
  }

  return { outDirectory }
}

function setVariableCmd(params: any): string {
  let command = ''
  const isWin = isWindows()
  if (isWin) {
    for (const param in params) {
      command += `set ${param}=${params[param]} && `
    }
  } else {
    for (const param in params) {
      command += `${param}="${params[param]}" `
    }
  }
  return command
}

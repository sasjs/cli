import path from 'path'
import shelljs from 'shelljs'
import chalk from 'chalk'
import ora from 'ora'

import { isWindows } from '../../utils/command'
import { createFolder, deleteFolder, folderExists } from '../../utils/file'
import { getLocalConfig } from '../../utils/config'
import { getConstants } from '../../constants'

import { getFoldersForDocs } from './internal/getFoldersForDocs'
import { createDotFiles } from './internal/createDotFiles'

/**
 * Generates documentation(Doxygen)
 * By default the docs will be at 'sasjsbuild/docs' folder
 * If a target is supplied, generates docs only for the SAS programs / macros / jobs / services in that target (and the root).
 * If no target is supplied, generates for all sas programs/ macros / jobs / services.
 * @param {string} targetName- the name of the target to be specific for docs.
 * @param {string} outDirectory- the name of the output folder, picks from sasjsconfig.docConfig if present.
 */
export async function generateDocs(targetName: string, outDirectory: string) {
  const { doxyContent, buildDestinationDocsFolder } = getConstants()

  const config = await getLocalConfig()

  if (!outDirectory)
    outDirectory = config?.docConfig?.outDirectory || buildDestinationDocsFolder

  const {
    macroCore: macroCoreFolders,
    macro: macroFolders,
    program: programFolders,
    service: serviceFolders,
    job: jobFolders
  } = await getFoldersForDocs(targetName, config)

  const combinedFolders = [
    ...new Set([
      ...macroCoreFolders,
      ...macroFolders,
      ...programFolders,
      ...serviceFolders,
      ...jobFolders
    ])
  ].join(' ')

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

  const foldersListForDot = [...new Set([...serviceFolders, ...jobFolders])]

  await createDotFiles(foldersListForDot, outDirectory)

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

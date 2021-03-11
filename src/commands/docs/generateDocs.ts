import path from 'path'
import shelljs from 'shelljs'
import chalk from 'chalk'
import ora from 'ora'

import { isWindows } from '../../utils/command'
import {
  createFolder,
  deleteFolder,
  folderExists,
  readFile
} from '../../utils/file'
import { getLocalConfig } from '../../utils/config'
import { getConstants } from '../../constants'

import { getFoldersForDocs } from './internal/getFoldersForDocs'
import { createDotFiles } from './internal/createDotFiles'
import { getDocConfig } from './internal/getDocConfig'

/**
 * Generates documentation(Doxygen)
 * By default the docs will be at 'sasjsbuild/docs' folder
 * If a target is supplied, generates docs only for the SAS programs / macros / jobs / services in that target (and the root).
 * If no target is supplied, generates for all sas programs/ macros / jobs / services.
 * @param {string} targetName- the name of the target to be specific for docs.
 * @param {string} outDirectory- the name of the output folder, picks from sasjsconfig.docConfig if present.
 */
export async function generateDocs(targetName: string, outDirectory: string) {
  const { doxyContent } = getConstants()

  const config = await getLocalConfig()
  const {
    target,
    serverUrl,
    newOutDirectory,
    enableLineage
  } = await getDocConfig(config, targetName, outDirectory)

  const {
    macroCore: macroCoreFolders,
    macro: macroFolders,
    program: programFolders,
    service: serviceFolders,
    job: jobFolders
  } = await getFoldersForDocs(target, config)

  const combinedFolders = [
    ...new Set([
      ...macroCoreFolders,
      ...macroFolders,
      ...programFolders,
      ...serviceFolders,
      ...jobFolders
    ])
  ]
    .map((fpath: string) => `"${fpath}"`)
    .join(' ')

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

  let PROJECT_NAME = `Please update the 'name' property in the package.json file`
  let PROJECT_BRIEF = `Please update the 'description' property in the package.json file`

  try {
    const packageJsonContent = await readFile(
      path.join(process.projectDir, 'package.json')
    )
    const packageJson = JSON.parse(packageJsonContent)
    PROJECT_NAME = packageJson.name || PROJECT_NAME
    PROJECT_BRIEF =
      packageJson.description.replace(/`/g, '\\`') || PROJECT_BRIEF
  } catch (e) {
    process.logger?.info(`Unable to parse content of 'package.json'`)
  }

  const DOXY_CONTENT = `${doxyContent}${path.sep}`
  const doxyParams = setVariableCmd({
    DOXY_CONTENT,
    DOXY_HTML_OUTPUT: newOutDirectory,
    DOXY_INPUT: `"${DOXY_CONTENT}../../README.md" ${combinedFolders}`,
    HTML_EXTRA_FILES: `"${DOXY_CONTENT}favicon.ico"`,
    HTML_EXTRA_STYLESHEET: `"${DOXY_CONTENT}new_stylesheet.css"`,
    HTML_FOOTER: `${DOXY_CONTENT}new_footer.html`,
    HTML_HEADER: `${DOXY_CONTENT}new_header.html`,
    LAYOUT_FILE: `${DOXY_CONTENT}DoxygenLayout.xml`,
    PROJECT_BRIEF,
    PROJECT_LOGO: `${DOXY_CONTENT}logo.png`,
    PROJECT_NAME
  })

  const doxyConfigPath = path.join(doxyContent, 'Doxyfile')

  const spinner = ora(
    chalk.greenBright('Generating docs', chalk.cyanBright(newOutDirectory))
  )
  spinner.start()

  await deleteFolder(newOutDirectory)
  await createFolder(newOutDirectory)

  const { stderr, code } = shelljs.exec(
    `${doxyParams} doxygen "${doxyConfigPath}"`,
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

  if (enableLineage) {
    const foldersListForDot = [...new Set([...serviceFolders, ...jobFolders])]

    await createDotFiles(foldersListForDot, newOutDirectory, serverUrl)
  }

  return { outDirectory: newOutDirectory }
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
      command += `${param}='${params[param]}' `
    }
  }
  return command
}

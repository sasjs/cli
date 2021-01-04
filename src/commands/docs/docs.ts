import path from 'path'
import shelljs from 'shelljs'
import chalk from 'chalk'
import ora from 'ora'

import { createFolder } from '../../utils/file'
import { findTargetInConfiguration, getLocalConfig } from '../../utils/config'
import { getConstants } from '../../constants'

import { getFoldersForDocs } from './internal/getFoldersForDocs'
import { getFoldersForDocsAllTargets } from './internal/getFoldersForDocsAllTargets'

export async function docs(targetName: string, outDirectory: string) {
  const { doxyContent, buildDestinationDocsFolder } = getConstants()
  if (!outDirectory) outDirectory = buildDestinationDocsFolder

  const config = await getLocalConfig()
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

  const doxyParams =
    `DOXY_CONTENT=${doxyContent}${path.sep} ` +
    `DOXY_INPUT="${combinedFolders}" ` +
    `DOXY_HTML_OUTPUT=${outDirectory}`

  const doxyConfigPath = path.join(doxyContent, 'Doxyfile')

  const spinner = ora(
    chalk.greenBright('Generating docs', chalk.cyanBright(outDirectory))
  )
  spinner.start()

  await createFolder(outDirectory)
  shelljs.exec(`${doxyParams} doxygen ${doxyConfigPath}`, {
    silent: true
  })
  spinner.stop()
}

import { getConstants } from '../../constants'

import { getLocalConfig } from '../../utils/config'
import { getFoldersForDocs } from './internal/getFoldersForDocs'
import { createDotFiles } from './internal/createDotFiles'
import { getDocConfig } from './internal/getDocConfig'

/**
 * Generates lineage in dot language
 * By default the dot files will be at 'sasjsbuild/docs' folder
 * If a target is supplied, generates dot files only for the jobs / services in that target (and the root).
 * If no target is supplied, generates for all jobs / services.
 * @param {string} targetName- the name of the target to be specific for dot files.
 * @param {string} outDirectory- the name of the output folder, picks from sasjsconfig.docConfig if present.
 */
export async function generateDot(targetName: string, outDirectory: string) {
  const { doxyContent } = getConstants()

  const config = await getLocalConfig()

  let serverUrl = ''
  ;({ serverUrl, outDirectory } = getDocConfig(config, outDirectory))

  const { service: serviceFolders, job: jobFolders } = await getFoldersForDocs(
    targetName,
    config
  )

  const folderList = [...new Set([...serviceFolders, ...jobFolders])]

  console.log(serverUrl)
  await createDotFiles(folderList, outDirectory, serverUrl)

  return { outDirectory }
}

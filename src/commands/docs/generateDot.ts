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
 * @param {string} outDirectoryInput- the name of the output folder, picks from sasjsconfig.docConfig if present.
 */
export async function generateDot(
  targetName: string,
  outDirectoryInput: string
) {
  const { doxyContent } = getConstants()

  const config = await getLocalConfig()

  const { target, serverUrl, outDirectory } = await getDocConfig(
    config,
    targetName,
    outDirectoryInput
  )

  const { service: serviceFolders, job: jobFolders } = await getFoldersForDocs(
    target,
    config
  )

  const folderList = [...new Set([...serviceFolders, ...jobFolders])]

  await createDotFiles(folderList, outDirectory, serverUrl)

  return { outDirectory }
}

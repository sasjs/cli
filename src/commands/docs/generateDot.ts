import { getLocalConfig } from '../../utils/config'
import { getFoldersForDocs } from './internal/getFoldersForDocs'
import { createDotFiles } from './internal/createDotFiles'
import { getDocConfig } from './internal/getDocConfig'
import { Target } from '@sasjs/utils'

/**
 * Generates lineage in dot language
 * By default the dot files will be at 'sasjsbuild/docs' folder
 * Generates dot files only for the jobs / services in target (and the root).
 * If no target is supplied, first target from sasjsconfig will be used.
 * @param {string} target- the target for dot files.
 * @param {string} outDirectory- the name of the output folder, picks from sasjsconfig.docConfig if present.
 */
export async function generateDot(target: Target, outDirectory: string) {
  const config = await getLocalConfig()

  const { serverUrl, newOutDirectory } = await getDocConfig(
    config,
    target,
    outDirectory
  )

  const { service: serviceFolders, job: jobFolders } = await getFoldersForDocs(
    target,
    config
  )

  const folderList = [...new Set([...serviceFolders, ...jobFolders])]

  await createDotFiles(folderList, newOutDirectory, serverUrl)

  return { outDirectory: newOutDirectory }
}

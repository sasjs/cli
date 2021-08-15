import { getFoldersForDocs } from './internal/getFoldersForDocs'
import { createDotFiles } from './internal/createDotFiles'
import { getDocConfig } from './internal/getDocConfig'
import { Configuration, Target } from '@sasjs/utils'

/**
 * Generates lineage in dot language
 * By default the dot files will be at 'sasjsbuild/docs' folder
 * Generates dot files only for the jobs / services in target (and the root).
 * If no target is supplied, first target from sasjsconfig will be used.
 * @param {string} target- the target for dot files.
 * @param {string} outDirectory- the name of the output folder, picks from sasjsconfig.docConfig if present.
 */
export async function generateDot(
  target?: Target,
  config?: Configuration,
  outDirectory?: string
): Promise<{ outDirectory: string }> {
  const { serverUrl, newOutDirectory } = getDocConfig(
    target,
    config,
    outDirectory
  )

  const { service: serviceFolders, job: jobFolders } = getFoldersForDocs(
    target,
    config
  )

  const folderList = [...new Set([...serviceFolders, ...jobFolders])]

  await createDotFiles(folderList, newOutDirectory, serverUrl)

  return { outDirectory: newOutDirectory }
}

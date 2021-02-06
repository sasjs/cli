import { Configuration } from '../../../types/configuration'
import { getFoldersForDocs } from './getFoldersForDocs'

/**
 * Returns list of folders for documentation for all targets
 * @param {Configuration} config- from which folders list will be extracted
 */
export function getFoldersForDocsAllTargets(config: Configuration) {
  const folders: string[] = []
  if (config && config.targets) {
    config.targets.forEach((t) => {
      folders.push(...getFoldersForDocs(t))
    })
  }
  return folders
}

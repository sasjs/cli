import { Configuration } from '../../../types/configuration'
import { getFoldersForDocs } from './getFoldersForDocs'

export function getFoldersForDocsAllTargets(config: Configuration) {
  const folders: string[] = []
  if (config && config.targets) {
    config.targets.forEach((t) => {
      folders.push(...getFoldersForDocs(t))
    })
  }
  return folders
}

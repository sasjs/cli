import { Configuration } from '../../../types/configuration'
import { getFoldersForDocsFromConfig } from './getFoldersForDocsFromConfig'

/**
 * Returns list of folders for documentation for all targets
 * @param {Configuration} config- from which folders list will be extracted
 */
export function getFoldersForDocsAllTargets(config: Configuration) {
  const folders: {
    macroCore: string[]
    macro: string[]
    program: string[]
    service: string[]
    job: string[]
  } = {
    macroCore: [],
    macro: [],
    program: [],
    service: [],
    job: []
  }
  if (config && config.targets) {
    config.targets.forEach((t) => {
      const targetFolders = getFoldersForDocsFromConfig(t)

      folders.macroCore = folders.macroCore.concat(targetFolders.macroCore)
      folders.macro = folders.macro.concat(targetFolders.macro)
      folders.program = folders.program.concat(targetFolders.program)
      folders.service = folders.service.concat(targetFolders.service)
      folders.job = folders.job.concat(targetFolders.job)
    })
  }
  return folders
}

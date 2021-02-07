import path from 'path'
import { getConstants } from '../../../constants'

import { Target } from '@sasjs/utils'
import { Configuration } from '../../../types/configuration'

/**
 * Returns list of folders for documentation( macroCore / macros / SAS programs/ services / jobs )
 * @param {Target | Configuration} config- from which folders list will be extracted
 */
export function getFoldersForDocsFromConfig(config: Target | Configuration) {
  const { buildSourceFolder } = getConstants()

  const macroCoreFolders =
    config instanceof Target && config?.docConfig?.displayMacroCore === false
      ? []
      : [path.join(process.projectDir, 'node_modules', '@sasjs', 'core')]
  const macroFolders =
    config && config.macroFolders
      ? config.macroFolders.map((f) => path.join(buildSourceFolder, f))
      : []
  const programFolders =
    config && config.programFolders
      ? config.programFolders.map((f) => path.join(buildSourceFolder, f))
      : []
  const serviceFolders =
    config && config.serviceConfig && config.serviceConfig.serviceFolders
      ? config.serviceConfig.serviceFolders.map((f) =>
          path.join(buildSourceFolder, f)
        )
      : []
  const jobFolders =
    config && config.jobConfig && config.jobConfig.jobFolders
      ? config.jobConfig.jobFolders.map((f) => path.join(buildSourceFolder, f))
      : []

  return {
    macroCore: macroCoreFolders,
    macro: macroFolders,
    program: programFolders,
    service: serviceFolders,
    job: jobFolders
  }
}

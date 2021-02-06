import path from 'path'
import { getConstants } from '../../../constants'

import { Target } from '@sasjs/utils'
import { Configuration } from '../../../types/configuration'

/**
 * Returns list of folders for documentation( macroCore / macros / SAS programs/ services / jobs )
 * @param {Target | Configuration} config- from which folders list will be extracted
 * @param {boolean} root- tells if param config is of specific target or not, in case of root level it will add macroCore folder to list conditionally
 */
export function getFoldersForDocs(
  config: Target | Configuration,
  root: boolean = false
) {
  const { buildSourceFolder } = getConstants()
  let macroCoreFolders: string[] = []
  if (root)
    macroCoreFolders =
      (config as Configuration)?.docConfig?.displayMacroCore === false
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

  return [
    ...macroCoreFolders,
    ...macroFolders,
    ...programFolders,
    ...serviceFolders,
    ...jobFolders
  ]
}

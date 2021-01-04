import path from 'path'
import { getConstants } from '../../../constants'

import { Target } from '@sasjs/utils'
import { Configuration } from '../../../types/configuration'

export function getFoldersForDocs(config: Target | Configuration) {
  const { buildSourceFolder } = getConstants()
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

  return [...macroFolders, ...programFolders, ...serviceFolders, ...jobFolders]
}

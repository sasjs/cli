import path from 'path'

import { Target, Configuration } from '@sasjs/utils/types'
import { getConstants } from '../../../constants'

/**
 * Returns list of folders for documentation( macroCore / macros / SAS programs/ services / jobs )
 * @param {Target} target- target for docs.
 * @param {Configuration} config- sasjsconfig.json
 */
export async function getFoldersForDocs(target: Target, config: Configuration) {
  let macroCore = []

  const rootFolders = extractFoldersForDocs(config)
  macroCore = rootFolders.macroCore

  const targetFolders = extractFoldersForDocs(target)
  if (target?.docConfig?.displayMacroCore !== undefined)
    macroCore = targetFolders.macroCore

  return {
    macroCore,
    macro: rootFolders.macro.concat(targetFolders.macro),
    program: rootFolders.program.concat(targetFolders.program),
    service: rootFolders.service.concat(targetFolders.service),
    job: rootFolders.job.concat(targetFolders.job)
  }
}

function extractFoldersForDocs(config: Target | Configuration) {
  const { buildSourceFolder } = getConstants()

  const macroCoreFolders =
    config?.docConfig?.displayMacroCore === false
      ? []
      : [path.join(process.projectDir, 'node_modules', '@sasjs', 'core')]

  const macroFolders =
    config && config.macroFolders
      ? config.macroFolders.map((f) =>
          path.isAbsolute(f) ? f : path.join(buildSourceFolder, f)
        )
      : []
  const programFolders =
    config && config.programFolders
      ? config.programFolders.map((f) =>
          path.isAbsolute(f) ? f : path.join(buildSourceFolder, f)
        )
      : []
  const serviceFolders =
    config && config.serviceConfig && config.serviceConfig.serviceFolders
      ? config.serviceConfig.serviceFolders.map((f) =>
          path.isAbsolute(f) ? f : path.join(buildSourceFolder, f)
        )
      : []
  const jobFolders =
    config && config.jobConfig && config.jobConfig.jobFolders
      ? config.jobConfig.jobFolders.map((f) =>
          path.isAbsolute(f) ? f : path.join(buildSourceFolder, f)
        )
      : []

  return {
    macroCore: macroCoreFolders,
    macro: macroFolders,
    program: programFolders,
    service: serviceFolders,
    job: jobFolders
  }
}

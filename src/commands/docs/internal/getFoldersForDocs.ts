import { Target, Configuration, getAbsolutePath } from '@sasjs/utils'

/**
 * Returns list of folders for documentation( macroCore / macros / SAS programs/ services / jobs )
 * @param {Target} target- target for docs.
 * @param {Configuration} config- sasjsconfig.json
 */
export function getFoldersForDocs(target?: Target, config?: Configuration) {
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

function extractFoldersForDocs(config?: Target | Configuration) {
  const { buildSourceFolder } = process.sasjsConstants

  const macroCoreFolders =
    config?.docConfig?.displayMacroCore === false
      ? []
      : [process.sasjsConstants.macroCorePath]

  const macroFolders = config?.macroFolders
    ? config.macroFolders.map((f) => getAbsolutePath(f, buildSourceFolder))
    : []
  const programFolders = config?.programFolders
    ? config.programFolders.map((f) => getAbsolutePath(f, buildSourceFolder))
    : []
  const serviceFolders = config?.serviceConfig?.serviceFolders
    ? config.serviceConfig.serviceFolders.map((f) =>
        getAbsolutePath(f, buildSourceFolder)
      )
    : []
  const jobFolders = config?.jobConfig?.jobFolders
    ? config.jobConfig.jobFolders.map((f) =>
        getAbsolutePath(f, buildSourceFolder)
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

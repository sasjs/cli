import path from 'path'
import { getConstants } from '../../../constants'

import { Target } from '@sasjs/utils'
import { Configuration } from '../../../types/configuration'
import { findTargetInConfiguration } from '../../../utils/config'

import { getFoldersForDocsFromConfig } from './getFoldersForDocsFromConfig'
import { getFoldersForDocsAllTargets } from './getFoldersForDocsAllTargets'

/**
 * Returns list of folders for documentation( macroCore / macros / SAS programs/ services / jobs )
 * @param {string} targetName- the name of the target to be specific for docs.
 * @param {Configuration} config- sasjsconfig.json
 */
export async function getFoldersForDocs(
  targetName: string,
  config: Configuration
) {
  const rootFolders = getFoldersForDocsFromConfig(config, true)
  let targetFolders
  if (targetName) {
    const { target } = await findTargetInConfiguration(targetName)
    targetFolders = getFoldersForDocsFromConfig(target)
  } else {
    targetFolders = getFoldersForDocsAllTargets(config)
  }

  return {
    macroCore: rootFolders.macroCore.concat(targetFolders.macroCore),
    macro: rootFolders.macro.concat(targetFolders.macro),
    program: rootFolders.program.concat(targetFolders.program),
    service: rootFolders.service.concat(targetFolders.service),
    job: rootFolders.job.concat(targetFolders.job)
  }
}

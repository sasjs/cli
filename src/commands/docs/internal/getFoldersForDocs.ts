import path from 'path'

import { Target } from '@sasjs/utils'
import { Configuration } from '../../../types/configuration'

import { getFoldersForDocsFromConfig } from './getFoldersForDocsFromConfig'

/**
 * Returns list of folders for documentation( macroCore / macros / SAS programs/ services / jobs )
 * @param {Target} target- target for docs.
 * @param {Configuration} config- sasjsconfig.json
 */
export async function getFoldersForDocs(target: Target, config: Configuration) {
  const rootFolders = getFoldersForDocsFromConfig(config)
  const targetFolders = getFoldersForDocsFromConfig(target)

  return {
    macroCore: rootFolders.macroCore.concat(targetFolders.macroCore),
    macro: rootFolders.macro.concat(targetFolders.macro),
    program: rootFolders.program.concat(targetFolders.program),
    service: rootFolders.service.concat(targetFolders.service),
    job: rootFolders.job.concat(targetFolders.job)
  }
}

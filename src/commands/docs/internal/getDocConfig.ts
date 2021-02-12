import { Target } from '@sasjs/utils/types'
import { Configuration } from '../../../types/configuration'
import { findTargetInConfiguration } from '../../../utils/config'
import { getConstants } from '../../../constants'

/**
 * Returns doc related config from root-level and Target-specfic(having precedence)
 * @param {Configuration} config- from which doc related config will be extracted
 * @param {string} targetName- the name of the target for dot files.
 * @param {string} outDirectory- the name of the output folder, provided using command.
 */
export async function getDocConfig(
  config: Configuration,
  targetName: string,
  outDirectory: string
) {
  const { buildDestinationDocsFolder } = getConstants()

  let target: Target = {} as Target
  try {
    target = (await findTargetInConfiguration(targetName, false, true)).target
  } catch (error) {}

  if (!outDirectory) {
    outDirectory = config?.docConfig?.outDirectory || buildDestinationDocsFolder
    outDirectory = target?.docConfig?.outDirectory || outDirectory
  }

  let serverUrl = ''
  serverUrl = config?.docConfig?.dataControllerUrl
    ? config.docConfig.dataControllerUrl.split('#')[0] + '#/view/viewer/'
    : ''
  serverUrl = target?.docConfig?.dataControllerUrl
    ? target.docConfig.dataControllerUrl.split('#')[0] + '#/view/viewer/'
    : serverUrl

  let disableLineage: boolean = !!config.docConfig?.disableLineage
  if (target.docConfig?.disableLineage !== undefined)
    disableLineage = target.docConfig.disableLineage

  return { target, serverUrl, newOutDirectory: outDirectory, disableLineage }
}

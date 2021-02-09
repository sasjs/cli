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

  const { target } = await findTargetInConfiguration(targetName)

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

  return { target, serverUrl, newOutDirectory: outDirectory }
}

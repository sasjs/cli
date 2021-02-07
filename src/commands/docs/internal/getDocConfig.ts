import { Configuration } from '../../../types/configuration'
import { findTargetInConfiguration } from '../../../utils/config'
import { getConstants } from '../../../constants'

export async function getDocConfig(
  config: Configuration,
  targetName: string,
  outDirectory: string
) {
  const { buildDestinationDocsFolder } = getConstants()

  const { target } = await findTargetInConfiguration(targetName)

  if (!outDirectory)
    outDirectory = target?.docConfig?.outDirectory || buildDestinationDocsFolder

  const serverUrl = target?.docConfig?.dataControllerUrl
    ? target.docConfig.dataControllerUrl.split('#')[0] + '#/view/viewer/'
    : ''

  return { target, serverUrl, outDirectory }
}

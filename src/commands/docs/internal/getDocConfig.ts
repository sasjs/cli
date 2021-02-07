import { Configuration } from '../../../types/configuration'
import { getConstants } from '../../../constants'

export function getDocConfig(config: Configuration, outDirectory: string) {
  const { buildDestinationDocsFolder } = getConstants()

  if (!outDirectory)
    outDirectory = config?.docConfig?.outDirectory || buildDestinationDocsFolder

  let serverUrl = config?.docConfig?.dataControllerUrl
    ? config.docConfig.dataControllerUrl.split('#')[0] + '#/view/viewer/'
    : ''

  return { outDirectory, serverUrl }
}

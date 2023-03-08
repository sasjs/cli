import { Target } from '@sasjs/utils'
import { Configuration, ServerType } from '@sasjs/utils/types'
import { getGlobalRcFile, getLocalConfig } from '../../../utils/config'

/**
 * Returns server type for 'compile' step.
 * If target is not present, it looks for serverType at root level
 * Default value for serverType is 'SASVIYA'
 * @param {Target} target- the target to check server type.
 */
export async function getServerType(target: Target): Promise<ServerType> {
  if (target?.serverType) return target.serverType

  const { isLocal } = process.sasjsConstants
  const configuration: Configuration = isLocal
    ? await getLocalConfig()
    : await getGlobalRcFile()

  return configuration?.serverType
    ? configuration.serverType
    : ServerType.SasViya
}

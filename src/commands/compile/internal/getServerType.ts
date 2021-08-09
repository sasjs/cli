import { Target } from '@sasjs/utils'
import { ServerType } from '@sasjs/utils/types'
import { getLocalOrGlobalConfig } from '../../../utils/config'

/**
 * Returns server type for 'compile' step.
 * If target is not present, it looks for serverType at root level
 * Default value for serverType is 'SASVIYA'
 * @param {Target} target- the target to check server type.
 */
export async function getServerType(target: Target): Promise<ServerType> {
  if (target?.serverType) return target.serverType

  const { configuration } = await getLocalOrGlobalConfig()

  return configuration?.serverType
    ? configuration.serverType
    : ServerType.SasViya
}

import { Target } from '@sasjs/utils'
import path from 'path'
import { ServerType } from '@sasjs/utils/types'
import { getConstants } from '../../../constants'
import { getConfiguration } from '../../../utils/config'

/**
 * Returns server type for 'compile' step.
 * If target is not present, it looks for serverType at root level
 * Default value for serverType is 'SASVIYA'
 * @param {Target} target- the target to check server type.
 */
export async function getServerType(target: Target): Promise<ServerType> {
  if (target?.serverType) return target.serverType

  const { buildSourceFolder } = getConstants()

  const configuration = await getConfiguration(
    path.join(buildSourceFolder, 'sasjs', 'sasjsconfig.json')
  )

  return configuration?.serverType
    ? configuration.serverType
    : ServerType.SasViya
}

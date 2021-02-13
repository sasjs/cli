import { Target } from '@sasjs/utils'
import path from 'path'
import { ServerType } from '@sasjs/utils/types'
import { getConstants } from '../../../constants'
import { getConfiguration } from '../../../utils/config'

export async function getServerType(target: Target): Promise<ServerType> {
  if (target?.serverType) return target.serverType

  const { buildSourceFolder } = getConstants()

  const configuration = await getConfiguration(
    path.join(buildSourceFolder, 'sasjs', 'sasjsconfig.json')
  )

  return configuration?.serverType ? configuration.serverType : ServerType.Sas9
}

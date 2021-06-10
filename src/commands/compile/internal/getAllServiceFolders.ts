import path from 'path'
import { Target } from '@sasjs/utils'
import { getConstants } from '../../../constants'
import { getLocalOrGlobalConfig } from '../../../utils/config'

export async function getAllServiceFolders(target: Target) {
  const { configuration } = await getLocalOrGlobalConfig()
  let allServices: string[] = []

  if (configuration?.serviceConfig?.serviceFolders)
    allServices = [...configuration.serviceConfig.serviceFolders]

  if (target?.serviceConfig?.serviceFolders)
    allServices = [...allServices, ...target.serviceConfig.serviceFolders]

  allServices = allServices.filter((p) => !!p)

  const { buildSourceFolder } = await getConstants()
  allServices = allServices.map((service) =>
    path.isAbsolute(service) ? service : path.join(buildSourceFolder, service)
  )

  return [...new Set(allServices)]
}

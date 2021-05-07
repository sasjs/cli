import { Target } from '@sasjs/utils'
import { getLocalOrGlobalConfig } from '../../../utils/config'

export async function getAllServiceFolders(target: Target) {
  const { configuration } = await getLocalOrGlobalConfig()
  let allServices: string[] = []

  if (configuration?.serviceConfig?.serviceFolders)
    allServices = [...configuration.serviceConfig.serviceFolders]

  if (target?.serviceConfig?.serviceFolders)
    allServices = [...allServices, ...target.serviceConfig.serviceFolders]

  allServices = allServices.filter((p) => !!p)

  return [...new Set(allServices)]
}

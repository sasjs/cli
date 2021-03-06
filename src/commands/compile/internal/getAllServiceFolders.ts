import { Target } from '@sasjs/utils'
import path from 'path'
import { getConstants } from '../../../constants'
import { getConfiguration } from '../../../utils/config'

export async function getAllServiceFolders(target: Target) {
  const { buildSourceFolder } = getConstants()

  const configuration = await getConfiguration(
    path.join(buildSourceFolder, 'sasjs', 'sasjsconfig.json')
  )
  let allServices: string[] = []

  if (configuration?.serviceConfig?.serviceFolders)
    allServices = [...configuration.serviceConfig.serviceFolders]

  if (target?.serviceConfig?.serviceFolders)
    allServices = [...allServices, ...target.serviceConfig.serviceFolders]

  allServices = allServices.filter((p) => !!p)

  return [...new Set(allServices)]
}

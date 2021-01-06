import { Target } from '@sasjs/utils'
import path from 'path'
import { getConstants } from '../../../constants'
import { getConfiguration } from '../../../utils/config'

export async function getDeployScripts(target: Target) {
  const { buildSourceFolder } = getConstants()
  const configuration = await getConfiguration(
    path.join(buildSourceFolder, 'sasjsconfig.json')
  )

  let allDeployScripts: string[] = [
    ...(configuration?.deployConfig?.deployScripts || [])
  ]

  allDeployScripts = [
    ...allDeployScripts,
    ...(target.deployConfig?.deployScripts || [])
  ]

  allDeployScripts = allDeployScripts.filter((d) => !!d)
  return [...new Set(allDeployScripts)]
}

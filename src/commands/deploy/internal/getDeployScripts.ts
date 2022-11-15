import { Target } from '@sasjs/utils'
import path from 'path'
import { getConfiguration } from '../../../utils/config'

export async function getDeployScripts(target: Target) {
  const { buildSourceFolder } = process.sasjsConstants
  const configuration = await getConfiguration(
    path.join(buildSourceFolder, 'sasjs', 'sasjsconfig.json')
  )

  const allDeployScripts: string[] = [
    ...(configuration?.deployConfig?.deployScripts || []),
    ...(target.deployConfig?.deployScripts || [])
  ]

  return [...new Set(allDeployScripts.filter((d) => !!d))]
}

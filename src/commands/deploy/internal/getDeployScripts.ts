import { ServerType, Target } from '@sasjs/utils'
import path from 'path'
import { getConstants } from '../../../constants'
import { getConfiguration } from '../../../utils/config'

export async function getDeployScripts(target: Target) {
  const { buildSourceFolder, buildDestinationFolder } = await getConstants()
  const configuration = await getConfiguration(
    path.join(buildSourceFolder, 'sasjs', 'sasjsconfig.json')
  )

  let allDeployScripts: string[] = [
    ...(configuration?.deployConfig?.deployScripts || [])
  ]

  allDeployScripts = [
    ...allDeployScripts,
    ...(target.deployConfig?.deployScripts || [])
  ]

  if (
    !!target.deployConfig?.deployServicePack &&
    target.serverType === ServerType.Sas9
  ) {
    const buildOutputFileName =
      target.buildConfig?.buildOutputFileName || `${target.name}.sas`
    const deployScriptPath = path.join(
      buildDestinationFolder,
      buildOutputFileName
    )
    allDeployScripts = [...allDeployScripts, deployScriptPath]
  }

  allDeployScripts = allDeployScripts.filter((d) => !!d)
  return [...new Set(allDeployScripts)]
}

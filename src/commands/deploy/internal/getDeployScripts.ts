import { Target } from '@sasjs/utils'

export async function getDeployScripts(target: Target) {
  const configuration = process.sasjsConfig

  const allDeployScripts: string[] = [
    ...(configuration?.deployConfig?.deployScripts || []),
    ...(target.deployConfig?.deployScripts || [])
  ]

  return [...new Set(allDeployScripts.filter((d) => !!d))]
}

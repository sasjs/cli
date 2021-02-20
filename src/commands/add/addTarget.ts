import { Target, ServerType } from '@sasjs/utils/types'
import {
  findTargetInConfiguration,
  saveToGlobalConfig,
  saveToLocalConfig
} from '../../utils/config'
import { TargetScope } from '../../types/targetScope'
import {
  getCommonFields,
  getAndValidateSasViyaFields,
  getAndValidateSas9Fields
} from './internal/input'
import { addCredential } from './addCredential'

/**
 * Creates new target for either local config or global config file.
 * @param {boolean} insecure- boolean to use insecure connection, default is false. lf true the server will not reject any connection which is not authorized with the list of supplied CAs
 */
export async function addTarget(insecure: boolean = false): Promise<boolean> {
  if (insecure) process.logger?.warn('Executing with insecure connection.')

  const { scope, serverType, name, appLoc, serverUrl } = await getCommonFields()

  let targetJson: any = {
    name,
    serverType,
    serverUrl,
    appLoc
  }

  let filePath = await saveConfig(scope, new Target(targetJson))

  process.logger?.info(`Target configuration has been saved to ${filePath} .`)

  if (serverType === ServerType.Sas9) {
    const { serverName, repositoryName } = await getAndValidateSas9Fields()
    targetJson = {
      ...targetJson,
      serverName,
      repositoryName
    }
  } else {
    const { contextName } = await getAndValidateSasViyaFields(
      name,
      scope,
      serverUrl,
      insecure,
      addCredential
    )

    targetJson = {
      ...targetJson,
      contextName,
      deployConfig: {
        deployServicePack: true,
        deployScripts: []
      }
    }

    const { target: currentTarget } = await findTargetInConfiguration(name)
    targetJson = { ...currentTarget.toJson(), ...targetJson }
  }

  filePath = await saveConfig(scope, new Target(targetJson))

  process.logger?.info(`Target configuration has been saved to ${filePath}`)

  return true
}

async function saveConfig(scope: TargetScope, target: Target) {
  let filePath = ''

  if (scope === TargetScope.Local) {
    filePath = await saveToLocalConfig(target as Target)
  } else if (scope === TargetScope.Global) {
    filePath = await saveToGlobalConfig(target as Target)
  }

  return filePath
}

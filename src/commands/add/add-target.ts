import { Target, ServerType } from '@sasjs/utils/types'
import {
  findTargetInConfiguration,
  saveToGlobalConfig,
  saveToLocalConfig
} from '../../utils/config-utils'
import { TargetScope } from '../../types/targetScope'
import {
  getCommonFields,
  getAndValidateSasViyaFields,
  getAndValidateSas9Fields
} from './internal/input'
import { addCredential } from './add-credential'

export async function addTarget(): Promise<boolean> {
  const { scope, serverType, name, appLoc, serverUrl } = await getCommonFields()

  let targetJson: any = {
    name,
    serverType: serverType,
    serverUrl,
    appLoc
  }

  let filePath = await saveConfig(scope, new Target(targetJson))
  process.logger?.info(`Target configuration has been saved to ${filePath}.`)

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
  process.logger?.info(`Target configuration has been saved to ${filePath}.`)
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

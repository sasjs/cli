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
  getAndValidateSas9Fields,
  getIsDefault
} from './internal/input'
import { addCredential, createEnvFileForSas9 } from './addCredential'

/**
 * Creates new target/ updates current target(if found) for either local config or global config file.
 * @param {boolean} insecure- boolean to use insecure connection, default is false. lf true the server will not reject any connection which is not authorized with the list of supplied CAs
 */
export async function addTarget(insecure: boolean = false): Promise<boolean> {
  if (insecure) process.logger?.warn('Executing with insecure connection.')

  const { scope, serverType, name, appLoc, serverUrl, existingTarget } =
    await getCommonFields()

  const saveWithDefaultValues = !existingTarget

  let targetJson: any = {
    ...existingTarget,
    name,
    serverType,
    serverUrl,
    appLoc
  }

  let filePath = await saveConfig(
    scope,
    new Target(targetJson),
    false,
    saveWithDefaultValues
  )

  process.logger?.info(`Target configuration has been saved to ${filePath} .`)

  if (serverType === ServerType.Sas9) {
    const { serverName, repositoryName, userName, password } =
      await getAndValidateSas9Fields(name, scope)
    targetJson = {
      ...targetJson,
      serverName,
      repositoryName
    }
    if (scope === TargetScope.Local) {
      createEnvFileForSas9(name, userName, password)
    } else {
      targetJson = {
        ...targetJson,
        authConfigSas9: { userName, password }
      }
    }
  } else {
    const { contextName } = await getAndValidateSasViyaFields(
      new Target(targetJson),
      scope,
      serverUrl,
      insecure,
      addCredential
    )

    targetJson = {
      contextName,
      deployConfig: {
        deployServicePack: true,
        deployScripts: []
      }
    }

    const { target: currentTarget } = await findTargetInConfiguration(
      name,
      scope
    )
    targetJson = { ...currentTarget.toJson(false), ...targetJson }
  }

  const isDefault = await getIsDefault()

  filePath = await saveConfig(
    scope,
    new Target(targetJson),
    isDefault,
    saveWithDefaultValues
  )

  process.logger?.info(`Target configuration has been saved to ${filePath}`)
  return true
}

async function saveConfig(
  scope: TargetScope,
  target: Target,
  isDefault: boolean,
  saveWithDefaultValues: boolean
) {
  let filePath = ''

  if (scope === TargetScope.Local) {
    filePath = await saveToLocalConfig(target, isDefault, saveWithDefaultValues)
  } else if (scope === TargetScope.Global) {
    filePath = await saveToGlobalConfig(
      target,
      isDefault,
      saveWithDefaultValues
    )
  }

  return filePath
}

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
import { addCredential } from './addCredential'

/**
 * Creates new target/ updates current target(if found) for either local config or global config file.
 * @param {boolean} insecure- boolean to use insecure connection, default is false. lf true the server will not reject any connection which is not authorized with the list of supplied CAs
 */
export async function addTarget(insecure: boolean = false): Promise<boolean> {
  if (insecure) process.logger?.warn('Executing with insecure connection.')

  const {
    scope,
    serverType,
    name,
    appLoc,
    serverUrl,
    existingTarget
  } = await getCommonFields()

  const saveWithoutDefaultValues = !!existingTarget

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
    saveWithoutDefaultValues
  )

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
      contextName,
      deployConfig: {
        deployServicePack: true,
        deployScripts: []
      }
    }

    const { target: currentTarget } = await findTargetInConfiguration(name)
    targetJson = { ...currentTarget.toJsonNoDefaults(), ...targetJson }
  }

  const isDefault = await getIsDefault()

  filePath = await saveConfig(
    scope,
    new Target(targetJson),
    isDefault,
    saveWithoutDefaultValues
  )

  process.logger?.info(`Target configuration has been saved to ${filePath}`)

  return true
}

async function saveConfig(
  scope: TargetScope,
  target: Target,
  isDefault: boolean,
  saveWithoutDefaultValues: boolean
) {
  let filePath = ''

  if (scope === TargetScope.Local) {
    filePath = await saveToLocalConfig(
      target,
      isDefault,
      saveWithoutDefaultValues
    )
  } else if (scope === TargetScope.Global) {
    filePath = await saveToGlobalConfig(
      target,
      isDefault,
      saveWithoutDefaultValues
    )
  }

  return filePath
}

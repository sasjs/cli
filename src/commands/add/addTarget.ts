import axios from 'axios'
import { Target, ServerType } from '@sasjs/utils/types'
import { TargetScope } from '../../types/targetScope'
import {
  getCommonFields,
  getAndValidateSasViyaFields,
  getAndValidateSas9Fields,
  getIsDefault,
  getAndValidateSasjsFields
} from './internal/input'
import { saveConfig } from './internal/saveConfig'
import { addCredential, createEnvFileForSas9 } from './addCredential'
import { isServerRunningInServerMode } from '../../utils'

/**
 * Creates new target/ updates current target(if found) for either local config or global config file.
 * @param {boolean} insecure- boolean to use insecure connection, default is false. lf true the server will not reject any connection which is not authorized with the list of supplied CAs
 */
export async function addTarget(insecure: boolean): Promise<boolean> {
  if (insecure) process.logger?.warn('Executing with insecure connection.')

  const { scope, serverType, name, appLoc, serverUrl, existingTarget } =
    await getCommonFields()

  let targetJson: any = {
    ...existingTarget,
    name,
    serverType,
    serverUrl,
    appLoc
  }

  const target = new Target(targetJson)
  let filePath = await saveConfig(scope, target, false, false)

  process.logger?.info(`Target configuration has been saved to ${filePath} .`)

  switch (serverType) {
    case ServerType.Sas9:
      const { serverName, repositoryName, userName, password } =
        await getAndValidateSas9Fields(target, scope)
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

      break
    case ServerType.SasViya:
      const { contextName, target: updatedViyaTarget } =
        await getAndValidateSasViyaFields(
          target,
          scope,
          serverUrl,
          insecure,
          addCredential
        )

      targetJson = {
        contextName
      }

      targetJson = { ...updatedViyaTarget.toJson(false), ...targetJson }

      break
    case ServerType.Sasjs:
      if (await isServerRunningInServerMode(target)) {
        const { target: updatedSasjsTarget } = await getAndValidateSasjsFields(
          target,
          scope,
          insecure,
          addCredential
        )
        targetJson = updatedSasjsTarget.toJson(false)
      }

      break
    default:
      throw new Error(
        'Target contains invalid serverType. Possible types could be SASVIYA, SAS9 and SASJS'
      )
  }

  const isDefault = await getIsDefault()

  filePath = await saveConfig(scope, new Target(targetJson), isDefault, false)

  process.logger?.info(`Target configuration has been saved to ${filePath}`)
  return true
}

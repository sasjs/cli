import { Logger, LogLevel } from '@sasjs/utils/logger'
import { Target, ServerType } from '@sasjs/utils/types'
import {
  findTargetInConfiguration,
  saveToGlobalConfig
} from '../../utils/config-utils'
import { TargetScope } from '../../types/TargetScope'
import {
  getCommonFields,
  getAndValidateSasViyaFields,
  getAndValidateSas9Fields
} from './input'
import { saveToLocalConfig } from './config'
import { addCredential } from './add-credential'

export async function addTarget(): Promise<boolean> {
  const logLevel = (process.env.LOG_LEVEL || LogLevel.Error) as LogLevel
  const logger = new Logger(logLevel)
  const { scope, serverType, name, appLoc, serverUrl } = await getCommonFields()

  let target: Partial<Target> | Target = {
    name,
    serverType: serverType,
    serverUrl,
    appLoc
  }

  let filePath = await saveConfig(scope, target as Target)
  logger.info(`Target configuration has been saved to ${filePath}.`)

  if (serverType === ServerType.Sas9) {
    const sas9FieldValues = await getAndValidateSas9Fields()
    target = {
      ...target,
      tgtBuildVars: sas9FieldValues,
      tgtDeployVars: sas9FieldValues
    }
  } else {
    const { contextName } = await getAndValidateSasViyaFields(
      name,
      scope,
      serverUrl,
      addCredential,
      logger
    )

    target = {
      ...target,
      tgtBuildVars: { contextName },
      tgtDeployVars: { contextName },
      deployServicePack: true,
      tgtDeployScripts: []
    }

    const { target: currentTarget } = await findTargetInConfiguration(name)
    target = { ...currentTarget, ...target }
  }

  filePath = await saveConfig(scope, target as Target)
  logger.info(`Target configuration has been saved to ${filePath}.`)
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

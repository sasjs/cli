import { Logger, LogLevel } from '@sasjs/utils/logger'
import { Target, ServerType } from '@sasjs/utils/types'

import path from 'path'

import {
  findTargetInConfiguration,
  saveToGlobalConfig
} from '../../utils/config-utils'
import { createFile } from '../../utils/file'
import { TargetScope } from '../../types/TargetScope'
import {
  getCommonFields,
  getAndValidateSasViyaFields,
  getAndValidateSas9Fields
} from './input'
import { getLocalConfig } from './config'
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

async function saveToLocalConfig(buildTarget: Target) {
  const buildSourceFolder = require('../../constants').get().buildSourceFolder
  let config = await getLocalConfig()
  if (config) {
    if (config.targets && config.targets.length) {
      const existingTargetIndex = config.targets.findIndex(
        (t: Target) => t.name === buildTarget.name
      )
      if (existingTargetIndex > -1) {
        config.targets[existingTargetIndex] = buildTarget
      } else {
        config.targets.push(buildTarget)
      }
    } else {
      config.targets = [buildTarget]
    }
  } else {
    config = { targets: [buildTarget] }
  }

  const configPath = path.join(buildSourceFolder, 'sasjsconfig.json')

  await createFile(configPath, JSON.stringify(config, null, 2))

  return configPath
}

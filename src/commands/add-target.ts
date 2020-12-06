import { create } from './create'
import { Logger, LogLevel } from '@sasjs/utils/logger'
import { Target, ServerType } from '@sasjs/utils/types'
import {
  getNumber,
  getString,
  getConfirmation,
  getChoice,
  getUrl
} from '@sasjs/utils/input'
import chalk from 'chalk'
import path from 'path'
import dotenv from 'dotenv'
import SASjs from '@sasjs/adapter/node'
import {
  getGlobalRcFile,
  getConfiguration,
  findTargetInConfiguration,
  saveToGlobalConfig
} from '../utils/config-utils'
import { createFile } from '../utils/file-utils'
import { addCredential } from './add-credential'

export enum TargetScope {
  Global = 'Global',
  Local = 'Local'
}

export async function addTarget() {
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

async function getLocalConfig() {
  const buildSourceFolder = require('../constants').get().buildSourceFolder
  const config = await getConfiguration(
    path.join(buildSourceFolder, 'sasjsconfig.json')
  )
  if (!config) await create('.', 'sasonly')
  return config
}

async function getCommonFields() {
  const scope = await getAndValidateScope()
  const serverType = await getAndValidateServerType()
  const name = await getAndValidateTargetName(scope, serverType)

  const appLoc = await getAndValidateAppLoc(name)

  const serverUrl = await getAndValidateServerUrl()

  return { scope, serverType, name, appLoc, serverUrl }
}

async function saveToLocalConfig(buildTarget: Target) {
  const buildSourceFolder = require('../constants').get().buildSourceFolder
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

async function getAndValidateScope(): Promise<TargetScope> {
  const { scope } = await getChoice(
    'scope',
    'Please pick a scope for the new target: ',
    (value: number) =>
      value === 0 || value === 1 || 'Please choose either option 1 or 2.',
    0,
    [
      { title: '1. Local project config file' },
      { title: '2. Global config file' }
    ]
  )

  return scope === 0 ? TargetScope.Local : TargetScope.Global
}

async function getAndValidateServerType(): Promise<ServerType> {
  const { serverType } = await getChoice(
    'serverType',
    'Please pick a server type: ',
    (value: any) =>
      value === 0 || value === 1 || 'Please choose either option 1 or 2.',
    0,
    [{ title: '1. SAS Viya' }, { title: '2. SAS 9' }]
  )

  return serverType === 0 ? ServerType.SasViya : ServerType.Sas9
}

async function getAndValidateServerUrl() {
  const { serverUrl } = await getUrl(
    'serverUrl',
    'Please enter a target server URL (including port, if relevant): ',
    'Server URL is required.'
  )

  return serverUrl
}

async function getAndValidateTargetName(
  targetScope: TargetScope,
  serverType: ServerType
): Promise<string> {
  const validator = async (value: string) => {
    let config
    if (targetScope === TargetScope.Local) {
      config = await getLocalConfig()
    } else {
      config = await getGlobalRcFile()
    }

    let existingTargetNames = []
    if (config && config.targets) {
      existingTargetNames = config.targets.map((t: Target) => t.name)
    }

    if (existingTargetNames.includes(value)) {
      return `A target with the name ${value} already exists. Please try again with a different target name.`
    }

    if (!value) {
      return 'Target name is required.'
    }

    if (value.trim().includes(' ')) {
      return 'Target names cannot include spaces. Please try again with a valid target name.'
    }

    if (!/^[a-z0-9]+$/i.test(value))
      return 'Target names can only contain alphanumeric characters. Please try again with a valid target name.'

    return true
  }

  const defaultName = serverType === ServerType.SasViya ? 'viya' : 'sas9'

  const { targetName } = await getString(
    'targetName',
    'Please enter a target name: ',
    validator,
    defaultName
  )

  return targetName
}

async function getAndValidateSas9Fields() {
  const { serverName } = await getString(
    'serverName',
    'Please enter a server name (default is SASApp): ',
    (v) => !!v || 'Server name is required.',
    'SASApp'
  )

  const { repositoryName } = await getString(
    'repositoryName',
    'Please enter a repository name (default is Foundation): ',
    (v) => !!v || 'Repository name is required.',
    'Foundation'
  )
  return { serverName, repositoryName }
}

async function getAndValidateSasViyaFields(
  targetName: string,
  scope: TargetScope,
  serverUrl: string,
  logger: Logger
): Promise<{
  contextName: string
}> {
  let contextName = 'SAS Job Execution compute context'
  const { shouldAuthenticate } = await getConfirmation(
    'shouldAuthenticate',
    'Would you like to authenticate against this target?',
    true
  )

  if (shouldAuthenticate) {
    await addCredential(targetName)

    const sasjs = new SASjs({
      serverUrl,
      serverType: ServerType.SasViya,
      debug: logger.logLevel === LogLevel.Debug
    })
    let contexts = []
    if (scope === TargetScope.Local) {
      dotenv.config({
        path: path.join(process.projectDir, `.env.${targetName}`)
      })
      contexts = await sasjs.getAllContexts(process.env.ACCESS_TOKEN as string)
    } else {
      const { target } = await findTargetInConfiguration(targetName)
      contexts = await sasjs.getAllContexts(target.authInfo.access_token)
    }

    logger.log(
      chalk.cyanBright(
        'Here are all the available execution contexts on this server:\n'
      )
    )
    logger.log(
      chalk.cyanBright(
        `${contexts
          .map((c, i) => chalk.yellowBright(`${i + 1}. `) + c.name)
          .join('\n')}`
      )
    )

    const { contextNumber } = await getNumber(
      'contextNumber',
      'Please enter your SAS Viya execution context number: ',
      (v: number) =>
        (v >= 1 && v <= contexts.length) || 'Context number is invalid.',
      1
    )
    contextName = contexts[contextNumber - 1].name

    return { contextName }
  }

  return {
    contextName
  }
}

async function getAndValidateAppLoc(targetName: string): Promise<string> {
  const { appLoc } = await getString(
    'appLoc',
    'Please provide an app location: ',
    (v: string) => !!v || 'App location is required.',
    `/Public/app/${targetName}`
  )

  return appLoc
}

import {
  getString,
  getConfirmation,
  getChoice,
  getUrl
} from '@sasjs/utils/input'
import { Target, TargetJson, ServerType } from '@sasjs/utils/types'
import { LogLevel } from '@sasjs/utils/logger'
import path from 'path'
import dotenv from 'dotenv'
import SASjs from '@sasjs/adapter/node'
import { TargetScope } from '../../../types/targetScope'
import { CommonFields } from '../../../types/commonFields'
import {
  findTargetInConfiguration,
  getGlobalRcFile,
  getLocalConfig
} from '../../../utils/config'

export async function getCommonFields(): Promise<CommonFields> {
  const scope = await getAndValidateScope()
  const serverType = await getAndValidateServerType()
  const name = await getAndValidateTargetName(serverType)
  const { targetJson, retry } = await getAndValidateUpdateExisting(scope, name)

  if (retry) return await getCommonFields()

  if (targetJson) {
    process.logger?.info(`Updating current target '${name}'`)
  }

  const appLoc = await getAndValidateAppLoc(name, targetJson)

  const serverUrl = await getAndValidateServerUrl(targetJson)

  return {
    scope,
    serverType,
    name,
    appLoc,
    serverUrl,
    existingTarget: targetJson
  }
}

async function getAndValidateScope(): Promise<TargetScope> {
  const errorMessage = 'Target scope must be either 1 or 2.'
  const scope = await getChoice(
    'Please pick a scope for the new target: ',
    'Please choose either option 1 or 2.',
    [
      { title: '1. Local project config file', value: 1 },
      { title: '2. Global config file', value: 2 }
    ]
  ).catch(() => {
    throw new Error(errorMessage)
  })

  if (!scope) {
    throw new Error(errorMessage)
  }

  return scope === 1 ? TargetScope.Local : TargetScope.Global
}

async function getAndValidateServerType(): Promise<ServerType> {
  const serverType = await getChoice(
    'Please pick a server type: ',
    'Please choose either option 1 or 2.',
    [
      { title: '1. SAS Viya', value: 1 },
      { title: '2. SAS 9', value: 2 }
    ]
  )

  return serverType === 1 ? ServerType.SasViya : ServerType.Sas9
}

export async function getAndValidateServerUrl(target: TargetJson) {
  const serverUrl = await getUrl(
    'Please enter a target server URL (including port, if relevant): ',
    'Server URL is required.',
    target?.serverUrl
  )

  return serverUrl
}

async function getAndValidateTargetName(
  serverType: ServerType
): Promise<string> {
  const validator = async (value: string) => {
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

  const targetName = await getString(
    'Please enter a target name: ',
    validator,
    defaultName
  )

  return targetName
}

async function getAndValidateUpdateExisting(
  targetScope: TargetScope,
  targetName: string
): Promise<{ targetJson: TargetJson; retry: boolean }> {
  let config, targetJson: TargetJson
  if (targetScope === TargetScope.Local) {
    config = await getLocalConfig()
  } else {
    config = await getGlobalRcFile()
  }

  targetJson = config?.targets?.find((t: Target) => t.name === targetName)

  if (targetJson) {
    process.logger?.info(`Found target with same name: '${targetName}'`)
    const errorMessage = 'Target update choice must be either 1 or 2.'
    const choice = await getChoice(
      'Please pick an option for the current target: ',
      'Please choose either option 1 or 2.',
      [
        { title: '1. Update this target', value: 1 },
        { title: '2. Go back and create a new target', value: 2 }
      ]
    ).catch(() => {
      throw new Error(errorMessage)
    })

    if (!choice) {
      throw new Error(errorMessage)
    }

    return { targetJson, retry: choice === 2 }
  }

  return { targetJson, retry: false }
}

export async function getAndValidateSas9Fields() {
  const serverName = await getString(
    'Please enter a server name (default is SASApp): ',
    (v) => !!v || 'Server name is required.',
    'SASApp'
  )

  const repositoryName = await getString(
    'Please enter a repository name (default is Foundation): ',
    (v) => !!v || 'Repository name is required.',
    'Foundation'
  )

  return { serverName, repositoryName }
}

export async function getAndValidateSasViyaFields(
  targetName: string,
  scope: TargetScope,
  serverUrl: string,
  insecure: boolean,
  authenticateCallback: (targetName: string, insecure: boolean) => Promise<void>
): Promise<{
  contextName: string
}> {
  let contextName = 'SAS Job Execution compute context'
  const shouldAuthenticate = await getConfirmation(
    'Would you like to authenticate against this target?',
    true
  )

  if (shouldAuthenticate) {
    await authenticateCallback(targetName, insecure)

    const sasjs = new SASjs({
      serverUrl,
      serverType: ServerType.SasViya,
      allowInsecureRequests: insecure,
      debug: process.logger?.logLevel === LogLevel.Debug
    })
    let contexts: any[] = []
    if (scope === TargetScope.Local) {
      dotenv.config({
        path: path.join(process.projectDir, `.env.${targetName}`)
      })
      contexts = await sasjs.getComputeContexts(
        process.env.ACCESS_TOKEN as string
      )
    } else {
      const { target } = await findTargetInConfiguration(targetName)
      if (!target.authConfig || !target.authConfig.access_token) {
        throw new Error(
          `No access token available for target ${target.name}. Please run \`sasjs add cred -t ${targetName}\` to authenticate.`
        )
      }

      contexts = await sasjs.getComputeContexts(target.authConfig.access_token)
    }

    const contextNumberErrorMessage = `Context number must be between 1 and ${contexts.length}`
    const contextNumber = await getChoice(
      'Please pick your SAS Viya execution context: ',
      contextNumberErrorMessage,
      contexts.map((c: any, i) => ({ title: c.name, value: i }))
    )

    contextName = contexts[contextNumber].name

    return { contextName }
  }

  return {
    contextName
  }
}

async function getAndValidateAppLoc(
  targetName: string,
  target: TargetJson
): Promise<string> {
  const errorMessage = 'App location is required.'

  const appLoc = await getString(
    'Please provide an app location: ',
    (v: string) => !!v || errorMessage,
    target?.appLoc ?? `/Public/app/${targetName}`
  )

  return appLoc
}

export const getCredentialsInput = async (targetName: string) => {
  const defaultValues = getDefaultValues(targetName)

  const client = await getString(
    'Please enter your Client ID: ',
    (v) => !!v || 'Client ID is required.',
    defaultValues.client
  )
  const secret = await getString(
    'Please enter your Client Secret: ',
    (v) => !!v || 'Client Secret is required.',
    defaultValues.secret
  )

  return { client, secret }
}

export const getDefaultValues = (targetName: string) => {
  dotenv.config({ path: path.join(process.projectDir, `.env.${targetName}`) })

  const defaultClient =
    process.env.CLIENT === 'undefined' ||
    process.env.CLIENT === 'null' ||
    !process.env.CLIENT
      ? ''
      : process.env.CLIENT
  const defaultSecret =
    process.env.SECRET === 'undefined' ||
    process.env.SECRET === 'null' ||
    !process.env.SECRET
      ? ''
      : process.env.SECRET

  return { client: defaultClient, secret: defaultSecret }
}

export const getIsDefault = async () => {
  return await getConfirmation('Would you like to set this as your default target?', false)
}

import path from 'path'
import { LogLevel } from '@sasjs/utils/logger'
import { SasAuthResponse, Target } from '@sasjs/utils/types'

import SASjs from '@sasjs/adapter/node'
import { getNewAccessToken } from '../../utils/auth'
import {
  findTargetInConfiguration,
  saveToGlobalConfig,
  saveToLocalConfig
} from '../../utils/config'
import { createFile } from '../../utils/file'
import { getAndValidateServerUrl, getCredentialsInput } from './internal/input'
import { TargetScope } from '../../types/targetScope'

/**
 * Creates a .env file for the specified target.
 * The file will contain the client ID, secret, access token and refresh token.
 * Its name will be of the form `.env.{targetName}`
 * @param {string} targetName- the name of the target to create the env file for.
 * @param {boolean} insecure- boolean to use insecure connection, default is false. lf true the server will not reject any connection which is not authorized with the list of supplied CAs
 */
export const addCredential = async (
  targetName: string,
  insecure: boolean = false,
  targetScope: TargetScope | undefined = undefined
): Promise<void> => {
  targetName = validateTargetName(targetName)

  let { target, isLocal } = await findTargetInConfiguration(
    targetName,
    targetScope
  )

  insecure = insecure || target.allowInsecureRequests

  if (insecure) process.logger?.warn('Executing with insecure connection.')

  if (!target.serverUrl) {
    const serverUrl = await getAndValidateServerUrl(target)
    target = new Target({ ...target.toJson(), serverUrl })
  }

  const { client, secret } = await getCredentialsInput(target.name)

  const { access_token, refresh_token } = await getTokens(
    target,
    client,
    secret,
    insecure
  )

  if (isLocal) {
    await createEnvFile(
      target.name,
      client,
      secret,
      access_token,
      refresh_token
    )
    await saveToLocalConfig(target, false)
  } else {
    target = new Target({
      ...target.toJson(),
      authConfig: { client, secret, access_token, refresh_token }
    })
    await saveToGlobalConfig(target, false)
  }
}

export const validateTargetName = (targetName: string): string => {
  if (!targetName)
    throw new Error(
      'Target name is required.\nPlease specify a valid target name using the `-t` or `--target` argument.'
    )

  targetName = targetName.trim()
  if (targetName.includes(' '))
    throw new Error(
      'Target names cannot include spaces. Please try again with a valid target name.'
    )

  if (!/^[a-zA-Z0-9][a-zA-Z0-9\-]+$/i.test(targetName))
    throw Error(
      'Target names can only contain alphanumeric characters. Please try again with a valid target name.'
    )

  return targetName
}

export const getTokens = async (
  target: Target,
  client: string,
  secret: string,
  insecure: boolean = false
): Promise<SasAuthResponse> => {
  const adapter = new SASjs({
    serverUrl: target.serverUrl,
    serverType: target.serverType,
    allowInsecureRequests: insecure,
    debug: process.logger?.logLevel === LogLevel.Debug
  })
  const authResponse: SasAuthResponse = await getNewAccessToken(
    adapter,
    client,
    secret,
    target
  ).catch((e) => {
    process.logger?.error(
      `An error has occurred while validating your credentials: ${e}\nPlease check your Client ID and Client Secret and try again.\n`
    )
    throw e
  })

  return authResponse
}

export const createEnvFile = async (
  targetName: string,
  client: string,
  secret: string,
  accessToken: string,
  refreshToken: string
): Promise<void> => {
  const envFileContent = `CLIENT=${client}\nSECRET=${secret}\nACCESS_TOKEN=${accessToken}\nREFRESH_TOKEN=${refreshToken}\n`
  const envFilePath = path.join(process.projectDir, `.env.${targetName}`)
  await createFile(envFilePath, envFileContent)
  process.logger?.success(`Environment file saved at ${envFilePath}`)
}

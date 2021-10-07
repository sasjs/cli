import path from 'path'
import { LogLevel } from '@sasjs/utils/logger'
import { SasAuthResponse, ServerType, Target } from '@sasjs/utils/types'

import SASjs from '@sasjs/adapter/node'
import { getNewAccessToken } from '../../utils/auth'
import { createFile } from '@sasjs/utils'
import {
  getAndValidateServerUrl,
  getCredentialsInputForViya,
  getCredentialsInputSas9
} from './internal/input'
import { TargetScope } from '../../types/targetScope'
import { saveConfig } from './internal/saveConfig'
import { HttpsAgentOptions } from '@sasjs/utils/types/httpsAgentOptions'

/**
 * Creates a .env file for the specified target.
 * The file will contain the client ID, secret, access token and refresh token if the server type of target is viya.
 * The file will contain the username and password if the server type of target is sas9
 * Its name will be of the form `.env.{targetName}`
 * @param {string} target- the target to create the env file for.
 * @param {boolean} insecure- boolean to use insecure connection, default is false. lf true the server will not reject any connection which is not authorized with the list of supplied CAs
 */
export const addCredential = async (
  target: Target,
  insecure: boolean,
  targetScope: TargetScope
): Promise<Target> => {
  const { httpsAgentOptions } = target
  if (insecure) httpsAgentOptions.rejectUnauthorized = true

  if (insecure) process.logger?.warn('Executing with insecure connection.')

  if (!target.serverUrl) {
    const serverUrl = await getAndValidateServerUrl(target)
    target = new Target({ ...target.toJson(false), serverUrl })

    const filePath = await saveConfig(targetScope, target, false, false)
    process.logger?.info(`Target configuration has been saved to ${filePath} .`)
  }

  if (target.serverType === ServerType.SasViya) {
    const { client, secret } = await getCredentialsInputForViya(target.name)

    const { access_token, refresh_token } = await getTokens(
      target,
      client,
      secret,
      httpsAgentOptions
    )

    if (targetScope === TargetScope.Local) {
      await createEnvFileForViya(
        target.name,
        client,
        secret,
        access_token,
        refresh_token
      )
    } else {
      target = new Target({
        ...target.toJson(false),
        authConfig: { client, secret, access_token, refresh_token }
      })
    }

    const filePath = await saveConfig(targetScope, target, false, false)
    process.logger?.info(`Target configuration has been saved to ${filePath} .`)
  } else if (target.serverType === ServerType.Sas9) {
    const { userName, password } = await getCredentialsInputSas9(
      target,
      targetScope
    )

    if (targetScope === TargetScope.Local) {
      await createEnvFileForSas9(target.name, userName, password)
    } else {
      target = new Target({
        ...target.toJson(false),
        authConfigSas9: { userName, password }
      })
    }

    const filePath = await saveConfig(targetScope, target, false, false)
    process.logger?.info(`Target configuration has been saved to ${filePath} .`)
  } else {
    throw new Error(
      'Target contains invalid serverType. Possible types could be SASVIYA and SAS9.'
    )
  }
  return target
}

export const validateTargetName = (targetName: string): string => {
  // if targetName contain falsy Value just return that value
  if (!targetName) return targetName

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
  httpsAgentOptions?: HttpsAgentOptions
): Promise<SasAuthResponse> => {
  const adapter = new SASjs({
    serverUrl: target.serverUrl,
    serverType: target.serverType,
    httpsAgentOptions,
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

export const createEnvFileForViya = async (
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

export const createEnvFileForSas9 = async (
  targetName: string,
  userName: string,
  password: string
): Promise<void> => {
  const envFileContent = `SAS_USERNAME=${userName}\nSAS_PASSWORD=${password}\n`
  const envFilePath = path.join(process.projectDir, `.env.${targetName}`)
  await createFile(envFilePath, envFileContent)
  process.logger?.success(`Environment file saved at ${envFilePath}`)
}

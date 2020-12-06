import path from 'path'
import { Logger, LogLevel } from '@sasjs/utils/logger'
import { readAndValidateInput } from '@sasjs/utils/input'
import { SasAuthResponse, Target } from '@sasjs/utils/types'
import { findTargetInConfiguration } from '../utils/config-utils'
import { getNewAccessToken } from '../utils/auth-utils'
import SASjs from '@sasjs/adapter/node'
import { createFile } from '../utils/file-utils'

export const addCredential = async (targetName: string): Promise<void> => {
  targetName = validateTargetName(targetName)

  const logLevel = (process.env.LOG_LEVEL || LogLevel.Error) as LogLevel
  const logger = new Logger(logLevel)

  const { target } = await findTargetInConfiguration(targetName)

  const { client, secret } = await getCredentialsInput()

  const { access_token, refresh_token } = await getTokens(
    target,
    logger,
    client,
    secret
  )

  await createEnvFile(targetName, client, secret, access_token, refresh_token)
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

  if (!/^[a-z0-9]+$/i.test(targetName))
    throw Error(
      'Target names can only contain alphanumeric characters. Please try again with a valid target name.'
    )

  return targetName
}

const getCredentialsInput = async () => {
  const { client } = await readAndValidateInput(
    'text',
    'client',
    'Please enter your Client ID: ',
    (v) => !!v || 'Client ID is required.'
  )
  const { secret } = await readAndValidateInput(
    'text',
    'secret',
    'Please enter your Client Secret: ',
    (v) => !!v || 'Client Secret is required.'
  )

  return { client, secret }
}

export const getTokens = async (
  target: Target,
  logger: Logger,
  client: string,
  secret: string
): Promise<SasAuthResponse> => {
  const adapter = new SASjs({
    serverUrl: target.serverUrl,
    serverType: target.serverType,
    debug: logger.logLevel === LogLevel.Debug
  })
  const authResponse: SasAuthResponse = await getNewAccessToken(
    adapter,
    client,
    secret,
    target
  ).catch((e) => {
    logger.error(
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
}

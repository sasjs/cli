import SASjs, { VerboseMode } from '@sasjs/adapter/node'
import {
  Configuration,
  Target,
  TargetJson,
  urlOrigin,
  readFile,
  folderExists,
  createFile,
  fileExists,
  AuthConfig,
  getAbsolutePath,
  StreamConfig,
  HttpsAgentOptions,
  ServerType,
  AuthConfigSas9,
  SyncDirectoryMap
} from '@sasjs/utils'
import {
  isAccessTokenExpiring,
  isRefreshTokenExpiring,
  getNewAccessToken,
  refreshTokens
} from './auth'
import path from 'path'
import dotenv from 'dotenv'
import { TargetScope } from '../types/targetScope'
import { loadEnvVariables, isSasJsServerInServerMode } from './utils'

const ERROR_MESSAGE = (targetName: string = '') => {
  return {
    NOT_FOUND_TARGET_NAME: `Target \`${targetName}\` was not found.
Please check the target name and try again, or use \`sasjs add\` to add a new target.
More info: https://cli.sasjs.io/faq/#what-is-the-difference-between-local-and-global-targets
`,
    NOT_FOUND_FALLBACK: `No target was found.
Please check the target name and try again, or use \`sasjs add\` to add a new target.
More info: https://cli.sasjs.io/faq/#what-is-the-difference-between-local-and-global-targets
`
  }
}

/**
 * Returns an object that represents the SASjs CLI configuration in a given file.
 * @param {string} pathToFile - the path to the file in question.
 * @returns {Configuration} configuration object if available.
 */
export async function getConfiguration(
  pathToFile: string
): Promise<Configuration> {
  const config = await readFile(pathToFile).catch(() => null)

  if (config) {
    const configJson = JSON.parse(config)
    return (configJson.config ? configJson.config : configJson) as Configuration
  }

  throw new Error(`No configuration was found at path ${pathToFile} .`)
}

/**
 * Returns the target with the given name.
 * If the target is not found in the local configuration,
 * this function then looks in the global configuration.
 * If it is still unable to find it, it throws an error.
 * @param {string} targetName - the name of the target in question.
 * @param {TargetScope} targetScope - if specified will either consider only Local OR only Global targets.
 * @returns {Target} target or fallback when one is found.
 */
export async function findTargetInConfiguration(
  targetName: string,
  targetScope?: TargetScope
): Promise<{ target: Target; isLocal: boolean }> {
  const rootDir = await getProjectRoot()

  if (rootDir !== process.projectDir) process.projectDir = rootDir

  if (targetScope === TargetScope.Local) {
    return targetName
      ? { target: await getLocalTarget(targetName), isLocal: true }
      : {
          target: await getLocalFallbackTarget(),
          isLocal: true
        }
  }

  if (targetScope === TargetScope.Global) {
    return targetName
      ? { target: await getGlobalTarget(targetName), isLocal: false }
      : {
          target: await getGlobalFallbackTarget(),
          isLocal: false
        }
  }

  let target

  if (targetName) {
    try {
      target = await getLocalTarget(targetName)
    } catch (e: any) {
      if (e.message !== ERROR_MESSAGE(targetName).NOT_FOUND_TARGET_NAME) throw e
    }

    if (target) return { target, isLocal: true }

    try {
      target = await getGlobalTarget(targetName)
    } catch (e: any) {
      if (e.message !== ERROR_MESSAGE(targetName).NOT_FOUND_TARGET_NAME) throw e
    }

    if (target) return { target, isLocal: false }

    throw new Error(ERROR_MESSAGE(targetName).NOT_FOUND_TARGET_NAME)
  } else {
    try {
      target = await getLocalFallbackTarget()
    } catch (e: any) {
      if (e.message !== ERROR_MESSAGE().NOT_FOUND_FALLBACK) throw e
    }

    if (target) return { target, isLocal: true }

    try {
      target = await getGlobalFallbackTarget()
    } catch (e: any) {
      if (e.message !== ERROR_MESSAGE().NOT_FOUND_FALLBACK) throw e
    }

    if (target) return { target, isLocal: false }

    throw new Error(
      `Unable to find any default target.
Please check the target name and try again, or use \`sasjs add\` to add a new target.
More info: https://cli.sasjs.io/sasjsconfig.html#defaultTarget
`
    )
  }
}

async function getLocalTarget(targetName: string): Promise<Target> {
  const localConfig = await getConfiguration(
    path.join(process.projectDir, 'sasjs', 'sasjsconfig.json')
  ).catch(() => null)

  if (localConfig?.targets) {
    const targetJson = localConfig.targets.find((t) => t.name === targetName)
    if (targetJson) {
      process.logger?.info(
        `Target ${targetName} was found in your local sasjsconfig.json file.`
      )
      targetJson.appLoc = sanitizeAppLoc(targetJson.appLoc)
      if (!targetJson.hasOwnProperty('serverUrl')) {
        targetJson.serverUrl = ''
      }
      targetJson.serverUrl = urlOrigin(targetJson.serverUrl)
      targetJson.httpsAgentOptions =
        await getPrecedenceOfHttpsAgentOptionsAndContent(
          localConfig,
          targetJson
        )

      return new Target(targetJson, localConfig)
    }
  }

  throw new Error(ERROR_MESSAGE(targetName).NOT_FOUND_TARGET_NAME)
}
async function getLocalFallbackTarget(): Promise<Target> {
  const localConfig = await getConfiguration(
    path.join(process.projectDir, 'sasjs', 'sasjsconfig.json')
  ).catch(() => null)

  let fallBackTargetJson
  if (localConfig?.targets) {
    const defaultTargetName = localConfig?.defaultTarget
    if (defaultTargetName) {
      fallBackTargetJson = localConfig?.targets?.find(
        (t) => t.name === defaultTargetName
      )
    }

    if (fallBackTargetJson) {
      process.logger?.info(
        `No target was specified. Falling back to default target '${fallBackTargetJson.name}' from your local sasjsconfig.json file.`
      )
      fallBackTargetJson.appLoc = sanitizeAppLoc(fallBackTargetJson.appLoc)

      if (!fallBackTargetJson.hasOwnProperty('serverUrl')) {
        fallBackTargetJson.serverUrl = ''
      }

      fallBackTargetJson.serverUrl = urlOrigin(fallBackTargetJson.serverUrl)
      fallBackTargetJson.httpsAgentOptions =
        await getPrecedenceOfHttpsAgentOptionsAndContent(
          localConfig,
          fallBackTargetJson
        )

      await loadEnvVariables(`.env.${fallBackTargetJson.name}`)

      return new Target(fallBackTargetJson, localConfig)
    }
  }

  throw new Error(ERROR_MESSAGE().NOT_FOUND_FALLBACK)
}
async function getGlobalTarget(targetName: string): Promise<Target> {
  const globalConfig = await getGlobalRcFile()

  if (globalConfig?.targets) {
    const targetJson = globalConfig.targets.find(
      (t: Target) => t.name === targetName
    )
    if (targetJson) {
      process.logger?.info(
        `Target ${targetName} was found in your global .sasjsrc file.`
      )
      targetJson.appLoc = sanitizeAppLoc(targetJson.appLoc)
      if (!targetJson.hasOwnProperty('serverUrl')) {
        targetJson.serverUrl = ''
      }
      targetJson.serverUrl = urlOrigin(targetJson.serverUrl)
      targetJson.httpsAgentOptions =
        await getPrecedenceOfHttpsAgentOptionsAndContent(
          globalConfig,
          targetJson
        )

      return new Target(targetJson, globalConfig)
    }
  }

  throw new Error(ERROR_MESSAGE(targetName).NOT_FOUND_TARGET_NAME)
}
async function getGlobalFallbackTarget(): Promise<Target> {
  const globalConfig = (await getGlobalRcFile()) as Configuration
  let fallBackTargetJson

  const defaultTargetName = globalConfig?.defaultTarget
  if (defaultTargetName) {
    fallBackTargetJson = globalConfig?.targets?.find(
      (t) => t.name === defaultTargetName
    )
  }

  if (fallBackTargetJson) {
    process.logger?.info(
      `No target was specified. Falling back to default target '${fallBackTargetJson.name}' from your global .sasjsrc file.`
    )
    fallBackTargetJson.appLoc = sanitizeAppLoc(fallBackTargetJson.appLoc)
    if (!fallBackTargetJson.hasOwnProperty('serverUrl')) {
      fallBackTargetJson.serverUrl = ''
    }
    fallBackTargetJson.serverUrl = urlOrigin(fallBackTargetJson.serverUrl)
    fallBackTargetJson.httpsAgentOptions =
      await getPrecedenceOfHttpsAgentOptionsAndContent(
        globalConfig,
        fallBackTargetJson
      )

    return new Target(fallBackTargetJson, globalConfig)
  }

  throw new Error(ERROR_MESSAGE().NOT_FOUND_FALLBACK)
}

export async function getGlobalRcFile() {
  const homeDir = require('os').homedir()
  const sasjsRcFileContent = await readFile(
    path.join(homeDir, '.sasjsrc')
  ).catch(() => null)
  return sasjsRcFileContent
    ? JSON.parse(sasjsRcFileContent)
    : sasjsRcFileContent
}

export async function getLocalRcFile() {
  const projectRoot = await getProjectRoot()
  if (!projectRoot) {
    return null
  }
  const config = await getConfiguration(path.join(projectRoot, '.sasjsrc'))
  return config
}

export async function saveGlobalRcFile(content: string) {
  const homeDir = require('os').homedir()
  const rcFilePath = path.join(homeDir, '.sasjsrc')

  await createFile(rcFilePath, content)

  return rcFilePath
}

export async function saveToGlobalConfig(
  target: Target,
  isDefault: boolean = false,
  saveWithDefaultValues: boolean = true
) {
  let globalConfig = await getGlobalRcFile()
  const targetJson = target.toJson(saveWithDefaultValues)

  if (targetJson.httpsAgentOptions?.ca) {
    targetJson.httpsAgentOptions.ca = undefined
  }

  if (globalConfig) {
    if (globalConfig.targets && globalConfig.targets.length) {
      const existingTargetIndex = globalConfig.targets.findIndex(
        (t: Target) => t.name === target.name
      )
      if (existingTargetIndex > -1) {
        globalConfig.targets[existingTargetIndex] = targetJson
      } else {
        globalConfig.targets.push(targetJson)
      }
    } else {
      globalConfig.targets = [targetJson]
    }
  } else {
    globalConfig = { targets: [targetJson] }
  }

  if (isDefault) {
    globalConfig.defaultTarget = target.name
  }

  return await saveGlobalRcFile(JSON.stringify(globalConfig, null, 2))
}

export async function removeFromGlobalConfig(targetName: string) {
  let globalConfig = (await getGlobalRcFile()) as Configuration
  if (globalConfig && globalConfig.targets && globalConfig.targets.length) {
    const targets = globalConfig.targets.filter((t) => t.name !== targetName)

    if (globalConfig.defaultTarget === targetName) {
      globalConfig.defaultTarget = ''
    }

    await saveGlobalRcFile(
      JSON.stringify({ ...globalConfig, targets }, null, 2)
    )
  }
}

export async function removeFromLocalConfig(targetName: string) {
  let config = (await getLocalConfig()) as Configuration
  if (config && config.targets && config.targets.length) {
    const targets = config.targets.filter((t) => t.name !== targetName)

    if (config.defaultTarget === targetName) {
      config.defaultTarget = ''
    }

    const configPath = path.join(
      process.projectDir,
      'sasjs',
      'sasjsconfig.json'
    )

    await createFile(
      configPath,
      JSON.stringify({ ...config, targets }, null, 2)
    )
  }
}

export async function getLocalConfig() {
  let config = await getConfiguration(
    path.join(process.projectDir, 'sasjs', 'sasjsconfig.json')
  )

  return config
}

export async function getLocalOrGlobalConfig(): Promise<{
  configuration: Configuration
  isLocal: boolean
}> {
  try {
    return { configuration: await getLocalConfig(), isLocal: true }
  } catch (e) {
    return { configuration: await getGlobalRcFile(), isLocal: false }
  }
}

export async function getSyncDirectories(
  target: Target,
  isLocal: boolean
): Promise<SyncDirectoryMap[]> {
  const config = isLocal ? await getLocalConfig() : await getGlobalRcFile()

  const rootLevelSyncDirectories: SyncDirectoryMap[] =
    config.syncDirectories || []
  const targetLevelSyncDirectories = target.syncDirectories || []

  return [...rootLevelSyncDirectories, ...targetLevelSyncDirectories]
}

export async function saveLocalConfigFile(content: string) {
  const configPath = path.join(process.projectDir, 'sasjs', 'sasjsconfig.json')

  await createFile(configPath, content)

  return configPath
}

export async function saveToLocalConfig(
  target: Target,
  isDefault: boolean = false,
  saveWithDefaultValues: boolean = true
) {
  const targetJson = target.toJson(saveWithDefaultValues)

  if (targetJson.httpsAgentOptions?.ca) {
    targetJson.httpsAgentOptions.ca = undefined
  }

  let config = await getLocalConfig()
  if (config) {
    if (config?.targets?.length) {
      const existingTargetIndex = config.targets.findIndex(
        (t) => t.name === target.name
      )
      if (existingTargetIndex > -1) {
        config.targets[existingTargetIndex] = targetJson
      } else {
        config.targets.push(targetJson)
      }
    } else {
      config.targets = [targetJson]
    }
  } else {
    config = { targets: [targetJson] }
  }

  if (isDefault) {
    config.defaultTarget = target.name
  }

  const configPath = path.join(process.projectDir, 'sasjs', 'sasjsconfig.json')

  await createFile(configPath, JSON.stringify(config, null, 2))

  return configPath
}

export async function getFolders() {
  const configPath = '../config.json'
  const config = await readFile(path.join(__dirname, configPath))
  if (config) {
    const configJson = JSON.parse(config)
    return Promise.resolve(configJson.folders)
  }
  return Promise.reject()
}

/**
 * Returns SAS program folders from configuration.
 * This list includes both common and target-specific folders.
 * @param {Target} target- the target to check program folders for.
 */
export async function getProgramFolders(target: Target) {
  const programFolders: string[] = []

  const configuration = process.sasjsConfig

  if (configuration?.programFolders) {
    programFolders.push(...configuration.programFolders)
  }

  if (target?.programFolders) {
    programFolders.push(...target.programFolders)
  }

  const { buildSourceFolder } = process.sasjsConstants
  const programFoldersWithAbsolutePath = programFolders.map((programFolder) =>
    getAbsolutePath(programFolder, buildSourceFolder)
  )

  return [...new Set(programFoldersWithAbsolutePath)]
}

export async function getBinaryFolders(target: Target) {
  const binaryFolders: string[] = []

  const configuration = process.sasjsConfig

  if (configuration?.binaryFolders) {
    binaryFolders.push(...configuration.binaryFolders)
  }

  if (target?.binaryFolders) {
    binaryFolders.push(...target.binaryFolders)
  }

  const { buildSourceFolder } = process.sasjsConstants
  const binaryFoldersWithAbsolutePath = binaryFolders.map((binaryFolder) =>
    getAbsolutePath(binaryFolder, buildSourceFolder)
  )

  return [...new Set(binaryFoldersWithAbsolutePath)]
}

/**
 * Returns SAS macro folders from configuration.
 * This list includes both common and target-specific folders.
 * @param {Target} target- the target to check macro folders for.
 */
export async function getMacroFolders(target?: Target) {
  const configuration = process.sasjsConfig

  const macroFolders: string[] = []

  if (configuration?.macroFolders) {
    macroFolders.push(...configuration.macroFolders)
  }

  if (target?.macroFolders) macroFolders.push(...target.macroFolders)

  const { buildSourceFolder } = process.sasjsConstants

  const macroFoldersWithAbsolutePath = macroFolders.map((macroFolder) =>
    getAbsolutePath(macroFolder, buildSourceFolder)
  )

  return [...new Set(macroFoldersWithAbsolutePath)]
}

/**
 * Returns StreamConfig from configuration.
 * This configuration includes both common and target-specific configuration.
 * @param {Target} target- the target to check stream configuration for.
 */
export async function getStreamConfig(target?: Target): Promise<StreamConfig> {
  const configuration = process.sasjsConfig

  return {
    streamServiceName: 'clickme',
    ...configuration?.streamConfig,
    ...target?.streamConfig
  } as StreamConfig
}

/**
 * Sanitizes app location string.
 * @param {string} appLoc - app location
 */
export function sanitizeAppLoc(appLoc: string) {
  if (!appLoc || typeof appLoc !== 'string') return '/'

  // Removes trailing '/'
  appLoc = appLoc.replace(/\/{1,}$/, '')

  // Adds leading '/'
  if (!/^\//.test(appLoc)) appLoc = '/' + appLoc

  // Replaces multiple leading '/' with a single '/'
  appLoc = appLoc.replace(/^\/{2,}/, '/')

  return appLoc
}

export async function getProjectRoot() {
  let root = ''
  let rootFound = false
  let i = 1
  let currentLocation = process.projectDir

  const maxLevels = currentLocation.split(path.sep).length

  while (!rootFound && i <= maxLevels) {
    const isRoot =
      (await folderExists(path.join(currentLocation, 'sasjs'))) &&
      (await fileExists(
        path.join(currentLocation, 'sasjs', 'sasjsconfig.json')
      ))

    if (isRoot) {
      rootFound = true
      root = currentLocation

      break
    } else {
      currentLocation = path.join(currentLocation, '..')
      i++
    }
  }

  return root
}

/**
 * Gets the auth config for the specified target.
 * @param {Target} target - the target to get an access token for.
 * @returns {AuthConfig} - an object containing an access token, refresh token, client ID and secret.
 */
export async function getAuthConfig(target: Target): Promise<AuthConfig> {
  let access_token = target?.authConfig?.access_token
    ? target.authConfig.access_token
    : ''

  if (
    !access_token ||
    access_token.trim() === 'null' ||
    access_token.trim() === 'undefined'
  ) {
    await overrideEnvVariables(target?.name)
    access_token = process.env.ACCESS_TOKEN as string
  }

  let refresh_token = target?.authConfig?.refresh_token
    ? target.authConfig.refresh_token
    : process.env.REFRESH_TOKEN
  refresh_token =
    refresh_token &&
    (refresh_token.trim() === 'null' || refresh_token.trim() === 'undefined')
      ? undefined
      : refresh_token

  let client = target?.authConfig?.client
    ? target.authConfig.client
    : process.env.CLIENT
  client =
    client && (client.trim() === 'null' || client.trim() === 'undefined')
      ? undefined
      : client

  if (!client) {
    throw new Error(
      `Client ID was not found.
        Please make sure that the 'client' property is set in your local .env file or in the correct target authConfig in your global ~${path.sep}.sasjsrc file.`
    )
  }

  let secret = target?.authConfig?.secret
    ? target.authConfig.secret
    : process.env.SECRET
  secret =
    secret && (secret.trim() === 'null' || secret.trim() === 'undefined')
      ? undefined
      : secret

  if (!secret) {
    if (target.serverType === ServerType.Sasjs) secret = ''
    else
      throw new Error(
        `Client secret was not found.
        Please make sure that the 'secret' property is set in your local .env file or in the correct target authConfig in your global ~${path.sep}.sasjsrc file.`
      )
  }

  if (isAccessTokenExpiring(access_token)) {
    const sasjs = getSASjs(target)

    let tokens
    if (isRefreshTokenExpiring(refresh_token)) {
      tokens = await getNewAccessToken(sasjs, client, secret, target)
    } else {
      tokens = await refreshTokens(sasjs, client, secret, refresh_token!)
    }

    access_token = tokens?.access_token || access_token
    refresh_token = tokens?.refresh_token || refresh_token
    await saveTokens(
      target.name,
      client,
      secret,
      access_token,
      refresh_token || ''
    )
  }

  return {
    access_token,
    refresh_token: refresh_token!,
    client,
    secret
  }
}

export const saveTokens = async (
  targetName: string,
  client: string,
  secret: string,
  access_token: string,
  refresh_token: string
): Promise<void> => {
  const isLocalTarget = await getLocalConfig()
    .then((localConfig) =>
      localConfig.targets?.some((t) => t.name === targetName)
    )
    .catch(() => {
      process.logger?.info(
        'Local sasjsconfig.json file could not be found! Now finding target in global .sasjsrc file'
      )
      return false
    })

  if (isLocalTarget) {
    const { VERBOSE } = process.env
    const envFileContent = `CLIENT=${client}\nSECRET=${secret}\nACCESS_TOKEN=${access_token}\nREFRESH_TOKEN=${refresh_token}\n${
      VERBOSE ? 'VERBOSE=' + VERBOSE + '\n' : ''
    }`
    const envFilePath = path.join(process.projectDir, `.env.${targetName}`)
    await createFile(envFilePath, envFileContent)

    process.logger?.success(`Environment file saved at ${envFilePath}`)
  } else {
    const globalConfig = await getGlobalRcFile()
    const target = globalConfig.targets?.find(
      (t: Target) => t.name === targetName
    )
    if (!target) {
      throw new Error(ERROR_MESSAGE(targetName).NOT_FOUND_TARGET_NAME)
    }
    const targetJson = target.toJson()
    targetJson.authConfig = { client, secret, access_token, refresh_token }
    await saveToGlobalConfig(
      new Target(targetJson),
      globalConfig.defaultTarget === targetName
    )
    process.logger?.success(
      `Target saved to global .sasjsrc file at ~/.sasjsrc.`
    )
  }
}

/**
 * Gets the auth config for the specified SAS9 target.
 * @param {Target} target - the target to get an access token for.
 * @returns {AuthConfigSas9} - an object containing an userName and password.
 */
export function getAuthConfigSAS9(target: Target): AuthConfigSas9 {
  const { userName, password } = target.authConfigSas9
    ? {
        userName: target.authConfigSas9.userName,
        password: target.authConfigSas9.password
      }
    : {
        userName: process.env.SAS_USERNAME,
        password: process.env.SAS_PASSWORD
      }

  if (!userName || !password) {
    const { sas9CredentialsError } = process.sasjsConstants
    throw new Error(sas9CredentialsError)
  }

  return {
    userName,
    password
  }
}

/**
 * Gets an access token for the specified target.
 * If the target is from the global `.sasjsrc` file,
 * the auth info should be contained in it.
 * It should be in the form:
 * @example: { targets: [{ "name": "targetName", "authConfig": { "client": "client ID", "secret": "Client Secret", "access_token": "Token", "refresh_token": "Token" }}]}
 * If the access token is going to expire in the next hour,
 * it is refreshed using a refresh token if available.
 * If a refresh token is unavailable, we will use the client ID and secret
 * to obtain a new access token. Manual intervention is required in this case
 * to navigate to the URL shown and type in an authorization code.
 * @param {object} target - the target to get an access token for.
 * @param {string} checkIfExpiring - flag that indicates whether to do an expiry check.
 */
export async function getAccessToken(target: Target, checkIfExpiring = true) {
  let accessToken =
    target && target.authConfig && target.authConfig.access_token
      ? target.authConfig.access_token
      : ''

  if (
    !accessToken ||
    accessToken.trim() === 'null' ||
    accessToken.trim() === 'undefined'
  ) {
    await overrideEnvVariables(target?.name)
    accessToken = process.env.ACCESS_TOKEN as string
  }

  if (
    !accessToken ||
    accessToken.trim() === 'null' ||
    accessToken.trim() === 'undefined'
  ) {
    throw new Error(
      `A valid access token was not found.\nPlease provide an access token in the access_token property in your .env file or as part of the authInfo in your target configuration (sasjsconfig.json).`
    )
  }

  if (checkIfExpiring && isAccessTokenExpiring(accessToken)) {
    const sasjs = getSASjs(target)

    let client =
      target.authConfig && target.authConfig.client
        ? target.authConfig.client
        : process.env.CLIENT
    client =
      client && (client.trim() === 'null' || client.trim() === 'undefined')
        ? undefined
        : client

    if (!client) {
      throw new Error(
        `Client ID was not found.
        Please make sure that the 'client' property is set in your local .env file or in the correct target authConfig in your global ~${path.sep}.sasjsrc file.`
      )
    }

    let secret =
      target.authConfig && target.authConfig.secret
        ? target.authConfig.secret
        : process.env.SECRET
    secret =
      secret && (secret.trim() === 'null' || secret.trim() === 'undefined')
        ? undefined
        : secret

    if (!secret) {
      throw new Error(
        `Client secret was not found.
        Please make sure that the 'secret' property is set in your local .env file or in the correct target authConfig in your global ~${path.sep}.sasjsrc file.`
      )
    }

    let refreshToken =
      target.authConfig && target.authConfig.refresh_token
        ? target.authConfig.refresh_token
        : process.env.REFRESH_TOKEN
    refreshToken =
      refreshToken &&
      (refreshToken.trim() === 'null' || refreshToken.trim() === 'undefined')
        ? undefined
        : refreshToken

    let tokens

    if (isRefreshTokenExpiring(refreshToken)) {
      tokens = await getNewAccessToken(sasjs, client, secret, target)
    } else {
      tokens = await refreshTokens(sasjs, client, secret, refreshToken!)
    }

    accessToken = tokens?.access_token
  }

  return accessToken
}

/**
 * Overrides environment variables with values from a target-specific env file if available.
 * Displays a warning if the file is unavailable.
 * @param {string} targetName - the name of the target corresponding to the .env file.
 */
export const overrideEnvVariables = async (targetName: string) => {
  if (!targetName) {
    return
  }
  const targetEnvFile = await readFile(
    path.join(process.projectDir, `.env.${targetName}`)
  ).catch((e) => {
    process.logger?.warn(
      `A .env.${targetName} file was not found in your project directory. Defaulting to variables from the main .env file.`
    )
  })

  if (!targetEnvFile) {
    return
  }

  const targetEnvConfig = dotenv.parse(targetEnvFile)
  for (const k in targetEnvConfig) {
    process.env[k] = targetEnvConfig[k]
  }
}

const getPrecedenceOfHttpsAgentOptionsAndContent = async (
  config: Configuration,
  target: TargetJson
): Promise<HttpsAgentOptions> => {
  const httpsAgentOptions = getHttpsAgentOptionsForInsecure({
    allowInsecureRequests: false,
    ...config.httpsAgentOptions,
    ...target.httpsAgentOptions
  })

  if (httpsAgentOptions.caPath) {
    const rootCas = require('ssl-root-cas')

    rootCas.addFile(path.resolve(httpsAgentOptions.caPath))

    httpsAgentOptions.ca = rootCas
  }
  if (httpsAgentOptions.keyPath) {
    httpsAgentOptions.key = await readFile(httpsAgentOptions.keyPath)
  }
  if (httpsAgentOptions.certPath) {
    httpsAgentOptions.cert = await readFile(httpsAgentOptions.certPath)
  }

  return httpsAgentOptions
}

const getHttpsAgentOptionsForInsecure = (
  options: HttpsAgentOptions
): HttpsAgentOptions => {
  return options.allowInsecureRequests
    ? {
        rejectUnauthorized: false,
        ...options
      }
    : options
}

export const getTestSetUp = async (target: Target) => {
  if (target?.testConfig?.testSetUp) return target.testConfig.testSetUp

  const projectRoot = await getProjectRoot()
  const localConfig = await getConfiguration(
    path.join(projectRoot, 'sasjs', 'sasjsconfig.json')
  ).catch(() => null)

  if (localConfig?.testConfig?.testSetUp) {
    return localConfig.testConfig.testSetUp
  }

  return undefined
}

export const getTestTearDown = async (target: Target) => {
  if (target?.testConfig?.testTearDown) return target.testConfig?.testTearDown

  const projectRoot = await getProjectRoot()
  const localConfig = await getConfiguration(
    path.join(projectRoot, 'sasjs', 'sasjsconfig.json')
  ).catch(() => null)

  if (localConfig?.testConfig?.testTearDown) {
    return localConfig.testConfig?.testTearDown
  }

  return undefined
}

/**
 * Provides instance of @sasjs/adapter.
 * @param target - server server.
 * @returns - instance of @sasjs/adapter.
 */
export function getSASjs(target: Target) {
  const { VERBOSE, LOG_LEVEL } = process.env

  let verbose: VerboseMode = false

  // verbose mode should be enabled if VERBOSE environment variable present and
  // is equal to 'on'(case insensitive)
  if (typeof VERBOSE === 'string' && /on/i.test(VERBOSE)) {
    verbose = true
  }
  // verbose mode should be enabled in 'bleached' mode(without extra colors)
  // if VERBOSE environment variable present and is equal to
  // 'bleached'(case insensitive)
  if (typeof VERBOSE === 'string' && /bleached/i.test(VERBOSE)) {
    verbose = 'bleached'
  }
  // verbose mode should be enabled if LOG_LEVEL environment variable present
  // and is equal to 'trace'(case insensitive)
  else if (typeof LOG_LEVEL === 'string' && /trace/i.test(LOG_LEVEL)) {
    verbose = true
  }

  return new SASjs({
    serverUrl: target.serverUrl,
    appLoc: target.appLoc,
    serverType: target.serverType,
    contextName: target.contextName,
    httpsAgentOptions: target.httpsAgentOptions,
    debug: true,
    useComputeApi: target.serverType === ServerType.SasViya, // compute api is used only on Viya server
    verbose
  })
}

/**
 * Returns configuration object of SAS Adapter and authentication configuration
 * @param {Target} target - the target to get auth configuration from.
 * @returns an object containing a SAS Adapter configuration object `sasjs`
 * and auth configuration `authConfig` or `authConfigSas9`.
 */
export async function getSASjsAndAuthConfig(target: Target) {
  const sasjs = getSASjs(target)

  switch (target.serverType) {
    case ServerType.SasViya:
      return {
        sasjs,
        authConfig: await getAuthConfig(target)
      }

    case ServerType.Sas9:
      return {
        sasjs,
        authConfigSas9: getAuthConfigSAS9(target)
      }

    case ServerType.Sasjs:
      return {
        sasjs,
        authConfig: (await isSasJsServerInServerMode(target))
          ? await getAuthConfig(target)
          : undefined // @sasjs/server doesn't have authentication in desktop mode
      }
  }
}

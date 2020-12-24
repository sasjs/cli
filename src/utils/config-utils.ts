import SASjs from '@sasjs/adapter/node'
import { ServerType, Target } from '@sasjs/utils/types'
import { readFile, fileExists, folderExists, createFile } from './file'
import {
  isAccessTokenExpiring,
  getNewAccessToken,
  refreshTokens
} from './auth-utils'
import path from 'path'
import chalk from 'chalk'
import dotenv from 'dotenv'
import { Configuration } from '../types'
import { getConstants } from '../constants'

export async function getConfiguration(pathToFile: string) {
  const config = await readFile(pathToFile, false, true).catch(() => {
    Promise.resolve(null)
  })

  if (config) {
    const configJson = JSON.parse(config)
    return Promise.resolve<Configuration>(
      configJson.config ? configJson.config : configJson
    )
  }

  return Promise.resolve(null)
}

/**
 * Returns the target with the given name.
 * If the target is not found in the local configuration,
 * this function then looks in the global configuration.
 * If it is still unable to find it, it throws an error.
 * @param {string} targetName - the name of the target in question.
 * @param {boolean} viyaSpecific - will fall back to the first target of type SASVIYA.
 */
export async function findTargetInConfiguration(
  targetName: string,
  viyaSpecific = false
): Promise<{ target: Target; isLocal: boolean }> {
  const projectRoot = await getProjectRoot()
  const localConfig = await getConfiguration(
    path.join(projectRoot, 'sasjs', 'sasjsconfig.json')
  ).catch(() => null)

  if (localConfig && localConfig.targets) {
    const targetJson = localConfig.targets.find((t) => t.name === targetName)
    if (targetJson) {
      return { target: new Target(targetJson), isLocal: true }
    }
  }

  const globalConfig = await getGlobalRcFile()

  if (globalConfig && globalConfig.targets) {
    const targetJson = globalConfig.targets.find(
      (t: Target) => t.name === targetName
    )
    if (targetJson) {
      return { target: new Target(targetJson), isLocal: false }
    }
  }

  let fallBackTargetJson

  if (localConfig && localConfig.targets) {
    fallBackTargetJson = viyaSpecific
      ? localConfig.targets.find((t) => t.serverType === 'SASVIYA')
      : localConfig.targets[0]
  }

  if (fallBackTargetJson) {
    console.log(
      chalk.yellowBright(
        `No build target specified. Using ${chalk.cyanBright(
          fallBackTargetJson.name
        )} by default.\nTarget is found in local config.`
      )
    )

    return { target: new Target(fallBackTargetJson), isLocal: true }
  }

  fallBackTargetJson = viyaSpecific
    ? globalConfig.targets.find(
        (t: Target) => t.serverType === ServerType.SasViya
      )
    : globalConfig.targets[0]

  if (fallBackTargetJson) {
    console.log(
      chalk.yellowBright(
        `No build target specified. Using ${chalk.cyanBright(
          fallBackTargetJson.name
        )} by default.\nTarget is found in global config.`
      )
    )

    return { target: new Target(fallBackTargetJson), isLocal: false }
  }

  throw new Error(
    'Target not found.\nPlease check the target name and try again, or use `sasjs add` to add a new target.'
  )
}

export async function findConfiguration() {
  const isInCurrentFolder = await fileExists(
    path.join(process.cwd(), 'sasjs', 'sasjsconfig.json')
  )
  if (isInCurrentFolder) {
    console.log(
      chalk.cyanBright(
        `Using local project configuration from ${chalk.yellowBright(
          'sasjsconfig.json'
        )} file.`
      )
    )
    const config = await getConfiguration(
      path.join(process.cwd(), 'sasjs', 'sasjsconfig.json')
    )
    return { config, isLocal: true }
  }
  const isInParentFolder = await fileExists(
    path.join(process.cwd(), '..', 'sasjs', 'sasjsconfig.json')
  )
  if (isInParentFolder) {
    console.log(
      chalk.cyanBright(
        `Using local project configuration from ${chalk.yellowBright(
          'sasjsconfig.json'
        )} file.`
      )
    )
    const config = await getConfiguration(
      path.join(process.cwd(), '..', 'sasjs', 'sasjsconfig.json')
    )
    return { config, isLocal: true }
  }
  const homeDir = require('os').homedir()
  console.log(
    chalk.cyanBright(
      `Using global configuration from ${chalk.yellowBright(
        '~/.sasjsrc'
      )} file.`
    )
  )
  const config = await readFile(path.join(homeDir, '.sasjsrc'))
  return { config, isLocal: false }
}

export async function getGlobalRcFile() {
  const homeDir = require('os').homedir()
  const sasjsRcFileContent = await readFile(
    path.join(homeDir, '.sasjsrc'),
    false,
    true
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

export async function saveToGlobalConfig(buildTarget: Target) {
  let globalConfig = await getGlobalRcFile()
  const targetJson = buildTarget.toJson()
  if (globalConfig) {
    if (globalConfig.targets && globalConfig.targets.length) {
      const existingTargetIndex = globalConfig.targets.findIndex(
        (t: Target) => t.name === buildTarget.name
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
  return await saveGlobalRcFile(JSON.stringify(globalConfig, null, 2))
}

export async function removeFromGlobalConfig(targetName: string) {
  let globalConfig = await getGlobalRcFile()
  if (globalConfig && globalConfig.targets && globalConfig.targets.length) {
    const targets = globalConfig.targets.filter(
      (t: Target) => t.name !== targetName
    )
    await saveGlobalRcFile(JSON.stringify({ targets }, null, 2))
  }
}

export async function getLocalConfig() {
  const { buildSourceFolder } = getConstants()
  let config = await getConfiguration(
    path.join(buildSourceFolder, 'sasjsconfig.json')
  )

  return config
}

export async function saveToLocalConfig(target: Target) {
  const { buildSourceFolder } = getConstants()
  const targetJson = target.toJson()
  let config = await getLocalConfig()
  if (config) {
    if (config.targets && config.targets.length) {
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

  const configPath = path.join(buildSourceFolder, 'sasjsconfig.json')

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

export async function getSourcePaths(buildSourceFolder: string) {
  let configuration = await getConfiguration(
    path.join(buildSourceFolder, 'sasjsconfig.json')
  )
  if (!configuration) {
    configuration = { macroFolders: [] }
  }

  const sourcePaths = configuration.macroFolders
    ? configuration.macroFolders.map((macroPath: string) =>
        path.join(buildSourceFolder, macroPath)
      )
    : []
  const macroCorePath = path.join(
    process.projectDir,
    'node_modules',
    '@sasjs',
    'core'
  )
  sourcePaths.push(macroCorePath)

  return sourcePaths
}

/**
 * Returns SAS program folders from configuration.
 * This list includes both common and target-specific folders.
 * @param {string} targetName - name of the configuration.
 */
export async function getProgramFolders(targetName: string) {
  let programFolders: string[] = []
  const projectRoot = await getProjectRoot()
  const localConfig = await getConfiguration(
    path.join(projectRoot, 'sasjs', 'sasjsconfig.json')
  ).catch(() => null)
  if (localConfig && localConfig.programFolders) {
    programFolders = programFolders.concat(localConfig.programFolders)
  }

  const { target } = await findTargetInConfiguration(targetName)

  if (!target) {
    throw new Error(
      'Target not found.\nPlease check the target name and try again, or use `sasjs add` to add a new target.'
    )
  }

  if (target.programFolders) {
    programFolders = programFolders.concat(target.programFolders)
  }

  if (!programFolders.length) {
    console.log(
      chalk.yellowBright(
        'No program folders found. If you have SAS program dependencies, please specify the program paths in the `programFolders` array in your configuration.'
      )
    )
  }
  return programFolders
}

/**
 * Returns SAS macro folders from configuration.
 * This list includes both common and target-specific folders.
 * @param {string} targetName - name of the configuration.
 */
export async function getMacroFolders(targetName: string) {
  let macroFolders: string[] = []
  const projectRoot = await getProjectRoot()
  const localConfig = await getConfiguration(
    path.join(projectRoot, 'sasjs', 'sasjsconfig.json')
  ).catch(() => null)
  if (localConfig && localConfig.programFolders) {
    macroFolders = macroFolders.concat(localConfig.programFolders)
  }

  const { target } = await findTargetInConfiguration(targetName)

  if (!target) {
    throw new Error(
      'Target not found.\nPlease check the target name and try again, or use `sasjs add` to add a new target.'
    )
  }

  if (target.programFolders) {
    macroFolders = macroFolders.concat(target.programFolders)
  }

  if (!macroFolders.length) {
    console.log(
      chalk.yellowBright(
        'No program folders found. If you have SAS program dependencies, please specify the program paths in the `programFolders` array in your configuration.'
      )
    )
  }
  return macroFolders
}

export function getMacroCorePath() {
  return path.join(process.projectDir, 'node_modules', '@sasjs/core')
}

/**
 * Sanitizes app location string.
 * @param {string} appLoc - app location
 */
export function sanitizeAppLoc(appLoc: string) {
  if (!appLoc || typeof appLoc !== 'string') return

  // Removes trailing '/'
  appLoc = appLoc.replace(/\/{1,}$/, '')

  // Adds leading '/'
  if (!/^\//.test(appLoc)) appLoc = '/' + appLoc

  // Replaces multiple leading '/' with a single '/'
  appLoc = appLoc.replace(/^\/{2,}/, '/')

  return appLoc
}

export async function getProjectRoot() {
  let root = '',
    rootFound = false,
    i = 1
  let currentLocation = process.projectDir
  const maxLevels = 4
  while (!rootFound && i <= maxLevels) {
    const isRoot = await folderExists(path.join(currentLocation, 'sasjs'))
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
 * Gets an access token for the specified target.
 * If the target is from the global `.sasjsrc` file,
 * the auth info should be contained in it.
 * It should be in the form:
 * @example: { targets: [{ "name": "targetName", "authInfo": { "client": "client ID", "secret": "Client Secret", "access_token": "Token", "refresh_token": "Token" }}]}
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

  if (!accessToken || accessToken.trim() === 'null') {
    // Check .env file for target if available
    dotenv.config({
      path: path.join(process.projectDir, `.env.${target.name}`)
    })
    accessToken = process.env.ACCESS_TOKEN as string
  }

  if (!accessToken || accessToken.trim() === 'null') {
    throw new Error(
      `A valid access token was not found.\nPlease provide an access token in the access_token property in your .env file or as part of the authInfo in your target configuration (sasjsconfig.json).`
    )
  }

  if (checkIfExpiring && isAccessTokenExpiring(accessToken)) {
    const sasjs = new SASjs({
      serverUrl: target.serverUrl,
      serverType: target.serverType
    })

    let client =
      target.authConfig && target.authConfig.client
        ? target.authConfig.client
        : process.env.CLIENT
    client = client && client.trim() === 'null' ? undefined : client

    if (!client) {
      throw new Error(
        `Client ID was not found.
        Please make sure that the 'client' property is set in your local .env file or in the correct target authConfig in your global ~/.sasjsrc file.`
      )
    }

    let secret =
      target.authConfig && target.authConfig.secret
        ? target.authConfig.secret
        : process.env.SECRET
    secret = secret && secret.trim() === 'null' ? undefined : secret

    if (!secret) {
      throw new Error(
        `Client secret was not found.
        Please make sure that the 'secret' property is set in your local .env file or in the correct target authConfig in your global ~/.sasjsrc file.`
      )
    }

    let refreshToken =
      target.authConfig && target.authConfig.refresh_token
        ? target.authConfig.refresh_token
        : process.env.REFRESH_TOKEN
    refreshToken =
      refreshToken && refreshToken.trim() === 'null' ? undefined : refreshToken

    let authConfig

    if (refreshToken) {
      authConfig = await refreshTokens(sasjs, client, secret, refreshToken)
    } else {
      authConfig = await getNewAccessToken(sasjs, client, secret, target)
    }

    accessToken = authConfig.access_token
  }

  return accessToken
}

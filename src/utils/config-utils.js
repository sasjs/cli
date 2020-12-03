import SASjs from '@sasjs/adapter/node'
import { readFile, fileExists, folderExists, createFile } from './file-utils'
import {
  isAccessTokenExpiring,
  getNewAccessToken,
  refreshTokens
} from './auth-utils'
import { getVariable } from './utils'
import path from 'path'
import chalk from 'chalk'

export async function getConfiguration(pathToFile) {
  const config = await readFile(pathToFile, false, true).catch((err) => {
    Promise.resolve(null)
  })

  if (config) {
    const configJson = JSON.parse(config)
    return Promise.resolve(configJson.config ? configJson.config : configJson)
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
  targetName,
  viyaSpecific = false
) {
  const projectRoot = await getProjectRoot()
  const localConfig = await getConfiguration(
    path.join(projectRoot, 'sasjs', 'sasjsconfig.json')
  ).catch(() => null)

  if (localConfig && localConfig.targets) {
    const target = localConfig.targets.find((t) => t.name === targetName)
    if (target) {
      return { target, isLocal: true }
    }
  }

  const globalConfig = await getGlobalRcFile()

  if (globalConfig && globalConfig.targets) {
    const target = globalConfig.targets.find((t) => t.name === targetName)
    if (target) {
      return { target, isLocal: false }
    }
  }

  let fallBackTarget

  if (localConfig && localConfig.targets) {
    fallBackTarget = viyaSpecific
      ? localConfig.targets.find((t) => t.serverType === 'SASVIYA')
      : localConfig.targets[0]
  }

  if (fallBackTarget) {
    console.log(
      chalk.yellowBright(
        `No build target specified. Using ${chalk.cyanBright(
          fallBackTarget.name
        )} by default.\nTarget is found in local config.`
      )
    )

    return { target: fallBackTarget, isLocal: true }
  }

  fallBackTarget = viyaSpecific
    ? globalConfig.targets.find((t) => t.serverType === 'SASVIYA')
    : globalConfig.targets[0]

  if (fallBackTarget) {
    console.log(
      chalk.yellowBright(
        `No build target specified. Using ${chalk.cyanBright(
          fallBackTarget.name
        )} by default.\nTarget is found in global config.`
      )
    )

    return { target: fallBackTarget, isLocal: false }
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

export async function saveGlobalRcFile(content) {
  const homeDir = require('os').homedir()
  const rcFilePath = path.join(homeDir, '.sasjsrc')

  await createFile(rcFilePath, content)

  console.log(chalk.greenBright(`Config saved to '${rcFilePath}'.`))
}

export async function saveLocalRcFile(content) {
  const projectRoot = await getProjectRoot()
  await createFile(path.join(projectRoot, '.sasjsrc'), content)
}

export async function getFolders(sasOnly = false) {
  const configPath = sasOnly ? '../config-sasonly.json' : '../config.json'
  const config = await readFile(path.join(__dirname, configPath))
  if (config) {
    const configJson = JSON.parse(config)
    return Promise.resolve(configJson.folders)
  }
  return Promise.reject()
}

export async function getSourcePaths(buildSourceFolder) {
  let configuration = await getConfiguration(
    path.join(buildSourceFolder, 'sasjsconfig.json')
  )
  if (!configuration) {
    configuration = { cmnMacros: [], useMacroCore: true }
  }

  const sourcePaths = configuration.cmnMacros
    ? configuration.cmnMacros.map((l) => path.join(buildSourceFolder, l))
    : []
  if (configuration.useMacroCore) {
    const macroCorePath = path.join(
      process.projectDir,
      'node_modules',
      '@sasjs',
      'core'
    )
    sourcePaths.push(macroCorePath)
  }

  return sourcePaths
}

export async function getBuildTargets(buildSourceFolder) {
  const configuration = await getConfiguration(
    path.join(buildSourceFolder, 'sasjsconfig.json')
  )

  return configuration && configuration.targets ? configuration.targets : []
}

/**
 * Returns SAS server configuration.
 * @param {string} targetName - name of the configuration.
 */
export async function getBuildTarget(targetName) {
  const { buildSourceFolder } = require('../constants').get()
  let targets = await getBuildTargets(buildSourceFolder)

  if (targets.length === 0) {
    const globalRc = await getGlobalRcFile()

    targets = globalRc.targets || []

    if (targets.length === 0) throw new Error(`No build targets found.`)
  }

  let target = null

  if (targetName) target = targets.find((t) => t.name === targetName)

  if (!target) {
    target = targets[0]

    console.log(
      chalk.yellowBright(
        `${
          targetName
            ? `Target with the name '${targetName}' was not found in sasjsconfig.json.`
            : `Target name wasn't provided.`
        } Using ${chalk.cyanBright(target.name)} by default.`
      )
    )
  }

  if (target.appLoc) target.appLoc = sanitizeAppLoc(target.appLoc)

  return target
}

/**
 * Returns SAS program folders from configuration.
 * This list includes both common and target-specific folders.
 * @param {string} targetName - name of the configuration.
 */
export async function getProgramFolders(targetName) {
  let programFolders = []
  const projectRoot = await getProjectRoot()
  const localConfig = await getConfiguration(
    path.join(projectRoot, 'sasjs', 'sasjsconfig.json')
  ).catch(() => null)
  if (localConfig && localConfig.programFolders) {
    programFolders = programFolders.concat(localConfig.programFolders)
  }

  const target = await findTargetInConfiguration(targetName)

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

export function getMacroCorePath() {
  return path.join(process.projectDir, 'node_modules', '@sasjs/core')
}

/**
 * Sanitizes app location string.
 * @param {string} appLoc - app location
 */
export function sanitizeAppLoc(appLoc) {
  if (!appLoc || typeof appLoc !== 'string') return

  // Removes trailing '/'
  appLoc = appLoc.replace(/\/{1,}$/, '')

  // Adds leading '/'
  if (!/^\//.test(appLoc)) appLoc = '/' + appLoc

  // Replaces multiple leading '/' with a single '/'
  appLoc = appLoc.replace(/^\/{2,}/, '/')

  return appLoc
}

export async function getTargetSpecificFile(typeOfFile, targetToBuild = {}) {
  const isJob = typeOfFile.includes('job')
  const tgtPrefix = 'tgt'
  const cmnPrefix = 'cmn'
  const { buildSourceFolder } = require('../constants').get()
  let toBuildPath = ''

  if (targetToBuild[`${isJob ? '' : tgtPrefix}${typeOfFile}`] == undefined) {
    const configuration = await getConfiguration(
      path.join(buildSourceFolder, 'sasjsconfig.json')
    )

    if (
      configuration &&
      configuration[`${isJob ? '' : cmnPrefix}${typeOfFile}`]
    ) {
      toBuildPath = configuration[`${isJob ? '' : cmnPrefix}${typeOfFile}`]
    }
  } else if (targetToBuild[`${isJob ? '' : tgtPrefix}${typeOfFile}`] == false) {
    toBuildPath = ''
  } else if (targetToBuild[`${isJob ? '' : tgtPrefix}${typeOfFile}`].length) {
    toBuildPath = targetToBuild[`${isJob ? '' : tgtPrefix}${typeOfFile}`]
  }

  if (toBuildPath.length == 0) return { path: 'Not Provided', content: '' }

  const toBuildContent = await readFile(
    path.join(buildSourceFolder, toBuildPath)
  )

  return {
    path: path.join(buildSourceFolder, toBuildPath),
    content: toBuildContent
  }
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
export async function getAccessToken(target, checkIfExpiring = true) {
  let accessToken =
    target && target.authInfo && target.authInfo.access_token
      ? target.authInfo.access_token
      : process.env.ACCESS_TOKEN

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

    const client =
      target.authInfo && target.authInfo.client
        ? target.authInfo.client
        : await getVariable('client', target)
    if (!client) {
      throw new Error(
        `Client ID was not found.
        Please make sure that the 'client' property is set in your local .env file or in the correct target authInfo in your global ~/.sasjsrc file.`
      )
    }

    const secret =
      target.authInfo && target.authInfo.secret
        ? target.authInfo.secret
        : await getVariable('secret', target)
    if (!secret) {
      throw new Error(
        `Client secret was not found.
        Please make sure that the 'secret' property is set in your local .env file or in the correct target authInfo in your global ~/.sasjsrc file.`
      )
    }

    const refreshToken =
      target.authInfo && target.authInfo.refresh_token
        ? target.authInfo.refresh_token
        : await getVariable('refresh_token', target)
    let authInfo

    if (refreshToken) {
      authInfo = await refreshTokens(sasjs, client, secret, refreshToken)
    } else {
      authInfo = await getNewAccessToken(sasjs, client, secret, target)
    }

    accessToken = authInfo.access_token
  }

  return accessToken
}

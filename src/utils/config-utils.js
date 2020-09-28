import SASjs from '@sasjs/adapter/node'
import { readFile, fileExists, folderExists, createFile } from './file-utils'
import { isAccessTokenExpiring, getNewAccessToken } from './auth-utils'
import { getVariable } from './utils'
import path from 'path'
import chalk from 'chalk'

export async function getConfiguration(pathToFile) {
  const config = await readFile(pathToFile, false, true).catch(() => null)
  if (config) {
    const configJson = JSON.parse(config)
    return Promise.resolve(configJson.config ? configJson.config : configJson)
  }
  return Promise.resolve(null)
}

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

  let fallBackTarget = viyaSpecific
    ? localConfig.targets.find((t) => t.serverType === 'SASVIYA')
    : localConfig.targets[0]

  if (fallBackTarget) {
    console.log(
      chalk.yellowBright(
        `No build target specified. Using ${chalk.cyanBright(
          fallBackTarget.name
        )} by default.`
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
        )} by default.`
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
  await createFile(path.join(homeDir, '.sasjsrc'), content)
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
  const { buildSourceFolder } = require('../constants')
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

  return target
}

export function getMacroCorePath() {
  return path.join(process.projectDir, 'node_modules', '@sasjs/core')
}

export async function getTargetToBuild(targetName) {
  const { buildSourceFolder } = require('../constants')
  const buildTargets = await getBuildTargets(buildSourceFolder)

  if (buildTargets.length) {
    let targetToBuild = buildTargets.find((t) => t.name === targetName)

    if (!targetToBuild) {
      targetToBuild = buildTargets[0]

      console.log(
        chalk.yellowBright(
          `No build target specified. Using ${chalk.cyanBright(
            targetToBuild.name
          )} by default.`
        )
      )
    }

    return Promise.resolve(targetToBuild)
  } else {
    // Use default target to build. For cases when build target was not found.
    const defaultTargetToBuild = {
      buildOutputFileName: 'build.sas',
      serverType: 'SASVIYA'
    }

    console.log(
      chalk.yellowBright(
        `No build target found. Using default target:\n${JSON.stringify(
          defaultTargetToBuild,
          null,
          2
        )}`
      )
    )

    return Promise.resolve(defaultTargetToBuild)
  }
}

export async function getTargetSpecificFile(typeOfFile, targetToBuild = {}) {
  const { buildSourceFolder } = require('../constants')
  let toBuildPath = ''
  if (targetToBuild[`tgt${typeOfFile}`] == undefined) {
    const configuration = await getConfiguration(
      path.join(buildSourceFolder, 'sasjsconfig.json')
    )
    if (configuration[`cmn${typeOfFile}`])
      toBuildPath = configuration[`cmn${typeOfFile}`]
  } else if (targetToBuild[`tgt${typeOfFile}`] == false) toBuildPath = ''
  else if (targetToBuild[`tgt${typeOfFile}`].length)
    toBuildPath = targetToBuild[`tgt${typeOfFile}`]

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
  let currentLocation = process.cwd()
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

export async function getAccessToken(target, checkIfExpiring = true) {
  let accessToken =
    target && target.authInfo && target.authInfo.access_token
      ? target.authInfo.access_token
      : process.env.access_token

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

    const client = await getVariable('client', target)
    const secret = await getVariable('secret', target)

    const authInfo = await getNewAccessToken(sasjs, client, secret, target)

    accessToken = authInfo.access_token
  }

  return accessToken
}

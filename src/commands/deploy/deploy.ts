import path from 'path'
import os from 'os'
import SASjs, { SASjsApiClient, SasjsRequestClient } from '@sasjs/adapter/node'
import {
  getAuthConfig,
  getStreamConfig,
  getSASjsAndAuthConfig,
  getSASjs
} from '../../utils/config'
import {
  displaySasjsRunnerError,
  executeShellScript,
  executePowerShellScript,
  isSasJsServerInServerMode
} from '../../utils/utils'
import {
  readFile,
  createFile,
  ServerType,
  Target,
  StreamConfig,
  asyncForEach,
  decodeFromBase64,
  getAbsolutePath,
  ServicePackSASjs,
  FileTree,
  FolderMember,
  MemberType
} from '@sasjs/utils'
import { isSasFile, isShellScript, isPowerShellScript } from '../../utils/file'
import { getDeployScripts } from './internal/getDeployScripts'
import { deployToSasViyaWithServicePack } from '../shared/deployToSasViyaWithServicePack'

/**
 * Deploys app to serverUrl/appLoc mentioned in specified target.
 * @param {Target} target - the target having deploy configuration.
 * @param {boolean} isLocal - flag indicating if specified target is
 * from local sasjsconfig or global sasjsconfig file.
 * @param {object} sasjs - optional configuration object of SAS adapter.
 */
export async function deploy(target: Target, isLocal: boolean, sasjs?: SASjs) {
  const streamConfig = await getStreamConfig(target)

  if (target.deployConfig?.deployServicePack) {
    const { buildDestinationFolder } = process.sasjsConstants
    const finalFilePathJSON = path.join(
      buildDestinationFolder,
      `${target.name}.json`
    )

    if (target.serverType === ServerType.SasViya) {
      const appLoc = encodeURI(target.appLoc)
      process.logger?.info(
        `Deploying service pack to ${target.serverUrl} at location ${appLoc} .`
      )

      const jsonObject: FileTree = await deployToSasViyaWithServicePack(
        finalFilePathJSON,
        target,
        isLocal,
        true
      )

      const servicesFolder = jsonObject?.members.find<FolderMember>(
        (member): member is FolderMember =>
          member?.name === 'services' && member?.type === MemberType.folder
      )

      const webIndexFileName: string =
        servicesFolder?.members?.find(
          (member: any) => member?.type === MemberType.file
        )?.name ?? ''

      process.logger?.success('Build pack has been successfully deployed.')

      process.logger?.success(
        target.serverType === ServerType.SasViya && webIndexFileName
          ? `${target.serverUrl}/SASJobExecution?_file=${appLoc}/services/${webIndexFileName}&_debug=2`
          : `${target.serverUrl}/SASJobExecution?_folder=${appLoc}`
      )
    } else if (target.serverType === ServerType.Sasjs) {
      process.logger?.info(
        `Deploying service pack to ${target.serverUrl} at location ${target.appLoc} .`
      )
      await deployToSasjsWithServicePack(
        finalFilePathJSON,
        target,
        streamConfig
      )
    }
  }

  const deployScripts = await getDeployScripts(target)

  if (deployScripts.length === 0 && !target.deployConfig?.deployServicePack) {
    throw new Error(
      `Deployment failed.\nPlease either enable the 'deployServicePack' option or add deployment script paths to 'deployScripts' in your target's 'deployConfig'.`
    )
  }

  const { buildDestinationFolder } = process.sasjsConstants

  const logFilePath = buildDestinationFolder

  await asyncForEach(deployScripts, async (deployScript) => {
    const deployScriptPath = getAbsolutePath(deployScript, process.projectDir)
    await executeDeployScript(deployScriptPath, target, streamConfig)
  })
}

async function executeDeployScript(
  scriptPath: string,
  target: Target,
  streamConfig: StreamConfig
) {
  if (isSasFile(scriptPath))
    return await executeSasScript(scriptPath, target, streamConfig)

  return executeNonSasScript(scriptPath)
}

async function executeSasScript(
  scriptPath: string,
  target: Target,
  streamConfig: StreamConfig
) {
  process.logger?.info(`Processing SAS file ${path.basename(scriptPath)} ...`)

  const { buildDestinationFolder: logFolder } = process.sasjsConstants

  const deployScriptName = path.basename(scriptPath)
  const logFilePath = path.join(
    logFolder,
    deployScriptName.replace('.sas', '.log')
  )

  // get content of file
  const deployScriptContent = await readFile(scriptPath)
  // split into lines
  const linesToExecute = deployScriptContent.replace(/\r\n/g, '\n').split('\n')

  if (target.serverType === ServerType.SasViya) {
    await deployToSasViya(
      deployScriptName,
      target,
      linesToExecute,
      logFilePath,
      streamConfig
    )
  } else if (target.serverType === ServerType.Sas9) {
    await deployToSas9(
      deployScriptName,
      target,
      linesToExecute,
      logFilePath,
      streamConfig
    )
  } else {
    await deployToSasJS(
      deployScriptName,
      target,
      linesToExecute,
      logFilePath,
      streamConfig
    )
  }
}

async function executeNonSasScript(scriptPath: string) {
  const fileExtension = path.extname(scriptPath)

  const logPath = path.join(
    process.projectDir,
    'sasjsbuild',
    path.basename(scriptPath).replace(fileExtension, '.log')
  )

  if (isShellScript(scriptPath)) {
    process.logger?.info(`Executing shell script ${scriptPath} ...`)

    await executeShellScript(scriptPath, logPath)

    process.logger?.success(
      `Shell script execution completed! Log is here: ${logPath}`
    )

    return
  }

  if (isPowerShellScript(scriptPath)) {
    process.logger?.info(`Executing powershell script ${scriptPath} ...`)

    await executePowerShellScript(scriptPath, logPath)

    process.logger?.success(
      `PowerShell script execution completed! Log is here: ${logPath}`
    )

    return
  }

  process.logger?.error(`Unable to process script located at ${scriptPath}`)
}

/**
 * Deploys app to `SASVIYA` server through deployScript.
 * @param {string} deployScriptName - name of deploy script.
 * @param {Target} target - the target having deploy configuration.
 * @param {string[]} linesToExecute - array of SAS code lines of deploy script to execute.
 * @param {string} logFilePath - path to log file,
 * log file name will be <deploy-script-name>.log
 * @param {object} streamConfig - optional configuration object of StreamConfig
 * for printing web app url on console.
 */
async function deployToSasViya(
  deployScriptName: string,
  target: Target,
  linesToExecute: string[],
  logFilePath: string,
  streamConfig?: StreamConfig
) {
  process.logger?.info(
    `Sending ${deployScriptName} to SAS server for execution.`
  )

  const contextName = target.contextName

  if (!contextName) {
    throw new Error(
      'Compute Context Name is required for SAS Viya deployments.\n Please ensure that `contextName` is present in your build target configuration or in your .env file, and try again.\n'
    )
  }

  const { sasjs, authConfig } = await getSASjsAndAuthConfig(target)

  const executionResult = await sasjs
    .executeScript({
      fileName: deployScriptName,
      linesOfCode: linesToExecute,
      contextName,
      authConfig
    })
    .catch((err: any) => {
      process.logger.error('executeScriptSASViya Error', err)
    })

  let log
  try {
    log = executionResult.log.items
      ? executionResult.log.items
          .map((i: { line: string }) => i.line)
          .join(os.EOL)
      : JSON.stringify(executionResult.log).replace(/\\n/g, os.EOL)
  } catch (e: any) {
    process.logger?.error(
      `An error occurred when parsing the execution response: ${e.message}`
    )

    log = executionResult
  }

  await createFile(logFilePath, log)
  process.logger?.success(
    `Deployment completed! Log is available at ${logFilePath}`
  )

  if (streamConfig?.streamWeb) {
    const appLoc = encodeURI(target.appLoc)
    const webAppStreamUrl = `${target.serverUrl}/SASJobExecution?_FILE=${appLoc}/services/${streamConfig.streamServiceName}.html&_debug=2`
    process.logger?.info(`Web app is available at ${webAppStreamUrl}`)
  }
}

/**
 * Deploys app to `SAS9` server through deployScript.
 * @param {string} deployScriptName - name of deploy script.
 * @param {Target} target - the target having deploy configuration.
 * @param {string[]} linesToExecute - array of SAS code lines of deploy script to execute.
 * @param {string} logFolder - optional path to log folder,
 * log file name will be <deploy-script-name>.log
 * @param {object} streamConfig - optional configuration object of StreamConfig
 * for printing web app url on console.
 */
async function deployToSas9(
  deployScriptName: string,
  target: Target,
  linesToExecute: string[],
  logFilePath: string,
  streamConfig?: StreamConfig
) {
  const { sasjs, authConfigSas9 } = await getSASjsAndAuthConfig(target)
  const userName = authConfigSas9!.userName
  const password = decodeFromBase64(authConfigSas9!.userName)

  let completedWithError = false
  const executionResult = await sasjs
    .executeScript({
      linesOfCode: linesToExecute,
      authConfigSas9: { userName, password }
    })
    .catch((err) => {
      process.logger?.log(formatErrorString(err))
      if (err && err.errorCode === 404) {
        displaySasjsRunnerError(userName)
      }
      completedWithError = true
      return err
    })

  if (!executionResult) {
    return process.logger?.error('Error getting execution log')
  }

  const logContent = completedWithError
    ? executionResult.result
    : executionResult

  await createFile(logFilePath, logContent ?? '')

  if (completedWithError) {
    process.logger?.error(
      `Deployment failed with errors! Log is available at ${logFilePath}`
    )

    throw new Error(`Deployment failed.`)
  }

  process.logger?.success(
    `Deployment completed! Log is available at ${logFilePath}`
  )

  if (streamConfig?.streamWeb) {
    const appLoc = encodeURI(target.appLoc)
    const webAppStreamUrl = `${target.serverUrl}/SASStoredProcess/?_PROGRAM=${appLoc}/services/${streamConfig.streamServiceName}`
    process.logger?.info(`Web app is available at ${webAppStreamUrl}`)
  }
}

/**
 * Deploys app to `SASJS` server through deployScript.
 * @param {string} deployScriptName - name of deploy script.
 * @param {Target} target - the target having deploy configuration.
 * @param {string[]} linesToExecute - array of SAS code lines of deploy script to execute.
 * @param {string} logFilePath - optional path to log folder,
 * log file name will be <deploy-script-name>.log
 * @param {object} streamConfig - optional configuration object of StreamConfig
 * for printing web app url on console.
 */
async function deployToSasJS(
  deployScriptName: string,
  target: Target,
  linesToExecute: string[],
  logFilePath: string,
  streamConfig?: StreamConfig
) {
  process.logger?.info(
    `Sending ${deployScriptName} to SASJS server for execution.`
  )

  const authConfig = (await isSasJsServerInServerMode(target))
    ? await getAuthConfig(target)
    : undefined
  const sasjs = getSASjs(target)

  let completedWithError = false
  const executionResult = await sasjs
    .executeScript({
      linesOfCode: linesToExecute,
      runTime: 'sas',
      authConfig
    })
    .catch((err: any) => {
      const errorString = formatErrorString(err)
      process.logger.error('executeScript Error:', errorString)
      return errorString
    })

  const logContent = completedWithError
    ? executionResult.result
    : executionResult

  await createFile(logFilePath, logContent ?? '')

  if (completedWithError) {
    process.logger?.error(
      `Deployment failed with errors! Log is available at ${logFilePath}`
    )

    throw new Error(`Deployment failed.`)
  }

  process.logger?.success(
    `Deployment completed! Log is available at ${logFilePath}`
  )

  if (streamConfig?.streamWeb) {
    const webAppStreamUrl = `${target.serverUrl}/AppStream/${streamConfig.streamServiceName}`
    process.logger?.info(`Web app is available at ${webAppStreamUrl}`)
  }
}

/**
 * Deploys app to `SASJS` server.
 * @param {Target} target - the target having deploy configuration.
 * @param {object} streamConfig - optional config for deploying streaming app.
 */
async function deployToSasjsWithServicePack(
  jsonFilePath: string,
  target: Target,
  streamConfig?: StreamConfig
) {
  const jsonContent = await readFile(jsonFilePath)
  const payload: ServicePackSASjs = JSON.parse(jsonContent)

  const authConfig = (await isSasJsServerInServerMode(target))
    ? await getAuthConfig(target)
    : undefined

  const sasjsApiClient = new SASjsApiClient(
    new SasjsRequestClient(target.serverUrl, target.httpsAgentOptions)
  )

  const result = await sasjsApiClient
    .deploy(payload, target.appLoc, authConfig)
    .catch((err) => {
      process.logger?.error('deployToSASjs Error', err)
    })

  if (result?.status === 'failure') {
    process.logger?.error(result.message)

    if (result.example) {
      process.logger?.info(
        `Payload example:\n${JSON.stringify(result.example, null, 2)}`
      )
    }
  }

  if (streamConfig?.streamWeb && result?.streamServiceName) {
    const webAppStreamUrl = `${target.serverUrl}/AppStream/${result.streamServiceName}`
    process.logger?.info(`Web app is available at ${webAppStreamUrl}`)
  }
}

/**
 * this function formats the error string to dump error log on console
 * @param error
 * @returns returns a string
 */
function formatErrorString(error: any) {
  let err = ''

  err += `${error.stack}\n`

  err += `url: ${
    error.config?.url ? removePasswordFromUrl(error.config.url) : ''
  }\n`

  err += `method: ${error.config?.method ? error.config.method : ''}\n`

  err += `headers: ${error.config?.headers ? error.config.headers : ''}\n`

  err += `data: ${error.response?.data ? error.response.data : ''}`
  return err
}

/**
 * removes password from url
 * @param str parameter of type string
 * @returns returns a string
 */
function removePasswordFromUrl(str: string) {
  const startingIndex = str.indexOf('_password')
  if (startingIndex !== -1) {
    return str.slice(0, startingIndex) + 'PASSWORD-REMOVED'
  }

  return str
}

import path from 'path'
import os from 'os'
import SASjs from '@sasjs/adapter/node'
import { getAuthConfig, getStreamConfig } from '../../utils/config'
import { displaySasjsRunnerError, executeShellScript } from '../../utils/utils'
import {
  readFile,
  createFile,
  ServerType,
  Target,
  StreamConfig,
  asyncForEach,
  AuthConfig,
  decodeFromBase64,
  getAbsolutePath,
  ServicePackSASjs,
  FileTree,
  FolderMember,
  MemberType
} from '@sasjs/utils'
import { isSasFile, isShellScript } from '../../utils/file'
import { getDeployScripts } from './internal/getDeployScripts'
import { deployToSasViyaWithServicePack } from '../shared/deployToSasViyaWithServicePack'

/**
 * Deploys app to serverUrl/appLoc mentioned in specified target.
 * @param {Target} target- the target having deploy configuration.
 * @param {boolean} isLocal- flag indicating if specified target is
 * from local sasjsconfig or global sasjsconfig file.
 * @param {object} sasjs - optional configuration object of SAS adapter.
 */
export async function deploy(target: Target, isLocal: boolean, sasjs?: SASjs) {
  if (
    target.serverType === ServerType.SasViya &&
    target.deployConfig?.deployServicePack
  ) {
    const appLoc = encodeURI(target.appLoc)
    process.logger?.info(
      `Deploying service pack to ${target.serverUrl} at location ${appLoc} .`
    )

    const { buildDestinationFolder } = process.sasjsConstants
    const finalFilePathJSON = path.join(
      buildDestinationFolder,
      `${target.name}.json`
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
  }

  const deployScripts = await getDeployScripts(target)

  if (deployScripts.length === 0 && !target.deployConfig?.deployServicePack) {
    throw new Error(
      `Deployment failed.\nPlease either enable the 'deployServicePack' option or add deployment script paths to 'deployScripts' in your target's 'deployConfig'.`
    )
  }

  const { buildDestinationFolder } = process.sasjsConstants

  const logFilePath = buildDestinationFolder

  const streamConfig = await getStreamConfig(target)

  if (target.serverType === ServerType.Sasjs) {
    await deployToSasjs(target, sasjs, streamConfig)
  } else {
    await asyncForEach(deployScripts, async (deployScript) => {
      const deployScriptPath = getAbsolutePath(deployScript, process.projectDir)

      if (isSasFile(deployScript)) {
        process.logger?.info(
          `Processing SAS file ${path.basename(deployScript)} ...`
        )
        // get content of file
        const deployScriptContent = await readFile(deployScriptPath)
        // split into lines
        const linesToExecute = deployScriptContent
          .replace(/\r\n/g, '\n')
          .split('\n')

        const deployScriptName = path.basename(deployScript)
        if (target.serverType === ServerType.SasViya) {
          await deployToSasViya(
            deployScriptName,
            target,
            isLocal,
            linesToExecute,
            logFilePath,
            streamConfig
          )
        } else {
          await deployToSas9(
            deployScriptName,
            target,
            linesToExecute,
            logFilePath,
            streamConfig
          )
        }
      } else if (isShellScript(deployScript)) {
        process.logger?.info(`Executing shell script ${deployScript} ...`)

        const logPath = path.join(
          process.projectDir,
          'sasjsbuild',
          `${path.basename(deployScript).replace('.sh', '')}.log`
        )

        await executeShellScript(deployScriptPath, logPath)

        process.logger?.success(
          `Shell script execution completed! Log is here: ${logPath}`
        )
      }
    })
  }
}

/**
 * Returns configuration object of SAS Adapter and authentication configuration
 * @param {Target} target- the target to get auth configuration from.
 * @param {boolean} isLocal- flag indicating if specified target is
 * from local sasjsconfig or global sasjsconfig file.
 * @returns an object containing a SAS Adapter configuration object `sasjs`
 * and auth configuration `authConfig`.
 */
async function getSASjsAndAuthConfig(target: Target, isLocal: boolean) {
  const sasjs = new SASjs({
    serverUrl: target.serverUrl,
    appLoc: target.appLoc,
    serverType: target.serverType,
    httpsAgentOptions: target.httpsAgentOptions,
    debug: true,
    useComputeApi: true
  })

  let authConfig: AuthConfig
  try {
    authConfig = await getAuthConfig(target)
  } catch (e) {
    throw new Error(
      `Deployment failed. Request is not authenticated.\nPlease add the following variables to your .env${
        isLocal ? `.${target.name}` : ''
      } file:\nCLIENT, SECRET, ACCESS_TOKEN, REFRESH_TOKEN`
    )
  }
  return {
    sasjs,
    authConfig
  }
}

/**
 * Deploys app to `SASVIYA` server through deployScript.
 * @param {string} deployScriptName- name of deploy script.
 * @param {Target} target- the target having deploy configuration.
 * @param {boolean} isLocal- flag indicating if specified target is
 * from local sasjsconfig or global sasjsconfig file.
 * @param {string[]} linesToExecute - array of SAS code lines of deploy script to execute.
 * @param {string} logFolder - optional path to log folder,
 * log file name will be <deploy-script-name>.log
 * @param {object} streamConfig - optional configuration object of StreamConfig
 * for printing web app url on console.
 */
async function deployToSasViya(
  deployScriptName: string,
  target: Target,
  isLocal: boolean,
  linesToExecute: string[],
  logFolder?: string,
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

  const { sasjs, authConfig } = await getSASjsAndAuthConfig(target, isLocal)

  const executionResult = await sasjs
    .executeScriptSASViya(
      deployScriptName,
      linesToExecute,
      contextName,
      authConfig
    )
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

  if (logFolder) {
    await createFile(
      path.join(logFolder, `${deployScriptName.replace('.sas', '')}.log`),
      log
    )
    process.logger?.success(
      `Deployment completed! Log is available at ${path.join(
        logFolder,
        `${deployScriptName.replace('.sas', '')}.log`
      )}`
    )
  } else {
    process.logger?.error('Unable to create log file.')
  }

  if (streamConfig?.streamWeb) {
    const appLoc = encodeURI(target.appLoc)
    const webAppStreamUrl = `${target.serverUrl}/SASJobExecution?_FILE=${appLoc}/services/${streamConfig.streamServiceName}.html&_debug=2`
    process.logger?.info(`Web app is available at ${webAppStreamUrl}`)
  }
}

/**
 * Deploys app to `SAS9` server through deployScript.
 * @param {string} deployScriptName- name of deploy script.
 * @param {Target} target- the target having deploy configuration.
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
  logFolder?: string,
  streamConfig?: StreamConfig
) {
  let username: any
  let password: any
  if (target.authConfigSas9) {
    username = target.authConfigSas9.userName
    password = target.authConfigSas9.password
  } else {
    username = process.env.SAS_USERNAME
    password = process.env.SAS_PASSWORD
  }
  if (!username || !password) {
    const { sas9CredentialsError } = process.sasjsConstants
    throw new Error(sas9CredentialsError)
  }
  password = decodeFromBase64(password)

  const sasjs = new SASjs({
    serverUrl: target.serverUrl,
    httpsAgentOptions: target.httpsAgentOptions,
    appLoc: target.appLoc,
    serverType: target.serverType
  })

  let completedWithError = false
  const executionResult = await sasjs
    .executeScriptSAS9(linesToExecute, username, password)
    .catch((err) => {
      process.logger?.log(formatErrorString(err))
      if (err && err.errorCode === 404) {
        displaySasjsRunnerError(username)
      }
      completedWithError = true
      return err
    })

  if (!executionResult) {
    return process.logger?.error('Error getting execution log')
  }

  if (!logFolder) {
    return process.logger?.error('Unable to create log file.')
  }

  const logContent = completedWithError
    ? executionResult.result
    : executionResult

  const logFilePath = path.join(
    logFolder,
    `${deployScriptName.replace('.sas', '')}.log`
  )
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
 * Deploys app to `SASJS` server.
 * @param {Target} target- the target having deploy configuration.
 * @param {object} sasjs - optional configuration object of SAS adapter.
 * @param {object} streamConfig - optional config for deploying streaming app.
 */
async function deployToSasjs(
  target: Target,
  sasjs?: SASjs,
  streamConfig?: StreamConfig
) {
  const { buildDestinationFolder } = process.sasjsConstants
  const finalFilePathJSON = path.join(
    buildDestinationFolder,
    `${target.name}.json`
  )
  const jsonContent = await readFile(finalFilePathJSON)
  const payload: ServicePackSASjs = JSON.parse(jsonContent)

  let authConfig
  if (!sasjs) {
    sasjs = new SASjs({
      serverUrl: target.serverUrl,
      appLoc: target.appLoc,
      serverType: target.serverType,
      httpsAgentOptions: target.httpsAgentOptions,
      debug: true
    })

    try {
      authConfig = await getAuthConfig(target)
    } catch (e) {}
  }

  const result = await sasjs
    .deployToSASjs(payload, undefined, authConfig)
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

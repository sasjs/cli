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
  getAbsolutePath
} from '@sasjs/utils'
import { isSasFile, isShellScript } from '../../utils/file'
import { getDeployScripts } from './internal/getDeployScripts'
import { deployToSasViyaWithServicePack } from '../shared/deployToSasViyaWithServicePack'
import { ServicePack } from '../../types'

export async function deploy(target: Target, isLocal: boolean) {
  if (
    target.serverType === ServerType.SasViya &&
    target.deployConfig?.deployServicePack
  ) {
    const appLoc = target.appLoc.replace(/\ /g, '%20')
    process.logger?.info(
      `Deploying service pack to ${target.serverUrl} at location ${appLoc} .`
    )

    const { buildDestinationFolder } = process.sasjsConstants
    const finalFilePathJSON = path.join(
      buildDestinationFolder,
      `${target.name}.json`
    )

    const jsonObject: ServicePack = await deployToSasViyaWithServicePack(
      finalFilePathJSON,
      target,
      isLocal,
      true
    )

    const webIndexFileName: string =
      jsonObject?.members
        .find(
          (member: any) =>
            member?.name === 'services' && member?.type === 'folder'
        )
        ?.members?.find((member: any) => member?.type === 'file')?.name ?? ''

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
  await asyncForEach(deployScripts, async (deployScript) => {
    const deployScriptPath = getAbsolutePath(deployScript, process.projectDir)

    if (isSasFile(deployScript)) {
      process.logger?.info(
        `Processing SAS file ${path.basename(deployScript)} ...`
      )
      // get content of file
      const deployScriptFile = await readFile(deployScriptPath)
      // split into lines
      const linesToExecute = deployScriptFile.replace(/\r\n/g, '\n').split('\n')

      const streamConfig = await getStreamConfig(target)

      if (target.serverType === ServerType.SasViya) {
        await deployToSasViya(
          deployScript,
          target,
          isLocal,
          linesToExecute,
          logFilePath,
          streamConfig
        )
      } else {
        await deployToSas9(
          deployScript,
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

async function getSASjsAndAuthConfig(target: Target, isLocal: boolean) {
  const sasjs = new SASjs({
    serverUrl: target.serverUrl,
    appLoc: target.appLoc,
    serverType: target.serverType,
    allowInsecureRequests: target.allowInsecureRequests,
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

async function deployToSasViya(
  deployScript: string,
  target: Target,
  isLocal: boolean,
  linesToExecute: string[],
  logFilePath: string | null,
  streamConfig?: StreamConfig
) {
  process.logger?.info(
    `Sending ${path.basename(deployScript)} to SAS server for execution.`
  )

  const contextName = target.contextName

  if (!contextName) {
    throw new Error(
      'Compute Context Name is required for SAS Viya deployments.\n Please ensure that `contextName` is present in your build target configuration or in your .env file, and try again.\n'
    )
  }

  const { sasjs, authConfig } = await getSASjsAndAuthConfig(target, isLocal)

  const executionResult = await sasjs.executeScriptSASViya(
    path.basename(deployScript),
    linesToExecute,
    contextName,
    authConfig
  )

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

  if (logFilePath) {
    await createFile(
      path.join(
        logFilePath,
        `${path.basename(deployScript).replace('.sas', '')}.log`
      ),
      log
    )
    process.logger?.success(
      `Deployment completed! Log is available at ${path.join(
        logFilePath,
        `${path.basename(deployScript).replace('.sas', '')}.log`
      )}`
    )

    if (streamConfig?.streamWeb) {
      const appLoc = target.appLoc.replace(/\ /g, '%20')
      const webAppStreamUrl = `${target.serverUrl}/SASJobExecution?_FILE=${appLoc}/services/${streamConfig.streamServiceName}.html&_debug=2`
      process.logger?.info(`Web app is available at ${webAppStreamUrl}`)
    }
  } else {
    process.logger?.error('Unable to create log file.')
  }
}

async function deployToSas9(
  deployScript: string,
  target: Target,
  linesToExecute: string[],
  logFilePath: string | null,
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
    allowInsecureRequests: target.allowInsecureRequests,
    appLoc: target.appLoc,
    serverType: target.serverType
  })
  const executionResult = await sasjs
    .executeScriptSAS9(linesToExecute, username, password)
    .catch((err) => {
      process.logger.log(formatErrorString(err))
      if (err && err.errorCode === 404) {
        displaySasjsRunnerError(username)
      }
    })

  if (!executionResult) {
    process.logger?.error('Error getting execution log')
  } else if (logFilePath) {
    await createFile(
      path.join(
        logFilePath,
        `${path.basename(deployScript).replace('.sas', '')}.log`
      ),
      executionResult ?? ''
    )
    process.logger?.success(
      `Deployment completed! Log is available at ${path.join(
        logFilePath,
        `${path.basename(deployScript).replace('.sas', '')}.log`
      )}`
    )
    if (streamConfig?.streamWeb) {
      const appLoc = target.appLoc.replace(/\ /g, '%20')
      const webAppStreamUrl = `${target.serverUrl}/SASStoredProcess/?_PROGRAM=${appLoc}/services/${streamConfig.streamServiceName}`
      process.logger?.info(`Web app is available at ${webAppStreamUrl}`)
    }
  } else {
    process.logger?.error('Unable to create log file.')
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

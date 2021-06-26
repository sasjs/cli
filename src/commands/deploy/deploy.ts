import path from 'path'
import os from 'os'
import SASjs from '@sasjs/adapter/node'
import { getAccessToken } from '../../utils/config'
import { displaySasjsRunnerError, executeShellScript } from '../../utils/utils'
import {
  readFile,
  readFileBinary,
  createFile,
  ServerType,
  Target,
  asyncForEach
} from '@sasjs/utils'
import { isSasFile, isShellScript } from '../../utils/file'
import { getConstants } from '../../constants'
import { getDeployScripts } from './internal/getDeployScripts'

export async function deploy(target: Target, isLocal: boolean) {
  if (
    target.serverType === ServerType.SasViya &&
    target.deployConfig?.deployServicePack
  ) {
    process.logger?.info(
      `Deploying service pack to ${target.serverUrl} at location ${target.appLoc} .`
    )
    const webIndexFileName = await deployToSasViyaWithServicePack(
      target,
      isLocal
    )
    process.logger?.success('Build pack has been successfully deployed.')
    process.logger?.success(
      target.serverType === ServerType.SasViya && webIndexFileName
        ? `${target.serverUrl}/SASJobExecution?_file=${target.appLoc}/services/${webIndexFileName}&_debug=2`
        : `${target.serverUrl}/SASJobExecution?_folder=${target.appLoc}`
    )
  }

  const deployScripts = await getDeployScripts(target)

  if (deployScripts.length === 0 && !target.deployConfig?.deployServicePack) {
    throw new Error(
      `Deployment failed.\nPlease either enable the 'deployServicePack' option or add deployment script paths to 'deployScripts' in your target's 'deployConfig'.`
    )
  }

  const { buildDestinationFolder } = await getConstants()

  const logFilePath = buildDestinationFolder
  await asyncForEach(deployScripts, async (deployScript) => {
    const deployScriptPath = path.isAbsolute(deployScript)
      ? deployScript
      : path.join(process.projectDir, deployScript)

    if (isSasFile(deployScript)) {
      process.logger?.info(
        `Processing SAS file ${path.basename(deployScript)} ...`
      )
      // get content of file
      const deployScriptFile = await readFile(deployScriptPath)
      // split into lines
      const linesToExecute = deployScriptFile.replace(/\r\n/g, '\n').split('\n')
      if (target.serverType === ServerType.SasViya) {
        await deployToSasViya(
          deployScript,
          target,
          isLocal,
          linesToExecute,
          logFilePath
        )
      } else {
        await deployToSas9(deployScript, target, linesToExecute, logFilePath)
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

async function getSASjsAndAccessToken(target: Target, isLocal: boolean) {
  const sasjs = new SASjs({
    serverUrl: target.serverUrl,
    appLoc: target.appLoc,
    serverType: target.serverType,
    allowInsecureRequests: target.allowInsecureRequests,
    debug: true
  })

  let accessToken = null
  try {
    accessToken = await getAccessToken(target)
  } catch (e) {
    throw new Error(
      `Deployment failed. Request is not authenticated.\nPlease add the following variables to your .env${
        isLocal ? `.${target.name}` : ''
      } file:\nCLIENT, SECRET, ACCESS_TOKEN, REFRESH_TOKEN`
    )
  }
  return {
    sasjs,
    accessToken
  }
}

async function populateCodeInServicePack(json: any) {
  await asyncForEach(json.members, async (member) => {
    if (member.type === 'file') member.code = await readFileBinary(member.path)
    if (member.type === 'folder') await populateCodeInServicePack(member)
  })
}

async function deployToSasViyaWithServicePack(
  target: Target,
  isLocal: boolean
): Promise<string> {
  const { buildDestinationFolder } = await getConstants()
  const finalFilePathJSON = path.join(
    buildDestinationFolder,
    `${target.name}.json`
  )
  const jsonContent = await readFile(finalFilePathJSON)
  const jsonObject = JSON.parse(jsonContent)

  await populateCodeInServicePack(jsonObject)

  const { sasjs, accessToken } = await getSASjsAndAccessToken(target, isLocal)

  await sasjs.deployServicePack(
    jsonObject,
    undefined,
    undefined,
    accessToken,
    true
  )

  const webIndexFileName = jsonObject?.members
    .find(
      (member: any) => member?.name === 'services' && member?.type === 'folder'
    )
    ?.members?.find((member: any) => member?.type === 'file')?.name

  return webIndexFileName ?? ''
}

async function deployToSasViya(
  deployScript: string,
  target: Target,
  isLocal: boolean,
  linesToExecute: string[],
  logFilePath: string | null
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

  const { sasjs, accessToken } = await getSASjsAndAccessToken(target, isLocal)

  const executionResult = await sasjs.executeScriptSASViya(
    path.basename(deployScript),
    linesToExecute,
    contextName,
    accessToken
  )

  let log
  try {
    log = executionResult.log.items
      ? executionResult.log.items
          .map((i: { line: string }) => i.line)
          .join(os.EOL)
      : JSON.stringify(executionResult.log).replace(/\\n/g, os.EOL)
  } catch (e) {
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

    if (!!target.streamConfig?.streamWeb) {
      const webAppStreamUrl = `${target.serverUrl}/SASJobExecution?_FILE=${target.appLoc}/services/${target.streamConfig.streamServiceName}.html&_debug=2`
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
  logFilePath: string | null
) {
  const username = process.env.SAS_USERNAME
  const password = process.env.SAS_PASSWORD
  if (!username || !password) {
    throw new Error(
      'A valid username and password are required for requests to SAS9 servers.' +
        '\nPlease set the SAS_USERNAME and SAS_PASSWORD variables in your target-specific or project-level .env file.'
    )
  }

  const sasjs = new SASjs({
    serverUrl: target.serverUrl,
    allowInsecureRequests: target.allowInsecureRequests,
    appLoc: target.appLoc,
    serverType: target.serverType
  })
  const executionResult = await sasjs
    .executeScriptSAS9(linesToExecute, username, password)
    .catch((err) => {
      if (err && err.errorCode === 404) {
        displaySasjsRunnerError(username)
      }
    })

  let parsedLog
  try {
    parsedLog = JSON.parse(executionResult || '{}').payload.log
  } catch (e) {
    process.logger?.error('Error parsing execution log', e)
    parsedLog = executionResult
  }
  if (logFilePath) {
    await createFile(
      path.join(
        logFilePath,
        `${path.basename(deployScript).replace('.sas', '')}.log`
      ),
      parsedLog
    )
    process.logger?.success(
      `Deployment completed! Log is available at ${path.join(
        logFilePath,
        `${path.basename(deployScript).replace('.sas', '')}.log`
      )}`
    )
    if (!!target.streamConfig?.streamWeb) {
      const webAppStreamUrl = `${target.serverUrl}/SASStoredProcess/?_PROGRAM=${target.appLoc}/services/${target.streamConfig.streamServiceName}`
      process.logger?.info(`Web app is available at ${webAppStreamUrl}`)
    }
  } else {
    process.logger?.error('Unable to create log file.')
  }
}

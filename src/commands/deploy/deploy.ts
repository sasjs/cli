import path from 'path'
import SASjs from '@sasjs/adapter/node'
import {
  getAccessToken,
  findTargetInConfiguration,
  getConfiguration
} from '../../utils/config'
import { asyncForEach, executeShellScript } from '../../utils/utils'
import {
  isSasFile,
  isShellScript,
  readFile,
  createFile
} from '../../utils/file'
import { ServerType, Target } from '@sasjs/utils'
import { getConstants } from '../../constants'

export async function deploy(targetName: string) {
  const { target } = await findTargetInConfiguration(targetName)

  if (
    target.serverType === ServerType.SasViya &&
    target.deployConfig?.deployServicePack
  ) {
    process.logger?.info(
      `Deploying service pack to ${target.serverUrl} at location ${target.appLoc}.`
    )
    await deployToSasViyaWithServicePack(target)
    process.logger?.success('Service pack has been successfully deployed.')
  }

  const deployScripts = await getDeployScripts(target)

  if (deployScripts.length === 0 && !target.deployConfig?.deployServicePack) {
    throw new Error(
      `Deployment failed.\nPlease either enable the 'deployServicePack' option or add deployment script paths to 'deployScripts' in your target's 'deployConfig'.`
    )
  }

  const { buildDestinationFolder } = getConstants()

  const logFilePath = buildDestinationFolder
  await asyncForEach(deployScripts, async (deployScript) => {
    if (isSasFile(deployScript)) {
      process.logger?.info(
        `Processing SAS file ${path.basename(deployScript)}...`
      )
      // get content of file
      const deployScriptFile = await readFile(
        path.join(process.projectDir, deployScript)
      )
      // split into lines
      const linesToExecute = deployScriptFile.replace(/\r\n/g, '\n').split('\n')
      if (target.serverType === ServerType.SasViya) {
        await deployToSasViya(deployScript, target, linesToExecute, logFilePath)
      } else {
        await deployToSas9(deployScript, target, linesToExecute, logFilePath)
      }
    } else if (isShellScript(deployScript)) {
      process.logger?.info(
        `Executing shell script ${path.basename(deployScript)}...`
      )

      await executeShellScript(
        deployScript,
        path.join(
          process.projectDir,
          'sasjsbuild',
          `${path.basename(deployScript).replace('.sh', '')}.log`
        )
      )
      process.logger?.success(
        `Shell script execution completed! Log is available at ${path.join(
          'sasjsbuild',
          `${path.basename(deployScript).replace('.sh', '')}.log`
        )}`
      )
    }
  })
}

async function getDeployScripts(target: Target) {
  const { buildSourceFolder } = getConstants()
  const configuration = await getConfiguration(
    path.join(buildSourceFolder, 'sasjsconfig.json')
  )

  let allDeployScripts: string[] = [
    ...(configuration?.deployConfig?.deployScripts || [])
  ]

  allDeployScripts = [
    ...allDeployScripts,
    ...(target.deployConfig?.deployScripts || [])
  ]

  allDeployScripts = allDeployScripts.filter((d) => !!d)
  return [...new Set(allDeployScripts)]
}

async function getSASjsAndAccessToken(target: Target) {
  const sasjs = new SASjs({
    serverUrl: target.serverUrl,
    appLoc: target.appLoc,
    serverType: target.serverType
  })

  let accessToken = null
  try {
    accessToken = await getAccessToken(target)
  } catch (e) {
    throw new Error(
      `Deployment failed. Request is not authenticated.\nPlease add the following variables to your .env file:\nCLIENT, SECRET, ACCESS_TOKEN, REFRESH_TOKEN`
    )
  }
  return {
    sasjs,
    accessToken
  }
}

async function deployToSasViyaWithServicePack(target: Target) {
  const { buildDestinationFolder } = getConstants()
  const finalFilePathJSON = path.join(
    buildDestinationFolder,
    `${target.name}.json`
  )
  const jsonContent = await readFile(finalFilePathJSON)
  const jsonObject = JSON.parse(jsonContent)

  const { sasjs, accessToken } = await getSASjsAndAccessToken(target)

  return await sasjs.deployServicePack(
    jsonObject,
    undefined,
    undefined,
    accessToken,
    true
  )
}

async function deployToSasViya(
  deployScript: string,
  target: Target,
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

  const { sasjs, accessToken } = await getSASjsAndAccessToken(target)

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
          .join('\n')
      : JSON.stringify(executionResult.log)
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
    console.log(
      `Job execution completed! Log is available at ${path.join(
        logFilePath,
        `${path.basename(deployScript).replace('.sas', '')}.log`
      )}`
    )
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
  const serverName = target.serverName || process.env.serverName
  const repositoryName = target.repositoryName || process.env.repositoryName
  if (!serverName) {
    throw new Error(
      'SAS Server Name is required for SAS9 deployments.\n Please ensure that `serverName` is present in your build target configuration and try again.\n'
    )
  }
  if (!repositoryName) {
    throw new Error(
      'SAS Repository Name is required for SAS9 deployments.\n Please ensure that `repositoryName` is present in your build target configuration and try again.\n'
    )
  }
  const sasjs = new SASjs({
    serverUrl: target.serverUrl,
    appLoc: target.appLoc,
    serverType: target.serverType
  })
  const executionResult = await sasjs.executeScriptSAS9(
    linesToExecute,
    serverName,
    repositoryName
  )

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
      `Job execution completed! Log is available at ${path.join(
        logFilePath,
        `${path.basename(deployScript).replace('.sas', '')}.log`
      )}`
    )
  } else {
    process.logger?.error('Unable to create log file.')
  }
}

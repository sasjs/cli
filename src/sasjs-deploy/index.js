import path from 'path'
import SASjs from '@sasjs/adapter/node'
import chalk from 'chalk'
import { findTargetInConfiguration } from '../utils/config-utils'
import { asyncForEach, executeShellScript, getVariable } from '../utils/utils'
import {
  isSasFile,
  isShellScript,
  readFile,
  folderExists,
  createFile
} from '../utils/file-utils'
import {
  getAccessToken,
  isAccessTokenExpiring,
  refreshTokens
} from '../utils/auth-utils'

let targetToBuild = null
let executionSession

export async function deploy(
  targetName = null,
  preTargetToBuild = null,
  isForced = false
) {
  if (preTargetToBuild) targetToBuild = preTargetToBuild
  else targetToBuild = await findTargetInConfiguration(targetName)

  if (targetToBuild.serverType === 'SASVIYA' && !targetToBuild.authInfo) {
    console.log(
      chalk.redBright.bold(
        `Deployment failed. Request is not authenticated.\nRun 'sasjs add' command and provide 'client' and 'secret'.`
      )
    )

    return
  }

  if (
    targetToBuild.serverType === 'SASVIYA' &&
    targetToBuild.deployServicePack
  ) {
    console.log(
      chalk.cyanBright(`Executing deployServicePack to update SAS server.`)
    )

    await deployToSasViyaWithServicePack(targetToBuild, isForced)

    console.log('Job execution completed!')
  }

  const deployScripts = getDeployScripts()

  if (deployScripts.length === 0 && !targetToBuild.deployServicePack) {
    console.log(
      chalk.redBright.bold(
        `Deployment failed. Enable 'deployServicePack' option or add deployment script to 'tgtDeployScripts'.`
      )
    )

    return
  }

  const pathExistsInCurrentFolder = await folderExists(
    path.join(process.cwd(), 'sasjsbuild')
  )
  const pathExistsInParentFolder = await folderExists(
    path.join(process.cwd(), '..', 'sasjsbuild')
  )
  const logFilePath = pathExistsInCurrentFolder
    ? path.join(process.cwd(), 'sasjsbuild')
    : pathExistsInParentFolder
    ? path.join(process.cwd(), '..', 'sasjsbuild')
    : null
  await asyncForEach(deployScripts, async (deployScript) => {
    if (isSasFile(deployScript)) {
      console.log(
        chalk.cyanBright(
          `Processing SAS file ${chalk.greenBright.italic(
            path.basename(deployScript)
          )}...`
        )
      )
      // get content of file
      const deployScriptFile = await readFile(
        path.join(process.cwd(), deployScript)
      )
      // split into lines
      const linesToExecute = deployScriptFile.replace(/\r\n/g, '\n').split('\n')
      if (targetToBuild.serverType === 'SASVIYA') {
        await deployToSasViya(
          deployScript,
          targetToBuild,
          linesToExecute,
          logFilePath
        )
      } else {
        await deployToSas9(
          deployScript,
          targetToBuild,
          linesToExecute,
          logFilePath
        )
      }
    } else if (isShellScript(deployScript)) {
      console.log(
        chalk.cyanBright(
          `Executing shell script ${chalk.greenBright.italic(
            path.basename(deployScript)
          )}...`
        )
      )
      await executeShellScript(
        deployScript,
        path.join(
          process.cwd(),
          'sasjsbuild',
          `${path.basename(deployScript).replace('.sh', '')}.log`
        )
      )
      console.log(
        `Shell script execution completed! Log is available at ${path.join(
          'sasjsbuild',
          `${path.basename(deployScript).replace('.sh', '')}.log`
        )}`
      )
    }
  })
  executionSession = null
}

function getDeployScripts() {
  return targetToBuild && targetToBuild.tgtDeployScripts
    ? targetToBuild.tgtDeployScripts
    : []
}

async function getSASjsAndAccessToken(buildTarget) {
  const sasjs = new SASjs({
    serverUrl: buildTarget.serverUrl,
    appLoc: buildTarget.appLoc,
    serverType: buildTarget.serverType
  })

  const accessToken = await getToken(buildTarget, sasjs)
  return {
    sasjs,
    accessToken
  }
}

async function deployToSasViyaWithServicePack(buildTarget, isForced) {
  const sasjs = new SASjs({
    serverUrl: buildTarget.serverUrl,
    appLoc: buildTarget.appLoc,
    serverType: buildTarget.serverType
  })

  const CONSTANTS = require('../constants')
  const buildDestinationFolder = CONSTANTS.buildDestinationFolder
  const finalFilePathJSON = path.join(
    buildDestinationFolder,
    `${targetToBuild.name}.json`
  )
  const jsonContent = await readFile(finalFilePathJSON)
  const jsonObject = JSON.parse(jsonContent)

  if (buildTarget.authInfo) {
    let { access_token } = buildTarget.authInfo
    const { refresh_token } = buildTarget.authInfo
    const isTokenExpiring = isAccessTokenExpiring(access_token)

    if (isTokenExpiring) {
      const { client, secret } = buildTarget.tgtDeployVars
      const newAuthResponse = await refreshTokens(
        sasjs,
        client,
        secret,
        refresh_token
      )

      access_token = newAuthResponse.access_token
    }

    return await sasjs.deployServicePack(
      jsonObject,
      null,
      null,
      access_token,
      isForced
    )
  }

  return await sasjs.deployServicePack(jsonObject, null, null, null, isForced)
}

async function deployToSasViya(
  deployScript,
  buildTarget,
  linesToExecute,
  logFilePath
) {
  console.log(
    chalk.cyanBright(
      `Sending ${path.basename(deployScript)} to SAS server for execution.`
    )
  )

  const contextName = await getVariable('contextName', buildTarget)

  if (!contextName) {
    throw new Error(
      'Compute Context Name is required for SAS Viya deployments.\n Please ensure that `contextName` is present in your build target configuration or in your .env file, and try again.\n'
    )
  }

  const { sasjs, accessToken } = await getSASjsAndAccessToken(buildTarget)

  if (!executionSession) {
    executionSession = await sasjs
      .createSession(contextName, accessToken)
      .catch((e) => {
        console.log(chalk.redBright.bold('Error creating execution session'))
        throw e
      })
  }

  const executionResult = await sasjs.executeScriptSASViya(
    path.basename(deployScript),
    linesToExecute,
    contextName,
    accessToken,
    executionSession.id
  )

  let log
  try {
    log = executionResult.log.items
      ? executionResult.log.items.map((i) => i.line).join('\n')
      : JSON.stringify(executionResult.log)
  } catch (e) {
    console.log(
      chalk.redBright(
        `An error occurred when parsing the execution response: ${chalk.redBright.bold(
          e.message
        )}`
      )
    )
    console.log(
      chalk.redBright(
        `Please check your ${chalk.cyanBright('tgtDeployVars')} and try again.`
      )
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
    console.error(chalk.redBright('Unable to create log file.'))
  }
}

async function deployToSas9(
  deployScript,
  buildTarget,
  linesToExecute,
  logFilePath
) {
  if (!buildTarget.tgtDeployVars) {
    throw new Error(
      'Deployment config not found!\n Please ensure that your build target has a `tgtDeployVars` property that specifies `serverName` and `repositoryName`.\n'
    )
  }
  const serverName =
    buildTarget.tgtDeployVars.serverName || process.env.serverName
  const repositoryName =
    buildTarget.tgtDeployVars.repositoryName || process.env.repositoryName
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
    serverUrl: buildTarget.serverUrl,
    appLoc: buildTarget.appLoc,
    serverType: buildTarget.serverType
  })
  const executionResult = await sasjs.executeScriptSAS9(
    linesToExecute,
    serverName,
    repositoryName
  )

  let parsedLog
  try {
    parsedLog = JSON.parse(executionResult).payload.log
  } catch (e) {
    console.error(chalk.redBright(e))
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
    console.log(
      `Job execution completed! Log is available at ${path.join(
        logFilePath,
        `${path.basename(deployScript).replace('.sas', '')}.log`
      )}`
    )
  } else {
    console.error(chalk.redBright('Unable to create log file.'))
  }
}

async function getToken(buildTarget, sasjsInstance) {
  const clientId = await getVariable('client', buildTarget)
  const clientSecret = await getVariable('secret', buildTarget)
  if (!clientId) {
    throw new Error(
      'A client ID is required for SAS Viya deployments.\n Please ensure that `client` is present in your build target configuration or in your .env file, and try again.\n'
    )
  }
  if (!clientSecret) {
    throw new Error(
      'A client secret is required for SAS Viya deployments.\n Please ensure that `secret` is present in your build target configuration or in your .env file, and try again.\n'
    )
  }

  const accessToken = await getAccessToken(
    sasjsInstance,
    clientId,
    clientSecret,
    buildTarget,
    true
  )
  return accessToken
}

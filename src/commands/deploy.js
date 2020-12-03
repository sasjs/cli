import path from 'path'
import SASjs from '@sasjs/adapter/node'
import chalk from 'chalk'
import {
  getAccessToken,
  findTargetInConfiguration
} from '../utils/config-utils'
import { asyncForEach, executeShellScript, getVariable } from '../utils/utils'
import {
  isSasFile,
  isShellScript,
  readFile,
  folderExists,
  createFile
} from '../utils/file-utils'
import { isAccessTokenExpiring, refreshTokens } from '../utils/auth-utils'

let targetToBuild = null
let executionSession

export async function deploy(targetName = null, preTargetToBuild = null) {
  if (preTargetToBuild) targetToBuild = preTargetToBuild
  else {
    const { target } = await findTargetInConfiguration(targetName)
    targetToBuild = target
  }

  if (
    targetToBuild.serverType === 'SASVIYA' &&
    targetToBuild.deployServicePack
  ) {
    console.log(
      chalk.cyanBright(`Executing deployServicePack to update SAS server.`)
    )

    await deployToSasViyaWithServicePack(targetToBuild)

    console.log('Job execution completed!')
  }

  const deployScripts = getDeployScripts()

  if (deployScripts.length === 0 && !targetToBuild.deployServicePack) {
    throw new Error(
      `Deployment failed. Enable 'deployServicePack' option or add deployment script to 'tgtDeployScripts'.`
    )
  }

  const pathExistsInCurrentFolder = await folderExists(
    path.join(process.projectDir, 'sasjsbuild')
  )
  const pathExistsInParentFolder = await folderExists(
    path.join(process.projectDir, '..', 'sasjsbuild')
  )
  const logFilePath = pathExistsInCurrentFolder
    ? path.join(process.projectDir, 'sasjsbuild')
    : pathExistsInParentFolder
    ? path.join(process.projectDir, '..', 'sasjsbuild')
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
        path.join(process.projectDir, deployScript)
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
          process.projectDir,
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

  let accessToken = null
  try {
    accessToken = await getAccessToken(buildTarget)
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

async function deployToSasViyaWithServicePack(buildTarget) {
  const sasjs = new SASjs({
    serverUrl: buildTarget.serverUrl,
    appLoc: buildTarget.appLoc,
    serverType: buildTarget.serverType
  })

  const CONSTANTS = require('../constants').get()
  const buildDestinationFolder = CONSTANTS.buildDestinationFolder
  const finalFilePathJSON = path.join(
    buildDestinationFolder,
    `${targetToBuild.name}.json`
  )
  const jsonContent = await readFile(finalFilePathJSON)
  const jsonObject = JSON.parse(jsonContent)

  let accessToken = null
  try {
    accessToken = await getAccessToken(buildTarget)
  } catch (e) {
    throw new Error(
      `Deployment failed. Request is not authenticated.\nPlease add the following variables to your .env file:\nCLIENT, SECRET, ACCESS_TOKEN, REFRESH_TOKEN`
    )
  }

  return await sasjs.deployServicePack(
    jsonObject,
    null,
    null,
    accessToken,
    true
  )
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

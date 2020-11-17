import chalk from 'chalk'
import path from 'path'
import SASjs from '@sasjs/adapter/node'
import {
  findTargetInConfiguration,
  getAccessToken
} from '../utils/config-utils'
import { readFile, createFile } from '../utils/file-utils'
import { getVariable, generateTimestamp } from '../utils/utils'
import { Command } from '../utils/command'

/**
 * Runs SAS code from a given file on the specified target.
 * @param {string} filePath - the path to the file containing SAS code.
 * @param {string} targetName - the name of the target to run the SAS code on.
 */
export async function runSasCode(commandLine) {
  const command = new Command(commandLine)
  const filePath = command.values.shift()
  const targetName = command.getFlagValue('target')

  if (!/\.sas$/i.test(filePath)) {
    throw new Error(`'sasjs run' command supports only *.sas files.`)
  }

  const { target } = await findTargetInConfiguration(targetName)
  if (!target) {
    throw new Error('Target not found! Please try again with another target.')
  }
  const sasFile = await readFile(path.join(process.cwd(), filePath))
  const linesToExecute = sasFile.replace(/\r\n/g, '\n').split('\n')
  if (target.serverType === 'SASVIYA') {
    await executeOnSasViya(filePath, target, linesToExecute)
  } else {
    await executeOnSas9(target, linesToExecute)
  }
}

async function executeOnSasViya(filePath, buildTarget, linesToExecute) {
  console.log(
    chalk.cyanBright(
      `Sending ${path.basename(filePath)} to SAS server for execution.`
    )
  )

  const sasjs = new SASjs({
    serverUrl: buildTarget.serverUrl,
    appLoc: buildTarget.appLoc,
    serverType: buildTarget.serverType,
    debug: true
  })
  const contextName = await getVariable('contextName', buildTarget)

  if (!contextName) {
    throw new Error(
      'Compute Context Name is required for SAS Viya deployments.\n Please ensure that `contextName` is present in your build target configuration or in your .env file, and try again.\n'
    )
  }

  const accessToken = await getAccessToken(buildTarget)

  const executionSession = await sasjs
    .createSession(contextName, accessToken)
    .catch((e) => {
      console.log(chalk.redBright.bold('Error creating execution session'))
      throw e
    })

  const executionResult = await sasjs.executeScriptSASViya(
    path.basename(filePath),
    linesToExecute,
    contextName,
    accessToken,
    executionSession.id
  )
  
  let log
  try {
    log = executionResult.log.items
      ? executionResult.log.items.map((i) => i.line)
      : executionResult.log
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
    log = JSON.stringify(executionResult)
  }

  console.log(chalk.greenBright('Job execution completed!'))

  await createOutputFile(log)
}

async function executeOnSas9(buildTarget, linesToExecute) {
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
    serverType: buildTarget.serverType,
    debug: true
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

  console.log(chalk.greenBright('Job execution completed!'))

  await createOutputFile(JSON.stringify(parsedLog, null, 2))
}

async function createOutputFile(log) {
  const timestamp = generateTimestamp()
  const outputFilePath = path.join(process.cwd(), `sasjs-run-${timestamp}.log`)

  await createFile(outputFilePath, log)

  console.log(
    chalk.whiteBright(`Log is available in ${chalk.cyanBright(outputFilePath)}`)
  )
}

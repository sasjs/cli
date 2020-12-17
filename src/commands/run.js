import chalk from 'chalk'
import path from 'path'
import SASjs from '@sasjs/adapter/node'
import { ErrorResponse } from '@sasjs/adapter/node'
import {
  findTargetInConfiguration,
  getAccessToken
} from '../utils/config-utils'
import { readFile, createFile } from '../utils/file'
import { generateTimestamp } from '../utils/utils'
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
    return await executeOnSasViya(filePath, target, linesToExecute)
  } else {
    return await executeOnSas9(target, linesToExecute)
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

  let contextName = buildTarget.contextName

  if (!contextName) {
    contextName = sasjs.getSasjsConfig().contextName
  }

  const accessToken = await getAccessToken(buildTarget)

  const executionSession = await sasjs
    .createSession(contextName, accessToken)
    .catch((e) => {
      console.log(chalk.redBright.bold('Error creating execution session'))
      console.log(
        chalk.redBright.bold(
          ` Url: ${buildTarget.serverUrl}\n App loc: ${buildTarget.appLoc}\n Context: ${contextName}`
        )
      )

      throw e
    })

  const executionResult = await sasjs
    .executeScriptSASViya(
      path.basename(filePath),
      linesToExecute,
      contextName,
      accessToken
    )
    .catch(async (err) => {
      let log = err.log

      if (!log)
        throw new ErrorResponse('We werent able to fetch the log this time.')

      await createOutputFile(log)

      throw new ErrorResponse('Find more error details in the log file.')
    })

  let log
  let isOutput = false

  try {
    log = executionResult.log.items
      ? executionResult.log.items.map((i) => i.line)
      : executionResult.log
  } catch (e) {
    console.log(
      chalk.redBright(
        `An error occurred when parsing the execution log: ${chalk.redBright.bold(
          e.message
        )}`
      )
    )

    console.log(chalk.redBright(`So we put execution output in the log file.`))

    log = JSON.stringify(executionResult)

    isOutput = true
  }

  console.log(chalk.greenBright('Job execution completed!'))

  await createOutputFile(log, isOutput)

  return { log }
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
  const executionResult = await sasjs
    .executeScriptSAS9(linesToExecute, serverName, repositoryName)
    .catch(async (err) => {
      if (err && err.payload && err.payload.log) {
        let log = err.payload.log

        await createOutputFile(log)

        throw new ErrorResponse('Find more error details in the log file.')
      } else {
        throw err
      }
    })

  let parsedLog
  try {
    parsedLog = JSON.parse(executionResult).payload.log
  } catch (e) {
    console.error(chalk.redBright(e))
    parsedLog = executionResult
  }

  console.log(chalk.greenBright('Job execution completed!'))

  await createOutputFile(JSON.stringify(parsedLog, null, 2))

  return { parsedLog }
}

async function createOutputFile(log, isOutput = false) {
  const timestamp = generateTimestamp()
  const outputFilePath = path.join(process.cwd(), `sasjs-run-${timestamp}.log`)

  await createFile(outputFilePath, log)

  console.log(
    chalk.whiteBright(
      `${isOutput ? 'Output' : 'Log'} is available in ${chalk.cyanBright(
        outputFilePath
      )}`
    )
  )
}

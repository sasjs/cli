import path from 'path'
import SASjs from '@sasjs/adapter/node'
import { ErrorResponse } from '@sasjs/adapter/node'
import { findTargetInConfiguration, getAccessToken } from '../../utils/config'
import { readFile, createFile } from '../../utils/file'
import { generateTimestamp } from '../../utils/utils'
import { Command } from '../../utils/command'
import { Target } from '@sasjs/utils'
import { displayError } from '../../utils/displayResult'
import { getConstants } from '../../constants'
import { compileSingleFile } from '../'

/**
 * Runs SAS code from a given file on the specified target.
 * @param {string} filePath - the path to the file containing SAS code.
 * @param {string} targetName - the name of the target to run the SAS code on.
 */
export async function runSasCode(command: Command) {
  let filePath = command.values.shift() || ''
  const targetName = command.getFlagValue('target') as string
  const compile = !!command.getFlag('compile')

  if (!/\.sas$/i.test(filePath)) {
    throw new Error(`'sasjs run' command supports only *.sas files.`)
  }

  const { target } = await findTargetInConfiguration(targetName)
  if (!target) {
    throw new Error('Target not found! Please try again with another target.')
  }

  if (compile) {
    ;({ destinationPath: filePath } = await compileSingleFile(
      target,
      new Command(`compile -s ${filePath}`),
      'identify',
      true
    ))
    process.logger?.success(`File Compiled and placed at: ${filePath} .`)
  }
  const sasFile = await readFile(
    path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath)
  )
  const linesToExecute = sasFile.replace(/\r\n/g, '\n').split('\n')
  if (target.serverType === 'SASVIYA') {
    return await executeOnSasViya(filePath, target, linesToExecute)
  } else {
    return await executeOnSas9(target, linesToExecute)
  }
}

async function executeOnSasViya(
  filePath: string,
  target: Target,
  linesToExecute: string[]
) {
  process.logger?.info(
    `Sending ${path.basename(filePath)} to SAS server for execution.`
  )

  const sasjs = new SASjs({
    serverUrl: target.serverUrl,
    appLoc: target.appLoc,
    serverType: target.serverType,
    debug: true
  })

  let contextName = target.contextName

  if (!contextName) {
    contextName = sasjs.getSasjsConfig().contextName
  }

  const accessToken = await getAccessToken(target)

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
        throw new ErrorResponse('We were not able to fetch the log this time.')

      const createdFilePath = await createOutputFile(log)
      process.logger?.error(`Log file has been created at ${createdFilePath} .`)

      throw new ErrorResponse('Find more error details in the log file.')
    })

  let log
  let isOutput = false

  try {
    log = executionResult.log.items
      ? executionResult.log.items.map((i: { line: string }) => i.line)
      : executionResult.log
  } catch (e) {
    displayError(e, 'An error occurred when parsing the execution log')
    process.logger?.info('The execution output will be saved to the log file.')

    log = JSON.stringify(executionResult)

    isOutput = true
  }

  process.logger?.success('Job execution completed!')

  const { buildResultsLogsFolder } = await getConstants()
  process.logger?.info(
    `Creating ${
      isOutput ? 'output' : 'log'
    } file in ${buildResultsLogsFolder} .`
  )
  const createdFilePath = await createOutputFile(log)
  process.logger?.success(
    `${
      isOutput ? 'Output' : 'Log'
    } file has been created at ${createdFilePath} .`
  )

  return { log }
}

async function executeOnSas9(target: Target, linesToExecute: string[]) {
  const serverName = target.serverName || process.env.serverName
  if (!serverName) {
    throw new Error(
      'SAS Server Name is required for SAS9 deployments.\n Please ensure that `serverName` is present in your build target configuration and try again.\n'
    )
  }

  const repositoryName = target.repositoryName || process.env.repositoryName
  if (!repositoryName) {
    throw new Error(
      'SAS Repository Name is required for SAS9 deployments.\n Please ensure that `repositoryName` is present in your build target configuration and try again.\n'
    )
  }

  const sasjs = new SASjs({
    serverUrl: target.serverUrl,
    allowInsecureRequests: target.allowInsecureRequests,
    appLoc: target.appLoc,
    serverType: target.serverType,
    debug: true
  })
  const { buildResultsLogsFolder } = await getConstants()
  const executionResult = await sasjs
    .executeScriptSAS9(linesToExecute, serverName, repositoryName)
    .catch(async (err) => {
      if (err && err.payload && err.payload.log) {
        let log = err.payload.log

        process.logger?.info(`Creating log file in ${buildResultsLogsFolder} .`)
        const createdFilePath = await createOutputFile(log)
        process.logger?.success(
          `Log file has been created at ${createdFilePath} .`
        )

        throw new ErrorResponse('Find more error details in the log file.')
      } else {
        throw err
      }
    })

  let parsedLog
  try {
    parsedLog = JSON.parse(executionResult as string).payload.log
  } catch (e) {
    displayError('Error parsing execution result', e)
    parsedLog = executionResult
  }

  process.logger?.success('Job execution completed!')

  process.logger?.info(`Creating log file in ${buildResultsLogsFolder} .`)
  const createdFilePath = await createOutputFile(
    JSON.stringify(parsedLog, null, 2)
  )
  process.logger?.success(`Log file has been created at ${createdFilePath} .`)

  return { parsedLog }
}

async function createOutputFile(log: string) {
  const timestamp = generateTimestamp()
  const { buildResultsLogsFolder } = await getConstants()
  const outputFilePath = path.join(
    buildResultsLogsFolder,
    `sasjs-run-${timestamp}.log`
  )

  await createFile(outputFilePath, log)

  return outputFilePath
}

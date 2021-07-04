import path from 'path'
import SASjs from '@sasjs/adapter/node'
import { ErrorResponse } from '@sasjs/adapter/node'
import { findTargetInConfiguration, getAuthConfig } from '../../utils/config'
import {
  readFile,
  createFile,
  Target,
  generateTimestamp,
  ServerType,
  decodeFromBase64
} from '@sasjs/utils'
import { Command } from '../../utils/command'
import { displayError } from '../../utils/displayResult'
import { getConstants } from '../../constants'
import { compileSingleFile } from '../'
import { displaySasjsRunnerError } from '../../utils/utils'

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
    path.isAbsolute(filePath)
      ? filePath
      : path.join(process.currentDir, filePath)
  )
  const linesToExecute = sasFile.replace(/\r\n/g, '\n').split('\n')
  if (target.serverType === ServerType.SasViya) {
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
    allowInsecureRequests: target.allowInsecureRequests,
    appLoc: target.appLoc,
    serverType: target.serverType,
    debug: true,
    useComputeApi: true
  })

  let contextName = target.contextName

  if (!contextName) {
    contextName = sasjs.getSasjsConfig().contextName
  }

  const authConfig = await getAuthConfig(target)

  const executionResult = await sasjs
    .executeScriptSASViya(
      path.basename(filePath),
      linesToExecute,
      contextName,
      authConfig
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

  const { buildDestinationResultsFolder } = await getConstants()
  process.logger?.info(
    `Creating ${
      isOutput ? 'output' : 'log'
    } file in ${buildDestinationResultsFolder} .`
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
  const username = process.env.SAS_USERNAME
  const password = decodeFromBase64(process.env.SAS_PASSWORD as string)
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
    serverType: target.serverType,
    debug: true
  })
  const { buildDestinationResultsFolder } = await getConstants()
  const executionResult = await sasjs
    .executeScriptSAS9(linesToExecute, username, password)
    .catch(async (err) => {
      if (err && err.payload && err.payload.log) {
        let log = err.payload.log

        process.logger?.info(
          `Creating log file in ${buildDestinationResultsFolder} .`
        )
        const createdFilePath = await createOutputFile(log)
        process.logger?.success(
          `Log file has been created at ${createdFilePath} .`
        )

        throw new ErrorResponse('Find more error details in the log file.')
      } else {
        if (err && err.errorCode === 404) {
          displaySasjsRunnerError(username)
        }
        throw err
      }
    })

  process.logger?.success('Job execution completed!')

  process.logger?.info(
    `Creating log file in ${buildDestinationResultsFolder} .`
  )
  const createdFilePath = await createOutputFile(executionResult || '')
  process.logger?.success(`Log file has been created at ${createdFilePath} .`)

  return { log: executionResult }
}

async function createOutputFile(log: string) {
  const timestamp = generateTimestamp()
  const { buildDestinationResultsFolder } = await getConstants()
  const outputFilePath = path.join(
    buildDestinationResultsFolder,
    `sasjs-run-${timestamp}.log`
  )

  await createFile(outputFilePath, log)

  return outputFilePath
}

import path from 'path'
import SASjs from '@sasjs/adapter/node'
import { ErrorResponse } from '@sasjs/adapter/node'
import { getAuthConfig } from '../../utils/config'
import {
  readFile,
  createFile,
  deleteFile,
  Target,
  generateTimestamp,
  ServerType,
  decodeFromBase64,
  getAbsolutePath
} from '@sasjs/utils'
import { compileSingleFile } from '../'
import { displayError, displaySasjsRunnerError } from '../../utils/'
import axios from 'axios'
import { getDestinationServicePath } from '../compile/internal/getDestinationPath'

/**
 * Runs SAS code from a given file on the specified target.
 * @param {Target} target - the target to run the SAS code on.
 * @param {string} filePath - the path to the file containing SAS code.
 * @param {boolean} compile - compiles sas file present at 'filePath' before running code.
 */
export async function runSasCode(
  target: Target,
  filePath: string,
  compile: boolean = false
) {
  let isFileCreated: boolean = false

  const tempFilePath = path.join(
    process.projectDir,
    'temp-' + Date.now() + '.sas'
  )

  if (filePath.startsWith('https://') || filePath.startsWith('http://')) {
    await axios
      .get(filePath)
      .then(async (res) => {
        const { invalidSasError } = process.sasjsConstants
        if (typeof res.data !== 'string') {
          throw new Error(invalidSasError)
        }
        const content: string = res.data.trim()
        if (content && content.startsWith('<')) {
          throw new Error(invalidSasError)
        }
        await createFile(tempFilePath, content)
        isFileCreated = true
      })
      .catch((err) => {
        throw new Error(`${err.message}\nUrl: ${filePath}`)
      })
  }
  if (isFileCreated) {
    filePath = tempFilePath
  }

  if (!/\.sas$/i.test(filePath)) {
    throw new Error(`'sasjs run' command supports only *.sas files.`)
  }

  if (compile) {
    const sourcefilePathParts = path.normalize(filePath).split(path.sep)
    sourcefilePathParts.splice(-1, 1)
    const sourceFolderPath = sourcefilePathParts.join(path.sep)
    ;({ destinationPath: filePath } = await compileSingleFile(
      target,
      'identify',
      filePath,
      getDestinationServicePath(sourceFolderPath),
      true
    ))
    process.logger?.success(`File Compiled and placed at: ${filePath} .`)
  }
  const sasFilePath = getAbsolutePath(filePath, process.currentDir)
  const sasFileContent = await readFile(sasFilePath)
  const linesToExecute = sasFileContent.replace(/\r\n/g, '\n').split('\n')
  if (target.serverType === ServerType.SasViya) {
    return await executeOnSasViya(
      filePath,
      isFileCreated,
      target,
      linesToExecute
    )
  } else {
    return await executeOnSas9(filePath, isFileCreated, target, linesToExecute)
  }
}

async function executeOnSasViya(
  filePath: string,
  isTempFile: boolean,
  target: Target,
  linesToExecute: string[]
) {
  process.logger?.info(
    `Sending ${path.basename(filePath)} to SAS server for execution.`
  )

  const sasjs = new SASjs({
    serverUrl: target.serverUrl,
    httpsAgentOptions: target.httpsAgentOptions,
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

  const { buildDestinationResultsFolder } = process.sasjsConstants
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
  if (isTempFile) {
    await deleteFile(filePath)
  }
  return { log }
}

async function executeOnSas9(
  filePath: string,
  isTempFile: boolean,
  target: Target,
  linesToExecute: string[]
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
    serverType: target.serverType,
    debug: true
  })
  const { buildDestinationResultsFolder } = process.sasjsConstants
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
  if (isTempFile) {
    await deleteFile(filePath)
  }
  return { log: executionResult }
}

async function createOutputFile(log: string) {
  const timestamp = generateTimestamp()
  const { buildDestinationResultsFolder } = process.sasjsConstants
  const outputFilePath = path.join(
    buildDestinationResultsFolder,
    `sasjs-run-${timestamp}.log`
  )

  await createFile(outputFilePath, log)

  return outputFilePath
}

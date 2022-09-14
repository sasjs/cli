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
import {
  convertToSASStatements,
  displayError,
  displaySasjsRunnerError,
  isSasJsServerInServerMode
} from '../../utils/'
import axios from 'axios'
import { getDestinationServicePath } from '../compile/internal/getDestinationPath'
import { saveLog } from '../../utils/saveLog'
import { parseSourceFile } from '../../utils/parseSourceFile'

/**
 * Runs SAS code from a given file on the specified target.
 * @param {Target} target - the target to run the SAS code on.
 * @param {string} filePath - the path to the file containing SAS code.
 * @param {boolean} compile - compiles sas file present at 'filePath' before running code.
 * @param {string} logFile - (Optional) Path to log file.
 */
export async function runSasCode(
  target: Target,
  filePath: string,
  compile: boolean = false,
  logFile?: string,
  source?: string
) {
  let isTempFile = false

  if (isUrl(filePath)) {
    ;({ isTempFile, tempFilePath: filePath } = await createFileFromUrl(
      filePath
    ))
  }

  if (compile) {
    if (/\.sas$/i.test(filePath)) {
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
    } else {
      process.logger.info(
        'Compile flag has no effect on files with extension type other than sas'
      )
    }
  }
  const sasFilePath = getAbsolutePath(filePath, process.currentDir)
  const sasFileContent = await readFile(sasFilePath)
  let linesToExecute = sasFileContent.replace(/\r\n/g, '\n').split('\n')

  if (source) {
    let macroVars = await parseSourceFile(source)
    let macroVarStatements = convertToSASStatements(macroVars).split('\n')

    linesToExecute = [...macroVarStatements, ...linesToExecute]
  }

  let result
  if (target.serverType === ServerType.SasViya)
    result = await executeOnSasViya(filePath, target, linesToExecute, logFile)
  else if (target.serverType === ServerType.Sas9)
    result = await executeOnSas9(target, linesToExecute, logFile)
  else result = await executeOnSasJS(filePath, target, linesToExecute, logFile)

  if (isTempFile) {
    await deleteFile(filePath)
  }

  return result
}

async function executeOnSasViya(
  filePath: string,
  target: Target,
  linesToExecute: string[],
  logFile: string | undefined
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

      await createOutputFile(log, logFile)

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
  const createdFilePath = await createOutputFile(log, undefined, isOutput)
  process.logger?.success(
    `${
      isOutput ? 'Output' : 'Log'
    } file has been created at ${createdFilePath} .`
  )
  return { log }
}

async function executeOnSas9(
  target: Target,
  linesToExecute: string[],
  logFile: string | undefined
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

  const executionResult = await sasjs
    .executeScriptSAS9(linesToExecute, username, password)
    .catch(async (err) => {
      if (err && err.payload && err.payload.log) {
        let log = err.payload.log

        await createOutputFile(log, logFile)

        throw new ErrorResponse('Find more error details in the log file.')
      } else {
        if (err && err.errorCode === 404) {
          displaySasjsRunnerError(username)
        }
        throw err
      }
    })

  process.logger?.success('Job execution completed!')

  await createOutputFile(executionResult || '', logFile)

  return { log: executionResult }
}

async function executeOnSasJS(
  filePath: string,
  target: Target,
  linesToExecute: string[],
  logFile: string | undefined
) {
  let authConfig

  if (await isSasJsServerInServerMode(target)) {
    authConfig = await getAuthConfig(target)
  }

  const sasjs = new SASjs({
    serverUrl: target.serverUrl,
    httpsAgentOptions: target.httpsAgentOptions,
    appLoc: target.appLoc,
    serverType: target.serverType,
    debug: true
  })

  const fileExtension = path.extname(filePath).slice(1)

  const executionResult = await sasjs.executeScriptSASjs(
    linesToExecute.join('\n'),
    fileExtension,
    authConfig
  )

  process.logger?.success('Job execution completed!')

  await createOutputFile(executionResult || '', logFile)

  return { log: executionResult }
}

async function createOutputFile(
  log: string,
  logFilePath?: string,
  silent?: boolean
) {
  const timestamp = generateTimestamp()
  const { buildDestinationResultsFolder } = process.sasjsConstants

  if (!logFilePath) {
    logFilePath = path.join(
      buildDestinationResultsFolder,
      `sasjs-run-${timestamp}.log`
    )
  }

  await saveLog(log || '', logFilePath, '', false, silent)

  return logFilePath
}

function isUrl(filePath: string) {
  return filePath.startsWith('https://') || filePath.startsWith('http://')
}

async function createFileFromUrl(url: string) {
  return await axios
    .get(url)
    .then(async (res) => {
      const { invalidSasError } = process.sasjsConstants
      if (typeof res.data !== 'string') {
        throw new Error(invalidSasError)
      }
      const content: string = res.data.trim()
      if (content && content.startsWith('<')) {
        throw new Error(invalidSasError)
      }

      const urlWithoutQueryParams = url.split('?')[0]
      const fileExtension = path.extname(urlWithoutQueryParams)

      const tempFilePath = path.join(
        process.projectDir,
        `temp-${Date.now()}${fileExtension}`
      )

      await createFile(tempFilePath, content)

      return { isTempFile: true, tempFilePath }
    })
    .catch((err) => {
      throw new Error(`${err.message}\nUrl: ${url}`)
    })
}

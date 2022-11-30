import path from 'path'
import { ErrorResponse } from '@sasjs/adapter/node'
import {
  getAuthConfig,
  getSASjs,
  getSASjsAndAuthConfig
} from '../../utils/config'
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
    const macroVars = await parseSourceFile(source)
    const macroVarStatements = convertToSASStatements(macroVars).split('\n')

    linesToExecute = [...macroVarStatements, ...linesToExecute]
  }

  if (isTempFile) {
    await deleteFile(filePath)
  }

  if (target.serverType === ServerType.SasViya)
    return await executeOnSasViya(filePath, target, linesToExecute, logFile)

  if (target.serverType === ServerType.Sas9)
    return await executeOnSas9(target, linesToExecute, logFile)

  return await executeOnSasJS(filePath, target, linesToExecute, logFile)
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

  const { sasjs, authConfig } = await getSASjsAndAuthConfig(target)

  const contextName = target.contextName || sasjs.getSasjsConfig().contextName

  const { log } = await sasjs
    .executeScript({
      fileName: path.basename(filePath),
      linesOfCode: linesToExecute,
      contextName,
      authConfig
    })
    .catch(async (err) => {
      const log = err.log

      if (!log)
        throw new ErrorResponse('We were not able to fetch the log this time.')

      await createOutputFile(log, logFile)

      throw new ErrorResponse('Find more error details in the log file.')
    })

  process.logger?.success('Job execution completed!')

  const { buildDestinationResultsFolder } = process.sasjsConstants
  process.logger?.info(
    `Creating log file in ${buildDestinationResultsFolder} .`
  )
  const createdFilePath = await createOutputFile(log, logFile)
  process.logger?.success(`Log file has been created at ${createdFilePath} .`)
  return { log }
}

async function executeOnSas9(
  target: Target,
  linesToExecute: string[],
  logFile: string | undefined
) {
  const { sasjs, authConfigSas9 } = await getSASjsAndAuthConfig(target)
  const userName = authConfigSas9!.userName
  const password = decodeFromBase64(authConfigSas9!.password)

  const executionResult = await sasjs
    .executeScript({
      linesOfCode: linesToExecute,
      authConfigSas9: { userName, password }
    })
    .catch(async (err) => {
      if (err && err.payload && err.payload.log) {
        const log = err.payload.log

        await createOutputFile(log, logFile)

        throw new ErrorResponse('Find more error details in the log file.')
      } else {
        if (err && err.errorCode === 404) {
          displaySasjsRunnerError(userName)
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
  const authConfig = (await isSasJsServerInServerMode(target))
    ? await getAuthConfig(target)
    : undefined
  const sasjs = getSASjs(target)

  const fileExtension = path.extname(filePath).slice(1)

  const executionResult = await sasjs.executeScript({
    linesOfCode: linesToExecute,
    runTime: fileExtension,
    authConfig
  })

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

import { displayError, displaySuccess } from '../../utils/displayResult'
import { isJsonFile } from '../../utils/file'
import { parseLogLines } from '../../utils/utils'
import { fetchLogFileContent } from '../shared/fetchLogFileContent'
import path from 'path'
import SASjs, {
  Link,
  NoSessionStateError,
  PollOptions
} from '@sasjs/adapter/node'
import {
  Target,
  MacroVars,
  isMacroVars,
  fileExists,
  readFile,
  createFile,
  createFolder,
  folderExists,
  AuthConfig
} from '@sasjs/utils'
import { ReturnCode } from '../../types/command'
import { contextName } from '../../utils'

/**
 * Triggers existing job for execution.
 * @param {object} sasjs - configuration object of SAS adapter.
 * @param {string} accessToken - an access token for an authorized user.
 * @param {string} jobPath - location of the job on SAS Drive.
 * @param {object} target - SAS server configuration.
 * @param {boolean} waitForJob - flag indicating if CLI should wait for job completion.
 * @param {boolean | string} output - flag indicating if CLI should print out job output. If string was provided, it will be treated as file path to store output. If filepath wasn't provided, output.json file will be created in current folder.
 * @param {string | undefined} logFile - flag indicating if CLI should fetch and save log to provided file path. If filepath wasn't provided, {job}.log file will be created in current folder.
 * @param {string | undefined} statusFile - flag indicating if CLI should fetch and save status to the local file. If filepath wasn't provided, it will only print on console.
 * @param {boolean} returnStatusOnly - flag indicating if CLI should return status only (0 = success, 1 = warning, 3 = error).
 * @param {boolean} ignoreWarnings - flag indicating if CLI should return status '0', when the job state is warning.
 * @param {string | undefined} source - an optional path to a JSON file containing macro variables.
 * @param {boolean} streamLog - a flag indicating if the logs should be streamed to the supplied log path during job execution. This is useful for getting feedback on long running jobs.
 */
export async function execute(
  sasjs: SASjs,
  authConfig: AuthConfig,
  jobPath: string,
  target: Target,
  waitForJob: boolean,
  output: string | boolean,
  logFile: string | undefined,
  statusFile: string | undefined,
  returnStatusOnly: boolean,
  ignoreWarnings: boolean,
  source: string | undefined,
  streamLog: boolean
) {
  const pollOptions: PollOptions = {
    maxPollCount: 24 * 60 * 60,
    pollInterval: 1000,
    streamLog,
    logFolderPath: logFile
  }

  let result

  const startTime = new Date().getTime()

  if (statusFile && !returnStatusOnly)
    await displayStatus({ state: 'Initiating' }, statusFile)

  if (!returnStatusOnly) {
    process.logger?.success(
      `Job located at ${jobPath} has been submitted for execution...`
    )
  }

  const contextName = getContextName(target, returnStatusOnly)

  let macroVars: MacroVars | undefined

  if (source) {
    if (!isJsonFile(source)) throw 'Source file has to be JSON.'

    await fileExists(source).catch((_) => {
      throw 'Error while checking if source file exists.'
    })

    source = await readFile(source).catch((_) => {
      throw 'Error while reading source file.'
    })

    macroVars = JSON.parse(source as string) as MacroVars

    if (!isMacroVars(macroVars)) {
      throw `Provided source is not valid. An example of valid source:
{ macroVars: { name1: 'value1', name2: 'value2' } }`
    }
  }

  let submittedJob = await sasjs
    .startComputeJob(
      jobPath,
      null,
      { contextName },
      authConfig,
      waitForJob || !!logFile,
      pollOptions,
      true,
      macroVars?.macroVars
    )
    .catch(async (err) => {
      if (err instanceof NoSessionStateError) {
        if (err?.logUrl) {
          const logData = await fetchLogFileContent(
            sasjs,
            authConfig.access_token,
            err.logUrl,
            100000
          )

          await saveLog(logData, logFile, jobPath, returnStatusOnly)
        }

        displayError(err)

        terminateProcess(2)
      }

      if (err?.log) {
        await saveLog(err.log, logFile, jobPath, returnStatusOnly)
      }

      if (returnStatusOnly) terminateProcess(2)

      if (err?.name === 'NotFoundError') {
        throw new Error(`Job located at '${jobPath}' was not found.`)
      }

      result = returnStatusOnly
        ? ReturnCode.InternalError
        : typeof err === 'object' && Object.keys(err).length
        ? JSON.stringify({ state: err.job?.state })
        : `${err}`
      if (err.job) {
        return err.job
      }
    })

  const endTime = new Date().getTime()

  if (result && !returnStatusOnly) {
    displayError(result, 'An error has occurred when executing a job.')
  }

  if (submittedJob && submittedJob.job) submittedJob = submittedJob.job
  if (statusFile && !returnStatusOnly)
    await displayStatus(submittedJob, statusFile, result, true)

  if (submittedJob && submittedJob.links) {
    if (!result) result = true

    const sessionLink = submittedJob.links.find(
      (l: Link) => l.method === 'GET' && l.rel === 'self'
    ).href

    if (!returnStatusOnly) {
      displaySuccess(
        (waitForJob
          ? `Job located at '${jobPath}' has been executed.\nJob details`
          : `Job session`) +
          ` can be found at ${target.serverUrl + sessionLink}`
      )
    }

    if (output || logFile) {
      try {
        const outputJson = JSON.stringify(submittedJob, null, 2)

        if (typeof output === 'string') {
          const currentDirPath = path.isAbsolute(output)
            ? ''
            : process.projectDir
          const outputPath = path.join(
            currentDirPath,
            /\.[a-z]{3,4}$/i.test(output)
              ? output
              : path.join(output, 'output.json')
          )

          let folderPath = outputPath.split(path.sep)
          folderPath.pop()
          const parentFolderPath = folderPath.join(path.sep)

          if (!(await folderExists(parentFolderPath)))
            await createFolder(parentFolderPath)

          await createFile(outputPath, outputJson)

          if (!returnStatusOnly)
            displaySuccess(`Output saved to: ${outputPath}`)
        } else if (output) {
          if (!returnStatusOnly) (process.logger || console).log(outputJson)
        }

        // If the log was being streamed, it should already be present
        // at the specified log path
        if (logFile && !pollOptions.streamLog) {
          const logObj = submittedJob.links.find(
            (link: Link) => link.rel === 'log' && link.method === 'GET'
          )

          if (logObj) {
            const logUrl = target.serverUrl + logObj.href
            const logCount = submittedJob.logStatistics.lineCount

            const logData = await fetchLogFileContent(
              sasjs,
              authConfig.access_token,
              logUrl,
              logCount
            )

            await saveLog(logData, logFile, jobPath, returnStatusOnly)
          }
        }

        result = submittedJob
      } catch (error) {
        result = false

        if (!returnStatusOnly) {
          displayError(
            null,
            'An error has occurred when parsing an output of the job.'
          )
        }
      }
    }

    if (waitForJob && returnStatusOnly && submittedJob.state) {
      switch (submittedJob.state) {
        case 'completed':
          terminateProcess(0)
        case 'warning':
          terminateProcess(ignoreWarnings ? 0 : 1)
        case 'error':
          terminateProcess(2)
        default:
          break
      }
    }
  } else if (returnStatusOnly && result === 2) {
    terminateProcess(2)
  }

  if (!returnStatusOnly) {
    process.logger?.info(
      `This job was executed in ${(endTime - startTime) / 1000} seconds`
    )
  }

  return result
}

// REFACTOR: should be a utility
export function getContextName(
  target: Target,
  returnStatusOnly: boolean = false
): string {
  const defaultContextName = contextName

  if (target?.contextName) return target.contextName

  if (!returnStatusOnly) {
    process.logger?.warn(
      `\`contextName\` was not provided in your target configuration. Falling back to context ${defaultContextName}`
    )
  }

  return defaultContextName
}

async function displayStatus(
  submittedJob: any,
  statusFile: string,
  error = '',
  displayStatusFilePath = false
) {
  const adapterStatus = submittedJob?.state
    ? submittedJob.state
    : 'Not Available'

  const status =
    adapterStatus === 'Not Available'
      ? `Job Status: ${adapterStatus}\nDetails: ${error}\n`
      : `Job Status: ${adapterStatus}`

  if (adapterStatus === 'Initiating' || adapterStatus === 'completed')
    displaySuccess(status)
  else displayError({}, status)

  if (statusFile) {
    let folderPath = statusFile.split(path.sep)
    folderPath.pop()
    const parentFolderPath = folderPath.join(path.sep)

    if (!(await folderExists(parentFolderPath)))
      await createFolder(parentFolderPath)

    await createFile(statusFile, status)
    if (displayStatusFilePath) displaySuccess(`Status saved to: ${statusFile}`)
  }
}

const saveLog = async (
  logData: any,
  logFile: string | undefined,
  jobPath: string,
  returnStatusOnly: boolean
) => {
  let logPath

  if (logFile) {
    logPath = logFile
  } else {
    logPath = path.join(
      process.projectDir,
      `${jobPath.split('/').slice(-1).pop()}.log`
    )
  }

  let folderPath = logPath.split(path.sep)
  folderPath.pop()
  const parentFolderPath = folderPath.join(path.sep)

  if (!(await folderExists(parentFolderPath))) {
    await createFolder(parentFolderPath)
  }

  let logLines = typeof logData === 'object' ? parseLogLines(logData) : logData

  process.logger?.info(`Creating log file at ${logPath} .`)
  await createFile(logPath, logLines)

  if (!returnStatusOnly) displaySuccess(`Log saved to ${logPath}`)
}

const terminateProcess = (status: number) => {
  process.logger?.info(
    `Process will be terminated with the status code ${status}.`
  )

  process.exit(status)
}

import { displayError, displaySuccess } from '../../../../utils/displayResult'
import { isJsonFile } from '../../../../utils/file'
import { fetchLogFileContent } from '../../../shared/fetchLogFileContent'
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
import { terminateProcess, contextName } from '../../../../utils/'
import { ReturnCode } from '../../../../types/command'
import { saveLog } from '../utils'

/**
 * Triggers existing job for execution on Viya server.
 * @param {object} sasjs - configuration object of SAS adapter.
 * @param {string} accessToken - an access token for an authorized user.
 * @param {string} jobPath - location of the job on SAS Drive.
 * @param {object} target - SAS server configuration.
 * @param {boolean} waitForJob - flag indicating if CLI should wait for job completion.
 * @param {boolean | string} output - flag indicating if CLI should print out job output. If string was provided, it will be treated as file path to store output. If filepath wasn't provided, output.json file will be created in current folder.
 * @param {string | undefined} logFile - flag indicating if CLI should fetch and save log to provided file path. If filepath wasn't provided, {job}.log file will be created in current folder.
 * @param {string | undefined} statusFile - flag indicating if CLI should fetch and save status to the local file. If filepath wasn't provided, it will only print on console.
 * @param {boolean} ignoreWarnings - flag indicating if CLI should return status '0', when the job state is warning.
 * @param {string | undefined} source - an optional path to a JSON file containing macro variables.
 * @param {boolean} streamLog - a flag indicating if the logs should be streamed to the supplied log path during job execution. This is useful for getting feedback on long running jobs.
 * @param {boolean} verbose - enables verbose mode that logs summary of every HTTP response.
 */
export async function executeJobViya(
  sasjs: SASjs,
  authConfig: AuthConfig,
  jobPath: string,
  target: Target,
  waitForJob: boolean,
  output: string | boolean,
  logFile: string | undefined,
  statusFile: string | undefined,
  ignoreWarnings: boolean,
  source: string | undefined,
  streamLog: boolean,
  verbose: boolean
) {
  // job status poll options
  const pollOptions: PollOptions = {
    maxPollCount: 24 * 60 * 60,
    pollInterval: 1000,
    streamLog,
    logFolderPath: logFile
  }

  // job result
  let result

  // job execution start time
  const startTime = new Date().getTime()

  // write job status to file
  if (statusFile) await displayStatus({ state: 'Initiating' }, statusFile)

  process.logger?.success(
    `Job located at ${jobPath} has been submitted for execution...`
  )

  // execution context name
  const contextName = getContextName(target)

  // macro variables
  let macroVars: MacroVars | undefined

  // get macro variables from source file
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

  // submit job for execution
  let submittedJob = await sasjs
    .startComputeJob(
      jobPath,
      null,
      { contextName },
      authConfig,
      waitForJob || !!logFile,
      pollOptions,
      true,
      macroVars?.macroVars,
      verbose || undefined
    )
    .catch(async (err) => {
      // handle error
      if (err instanceof NoSessionStateError) {
        // handle use case when there was no state of the session
        if (err?.logUrl) {
          // retrieve log if there is a link
          const logData = await fetchLogFileContent(
            sasjs,
            authConfig.access_token,
            err.logUrl,
            100000
          )

          // save log
          await saveLog(logData, logFile, jobPath)
        }

        displayError(err)

        // terminate process with status code 2
        terminateProcess(2)
      }

      // save log if it is present
      if (err?.log) await saveLog(err.log, logFile, jobPath)

      // handle use case when job wasn't found
      if (err?.name === 'NotFoundError') {
        throw new Error(`Job located at '${jobPath}' was not found.`)
      }

      // get additional information about error if it is present
      result =
        typeof err === 'object' && Object.keys(err).length
          ? JSON.stringify({ state: err.job?.state })
          : `${err}`

      if (err.job) {
        return err.job
      }
    })

  // job execution end time
  const endTime = new Date().getTime()

  if (result) {
    displayError(result, 'An error has occurred when executing a job.')
  }

  if (submittedJob && submittedJob.job) submittedJob = submittedJob.job

  // write job status to the status file
  if (statusFile) await displayStatus(submittedJob, statusFile, result, true)

  // job execution completed successfully
  if (submittedJob && submittedJob.links) {
    if (!result) result = true

    if (output || logFile) {
      // try to convert submitted job into an object
      try {
        const outputJson = JSON.stringify(submittedJob, null, 2)

        // if a file path to output file has been provided
        if (typeof output === 'string') {
          // determine absolute file path
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

          // create a parent folder if it doesn't exist
          if (!(await folderExists(parentFolderPath))) {
            await createFolder(parentFolderPath)
          }

          await createFile(outputPath, outputJson)

          displaySuccess(`Output saved to: ${outputPath}`)
        } else if (output) {
          // log job object to the console
          ;(process.logger || console).log(outputJson)
        }

        // If the log was being streamed, it should already be present
        // at the specified log path
        if (logFile && !pollOptions.streamLog) {
          // get a link object of the log
          const logObj = submittedJob.links.find(
            (link: Link) => link.rel === 'log' && link.method === 'GET'
          )

          // retrieve log
          if (logObj) {
            const logUrl = target.serverUrl + logObj.href
            const logCount = submittedJob.logStatistics.lineCount

            const logData = await fetchLogFileContent(
              sasjs,
              authConfig.access_token,
              logUrl,
              logCount
            )

            await saveLog(logData, logFile, jobPath)
          }
        }

        result = submittedJob
      } catch (error) {
        // handle use case when submitted job can't be parsed
        result = false

        displayError(
          null,
          'An error has occurred when parsing an output of the job.'
        )
      }
    }

    // wait for job state and return status(0,1,2) based on it
    if (waitForJob && submittedJob.state) {
      switch (submittedJob.state) {
        case 'completed':
          terminateProcess(0)
        case 'warning':
          // if ignoreWarnings flag is present, process will be terminated with
          // status code 0, otherwise status code will be 1
          terminateProcess(ignoreWarnings ? 0 : 1)
        case 'error':
          terminateProcess(2)
        default:
          break
      }
    }
  } else if (result) {
    terminateProcess(ReturnCode.InternalError)
  }

  process.logger?.info(
    `This job was executed in ${(endTime - startTime) / 1000} seconds`
  )

  return result
}

// REFACTOR: should be a utility
/**
 * Gets job execution context name.
 * @param target - SAS server configuration.
 * @returns - job execution context name.
 */
export function getContextName(target: Target): string {
  // default execution context of @sasjs/cli
  const defaultContextName = contextName

  // get gontext name from target
  if (target?.contextName) return target.contextName

  process.logger?.warn(
    `\`contextName\` was not provided in your target configuration. Falling back to context ${defaultContextName}`
  )

  return defaultContextName
}

/**
 * Logs to the console or writes job status to the file.
 * @param submittedJob - job submitted fro execution.
 * @param statusFile - file path to the status file.
 * @param error - error generated during job execution.
 * @param displayStatusFilePath - boolean indicating if file path to the status file should be logged.
 */
async function displayStatus(
  submittedJob: any,
  statusFile: string,
  error = '',
  displayStatusFilePath = false
) {
  // get job state
  const adapterStatus = submittedJob?.state
    ? submittedJob.state
    : 'Not Available'

  // handle use case when job state is not available
  const status =
    adapterStatus === 'Not Available'
      ? `Job Status: ${adapterStatus}\nDetails: ${error}\n`
      : `Job Status: ${adapterStatus}`

  // handle job states 'Initiating' and 'completed'
  if (adapterStatus === 'Initiating' || adapterStatus === 'completed') {
    displaySuccess(status)
  }
  // display an job status as an error
  else {
    displayError({}, status)
  }

  // if file path to status file is provided
  if (statusFile) {
    // get absolute file path
    let folderPath = statusFile.split(path.sep)
    folderPath.pop()
    const parentFolderPath = folderPath.join(path.sep)

    // create parent folder of status file
    if (!(await folderExists(parentFolderPath))) {
      await createFolder(parentFolderPath)
    }

    await createFile(statusFile, status)

    // display file path to status file
    if (displayStatusFilePath) displaySuccess(`Status saved to: ${statusFile}`)
  }
}

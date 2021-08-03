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
  AuthConfig,
  ServerType
} from '@sasjs/utils'
import { getConstants } from '../../constants'
import { terminateProcess } from '../../main'
import axios from 'axios'

/**
 * Triggers existing job for execution.
 * @param {object} sasjs - configuration object of SAS adapter.
 * @param {string} accessToken - an access token for an authorized user.
 * @param {string} jobPath - location of the job on SAS Drive.
 * @param {object} target - SAS server configuration.
 * @param {boolean} waitForJob - flag indicating if CLI should wait for job completion.
 * @param {boolean} output - flag indicating if CLI should print out job output. If string was provided, it will be treated as file path to store output.
 * @param {boolean | string} output - flag indicating if CLI should print out job output. If string was provided, it will be treated as file path to store output. If filepath wasn't provided, output.json file will be created in current folder.
 * @param {boolean | string} logFile - flag indicating if CLI should fetch and save log to provided file path. If filepath wasn't provided, {job}.log file will be created in current folder.
 * @param {boolean | string} statusFile - flag indicating if CLI should fetch and save status to the local file. If filepath wasn't provided, it will only print on console.
 * @param {boolean | undefined} returnStatusOnly - flag indicating if CLI should return status only (0 = success, 1 = warning, 3 = error). Works only if waitForJob flag was provided.
 * @param {boolean | undefined} ignoreWarnings - flag indicating if CLI should return status '0', when the job state is warning.
 * @param {string | undefined} source - an optional path to a JSON file containing macro variables.
 * @param {boolean} streamLog - a flag indicating if the logs should be streamed to the supplied log path during job execution. This is useful for getting feedback on long running jobs.
 */
export async function execute(
  sasjs: SASjs,
  authConfig: AuthConfig | undefined,
  jobPath: string,
  target: Target,
  waitForJob: boolean,
  output: string,
  logFile: string,
  statusFile: string,
  returnStatusOnly: boolean,
  ignoreWarnings: boolean,
  source: string | undefined,
  streamLog: boolean
) {
  console.log(`[job execute]`)
  let logFolderPath

  if (typeof logFile === 'string') {
    const currentDirPath = path.isAbsolute(logFile) ? '' : process.projectDir
    logFolderPath = path.join(currentDirPath, logFile)
  } else {
    logFolderPath = process.projectDir
  }

  const pollOptions: PollOptions = {
    maxPollCount: 24 * 60 * 60,
    pollInterval: 1000,
    streamLog,
    logFolderPath
  }

  if (returnStatusOnly && !waitForJob) waitForJob = true

  if (ignoreWarnings && !returnStatusOnly) {
    process.logger?.warn(
      `Using the 'ignoreWarnings' flag without 'returnStatusOnly' flag will not affect the sasjs job execute command.`
    )
  }

  let result

  const startTime = new Date().getTime()

  if (statusFile !== undefined && !returnStatusOnly)
    await displayStatus({ state: 'Initiating' }, statusFile)

  if (!returnStatusOnly) {
    process.logger?.success(
      `Job located at ${jobPath} has been submitted for execution...`
    )
  }

  const contextName = await getContextName(target, returnStatusOnly)

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

  let submittedJob

  if (target.serverType === ServerType.Sasjs) {
    const payload = { _program: jobPath, macroVars: macroVars?.macroVars }

    const res = await axios
      .post(`${target.serverUrl}/execute`, payload)
      .catch((err) => console.log(`[err]`, err))

    console.log(`[res]`, res)
  } else {
    submittedJob = await sasjs
      .startComputeJob(
        jobPath,
        null,
        { contextName },
        authConfig,
        waitForJob || logFile !== undefined ? true : false,
        pollOptions,
        true,
        macroVars?.macroVars
      )
      .catch(async (err) => {
        if (err instanceof NoSessionStateError) {
          if (err?.logUrl) {
            let logData

            if (target.serverType !== ServerType.Sasjs && authConfig) {
              logData = await fetchLogFileContent(
                sasjs,
                authConfig.access_token,
                err.logUrl,
                100000
              )
            } else {
              // TODO: implement fetchLogFileContent for @sasjs/server
            }

            await saveLog(logData, logFile, jobPath, returnStatusOnly)
          }

          displayError(err)

          terminateProcess(2)
        }

        if (err && err.log) {
          await saveLog(err.log, logFile, jobPath, returnStatusOnly)
        }

        if (returnStatusOnly) terminateProcess(2)

        if (err?.name === 'NotFoundError') {
          throw `Job located at '${jobPath}' was not found.`
        }

        result = returnStatusOnly
          ? 2
          : typeof err === 'object' && Object.keys(err).length
          ? JSON.stringify({ state: err.job?.state })
          : `${err}`
        if (err.job) {
          return err.job
        }
      })
  }

  const endTime = new Date().getTime()

  if (result && !returnStatusOnly) {
    displayError(result, 'An error has occurred when executing a job.')
  }

  if (submittedJob && submittedJob.job) submittedJob = submittedJob.job
  if (statusFile !== undefined && !returnStatusOnly)
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

    if (output !== undefined || logFile !== undefined) {
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
        if (logFile !== undefined && !pollOptions.streamLog) {
          const logObj = submittedJob.links.find(
            (link: Link) => link.rel === 'log' && link.method === 'GET'
          )

          if (logObj) {
            const logUrl = target.serverUrl + logObj.href
            const logCount = submittedJob.logStatistics.lineCount

            let logData

            if (target.serverType !== ServerType.Sasjs && authConfig) {
              const logData = await fetchLogFileContent(
                sasjs,
                authConfig.access_token,
                logUrl,
                logCount
              )
            } else {
              // TODO: implement fetchLogFileContent for @sasjs/server
            }

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
export async function getContextName(
  target: Target,
  returnStatusOnly: boolean = false
) {
  const defaultContextName = (await getConstants()).contextName

  if (target && target.contextName) return target.contextName

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
  const adapterStatus =
    submittedJob && submittedJob.state ? submittedJob.state : 'Not Available'

  const status =
    adapterStatus === 'Not Available'
      ? `Job Status: ${adapterStatus}\nDetails: ${error}\n`
      : `Job Status: ${adapterStatus}`

  if (adapterStatus === 'Initiating' || adapterStatus === 'completed')
    displaySuccess(status)
  else displayError({}, status)

  if (typeof statusFile === 'string') {
    const currentDirPath = path.isAbsolute(statusFile) ? '' : process.projectDir
    const statusPath = path.join(currentDirPath, statusFile)

    let folderPath = statusPath.split(path.sep)
    folderPath.pop()
    const parentFolderPath = folderPath.join(path.sep)

    if (!(await folderExists(parentFolderPath)))
      await createFolder(parentFolderPath)

    await createFile(statusPath, status)
    if (displayStatusFilePath) displaySuccess(`Status saved to: ${statusPath}`)
  }
}

const saveLog = async (
  logData: any,
  logFile: string,
  jobPath: string,
  returnStatusOnly: boolean
) => {
  let logPath

  if (typeof logFile === 'string') {
    const currentDirPath = path.isAbsolute(logFile) ? '' : process.projectDir
    logPath = path.join(currentDirPath, logFile)
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

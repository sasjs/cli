import chalk from 'chalk'
import ora from 'ora'
import { displayResult } from '../../utils/displayResult'
import { createFile, createFolder, folderExists } from '../../utils/file'
import { parseLogLines } from '../../utils/utils'
import path from 'path'
import SASjs, { Link } from '@sasjs/adapter/node'
import { Target } from '@sasjs/utils/types'

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
 */
export async function execute(
  sasjs: SASjs,
  accessToken: string,
  jobPath: string,
  target: Target,
  waitForJob: boolean,
  output: string,
  logFile: string,
  statusFile: string,
  returnStatusOnly: boolean,
  ignoreWarnings: boolean
) {
  const pollOptions = { MAX_POLL_COUNT: 24 * 60 * 60, POLL_INTERVAL: 1000 }

  const saveLog = async (logData: any) => {
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
    const parentfolderPath = folderPath.join(path.sep)

    if (!(await folderExists(parentfolderPath))) {
      await createFolder(parentfolderPath)
    }

    let logLines =
      typeof logData === 'object' ? parseLogLines(logData) : logData

    await createFile(logPath, logLines)

    if (!returnStatusOnly) displayResult(null, null, `Log saved to: ${logPath}`)
  }

  if (returnStatusOnly && !waitForJob) waitForJob = true

  if (ignoreWarnings && !returnStatusOnly) {
    console.log(
      chalk.yellowBright(
        `WARNING: using 'ignoreWarnings' flag without 'returnStatusOnly' flag will not affect the command.`
      )
    )
  }

  let result

  const startTime = new Date().getTime()

  if (statusFile !== undefined && !returnStatusOnly)
    await displayStatus({ state: 'Initiating' }, statusFile)

  const spinner = ora(
    `Job located at ${chalk.greenBright(
      jobPath
    )} has been submitted for execution...\n`
  )

  if (!returnStatusOnly) spinner.start()

  const contextName = getContextName(target, returnStatusOnly)

  let submittedJob = await sasjs
    .startComputeJob(
      jobPath,
      null,
      { contextName },
      accessToken,
      waitForJob || logFile !== undefined ? true : false,
      pollOptions
    )
    .catch(async (err) => {
      if (err && err.log && logFile !== undefined) {
        await saveLog(err.log)
      }

      if (returnStatusOnly) process.exit(2)

      result = returnStatusOnly
        ? 2
        : typeof err === 'object' && Object.keys(err).length
        ? JSON.stringify({ state: err.job.state })
        : `${err}`
      if (err.job) {
        return err.job
      }
    })

  spinner.stop()

  const endTime = new Date().getTime()

  if (result && !returnStatusOnly)
    displayResult(result, 'An error has occurred when executing a job.', null)
  if (submittedJob && submittedJob.job) submittedJob = submittedJob.job
  if (statusFile !== undefined && !returnStatusOnly)
    await displayStatus(submittedJob, statusFile, result, true)

  if (submittedJob && submittedJob.links) {
    if (!result) result = true

    const sessionLink = submittedJob.links.find(
      (l: Link) => l.method === 'GET' && l.rel === 'self'
    ).href

    if (!returnStatusOnly) {
      displayResult(
        null,
        null,
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
            displayResult(null, null, `Output saved to: ${outputPath}`)
        } else if (output) {
          if (!returnStatusOnly) console.log(outputJson)
        }

        if (logFile !== undefined) {
          const logObj = submittedJob.links.find(
            (link: Link) => link.rel === 'log' && link.method === 'GET'
          )

          if (logObj) {
            const logUrl = target.serverUrl + logObj.href
            const logCount = submittedJob.logStatistics.lineCount
            const logFileContent = await sasjs.fetchLogFileContent(
              `${logUrl}?limit=${logCount}`,
              accessToken
            )
            const logData = JSON.parse(logFileContent as string)

            await saveLog(logData)
          }
        }

        result = submittedJob
      } catch (error) {
        result = false

        if (!returnStatusOnly) {
          displayResult(
            null,
            'An error has occurred when parsing an output of the job.',
            null
          )
        }
      }
    }

    if (waitForJob && returnStatusOnly && submittedJob.state) {
      switch (submittedJob.state) {
        case 'completed':
          process.exit(0)
        case 'warning':
          process.exit(ignoreWarnings ? 0 : 1)
        case 'error':
          process.exit(2)
        default:
          break
      }
    }
  } else if (returnStatusOnly && result === 2) {
    process.exit(2)
  }

  if (!returnStatusOnly) {
    console.log(
      chalk.whiteBright(
        `This operation took ${(endTime - startTime) / 1000} seconds`
      )
    )
  }

  return result
}

// REFACTOR: should be a utility
export function getContextName(
  target: Target,
  returnStatusOnly: boolean = false
) {
  const defaultContextName = 'SAS Job Execution compute context'
  if (target && target.contextName) {
    return target.contextName
  }

  if (!returnStatusOnly) {
    console.log(
      chalk.yellowBright(
        `contextName was not provided. Using ${defaultContextName} by default.`
      )
    )
    console.log(
      chalk.whiteBright(
        `You can specify the context name in your target configuration.`
      )
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
    displayResult(null, null, status)
  else displayResult({}, status, null)

  if (typeof statusFile === 'string') {
    const currentDirPath = path.isAbsolute(statusFile) ? '' : process.projectDir
    const statusPath = path.join(currentDirPath, statusFile)

    let folderPath = statusPath.split(path.sep)
    folderPath.pop()
    const parentFolderPath = folderPath.join(path.sep)

    if (!(await folderExists(parentFolderPath)))
      await createFolder(parentFolderPath)

    await createFile(statusPath, status)
    if (displayStatusFilePath)
      displayResult(null, null, `Status saved to: ${statusPath}`)
  }
}

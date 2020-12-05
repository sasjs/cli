import chalk from 'chalk'
import ora from 'ora'
import { displayResult } from '../../utils/displayResult'
import { createFile, createFolder, folderExists } from '../../utils/file-utils'
import { parseLogLines } from '../../utils/utils'
import path from 'path'

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
  sasjs,
  accessToken,
  jobPath,
  target,
  waitForJob,
  output,
  logFile,
  statusFile,
  returnStatusOnly,
  ignoreWarnings
) {
  if (returnStatusOnly && !waitForJob) waitForJob = true

  if (ignoreWarnings && !returnStatusOnly) {
    console.log(
      chalk.yellowBright(
        `WARNING: using 'ignoreWarnings' flag without 'returnStatusOnly' flag will not affect the command.`
      )
    )
  }

  let statusReturned = false
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

  const response = await sasjs
    .startComputeJob(
      jobPath,
      null,
      { contextName },
      accessToken,
      waitForJob || logFile !== undefined ? true : false
    )
    .catch((err) => {
      if (returnStatusOnly) {
        console.log(2)

        statusReturned = true
      }

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

  const submittedJob = response ? response.job || response : {}

  if (result && !returnStatusOnly)
    displayResult(result, 'An error has occurred when executing a job.', null)
  if (statusFile !== undefined && !returnStatusOnly)
    await displayStatus(submittedJob, statusFile, result, true)

  if (submittedJob && submittedJob.links) {
    if (!result) result = true

    const sessionLink = submittedJob.links.find(
      (l) => l.method === 'GET' && l.rel === 'self'
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
          folderPath = folderPath.join(path.sep)

          if (!(await folderExists(folderPath))) await createFolder(folderPath)

          await createFile(outputPath, outputJson)

          if (!returnStatusOnly)
            displayResult(null, null, `Output saved to: ${outputPath}`)
        } else if (output) {
          if (!returnStatusOnly) console.log(outputJson)
        }

        if (logFile !== undefined) {
          const logObj = submittedJob.links.find(
            (link) => link.rel === 'log' && link.method === 'GET'
          )

          if (logObj) {
            const logUrl = target.serverUrl + logObj.href
            const logCount = submittedJob.logStatistics.lineCount
            const logData = await sasjs.fetchLogFileContent(
              `${logUrl}?limit=${logCount}`,
              accessToken
            )
            const logJson = JSON.parse(logData)

            let logPath

            if (typeof logFile === 'string') {
              const currentDirPath = path.isAbsolute(logFile)
                ? ''
                : process.projectDir
              logPath = path.join(currentDirPath, logFile)
            } else {
              logPath = path.join(
                process.projectDir,
                `${jobPath.split('/').slice(-1).pop()}.log`
              )
            }

            let folderPath = logPath.split(path.sep)
            folderPath.pop()
            folderPath = folderPath.join(path.sep)

            if (!(await folderExists(folderPath))) {
              await createFolder(folderPath)
            }

            let logLines = parseLogLines(logJson)

            await createFile(logPath, logLines)

            if (!returnStatusOnly)
              displayResult(null, null, `Log saved to: ${logPath}`)
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
      if (!statusReturned) {
        switch (submittedJob.state) {
          case 'completed':
            result = 0
            console.log(result)
            break
          case 'warning':
            result = ignoreWarnings ? 0 : 1
            console.log(result)
            break
          case 'error':
            result = 2
            console.log(result)
            break
          default:
            break
        }

        statusReturned = true
      }
    }
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

export function getContextName(target, returnStatusOnly) {
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
  submittedJob,
  statusFile,
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
    folderPath = folderPath.join(path.sep)

    if (!(await folderExists(folderPath))) await createFolder(folderPath)

    await createFile(statusPath, status)
    if (displayStatusFilePath)
      displayResult(null, null, `Status saved to: ${statusPath}`)
  }
}

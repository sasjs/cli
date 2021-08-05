import SASjs, { PollOptions } from '@sasjs/adapter/node'
import { AuthConfig, Target } from '@sasjs/utils'
import { Command } from '../../../utils/command'
import { displayError, displaySuccess } from '../../../utils/displayResult'
import { millisecondsToDdHhMmSs } from '../../../utils/utils'
import { saveLog } from './saveLog'
import { isSessionStateError } from './isSessionStateError'
import { normalizeFilePath } from './normalizeFilePath'
import { parseJobDetails } from './parseJobDetails'
import { printError } from './printError'
import { generateFileName } from './generateFileName'

export const executeFlow = async (
  flow: any,
  sasjs: SASjs,
  pollOptions: PollOptions,
  target: Target,
  authConfig: AuthConfig,
  sendToCsv: Function
): Promise<{
  jobStatus: boolean
  flowStatus: { terminate: boolean; message: string }
}> => {
  const logFolder: string = pollOptions.logFolderPath as string
  const flowName = Object.keys(flow)[0]
  displaySuccess(`'${flowName}' flow started.`)

  let jobStatus = true,
    flowStatus = { terminate: false, message: '' }
  flow.execution = 'started'
  flow.jobs.forEach(async (job: any) => {
    const jobLocation: string = Command.prefixAppLoc(
      target.appLoc,
      job.location
    ) as string

    displaySuccess(`'${job.location}' has been submitted for execution.`)

    let logName: string = ''

    if (pollOptions.streamLog) {
      logName = `${logFolder}/${generateFileName(flowName, jobLocation)}`
    }

    let submittedJob: any = await sasjs
      .startComputeJob(
        jobLocation,
        null,
        {
          contextName: target.contextName
        },
        authConfig,
        true,
        pollOptions,
        true,
        job.macroVars
      )
      .catch(async (err: any) => {
        printError(job, flowName, err)

        if (typeof err === 'string' && isSessionStateError(err)) {
          flowStatus = { terminate: true, message: 'Flow has been terminated.' }
        }

        let logName = await saveLog(
          err.job ? (err.job.links ? err.job.links : []) : [],
          flowName,
          jobLocation,
          logFolder,
          sasjs,
          target.serverUrl,
          authConfig.access_token,
          1000000
        ).catch((err) => displayError(err, 'Error while saving log file.'))

        logName = logName ? `${logFolder}/${logName}` : ''

        await sendToCsv(
          jobLocation,
          'failure',
          err.message || '',
          logName
        ).catch((err: any) => displayError(err, 'Error while saving CSV file.'))

        job.status = 'failure'

        if (logName) {
          process.logger?.info(
            `Log file located at: ${normalizeFilePath(logName as string)}`
          )
        }

        if (
          flow.jobs.filter((j: any) => j.hasOwnProperty('status')).length ===
          flow.jobs.length
        ) {
          displayError({}, `'${flowName}' flow failed!`)
          jobStatus = false
        }
      })

    if (submittedJob && submittedJob.job) {
      submittedJob = submittedJob.job

      const details = parseJobDetails(submittedJob)

      // If the log was being streamed, it should already be present
      // at the specified log path
      if (!pollOptions.streamLog) {
        logName = (await saveLog(
          submittedJob.links,
          flowName,
          jobLocation,
          logFolder,
          sasjs,
          target.serverUrl,
          authConfig.access_token,
          details?.lineCount
        ).catch((err: any) => {
          displayError(err, 'Error while saving log file.')
        })) as string

        logName = logName ? `${logFolder}/${logName}` : ''
      }

      await sendToCsv(
        jobLocation,
        submittedJob.state || 'failure',
        details?.details,
        logName
      ).catch((err: any) => displayError(err, 'Error while saving CSV file.'))

      job.status =
        submittedJob.state === 'completed'
          ? 'success'
          : submittedJob.state || 'failure'

      if (job.status === 'success') {
        displaySuccess(
          `'${flowName}' flow's job located at: '${job.location}' completed.`
        )
      } else {
        displayError(
          {},
          `'${flowName}' flow's job located at: '${
            job.location
          }' failed with the status '${job.status}'.${
            job.status === 'running'
              ? ` Job had been aborted due to timeout(${millisecondsToDdHhMmSs(
                  pollOptions.maxPollCount * pollOptions.pollInterval
                )}).`
              : ''
          }`
        )
      }

      if (logName) {
        process.logger?.info(
          `Log file located at: ${normalizeFilePath(logName as string)}`
        )
      }

      if (
        flow.jobs.filter((j: any) => j.status === 'success').length ===
        flow.jobs.length
      ) {
        displaySuccess(`'${flowName}' flow completed successfully!`)
      } else if (
        flow.jobs.filter((j: any) => j.hasOwnProperty('status')).length ===
        flow.jobs.length
      ) {
        displayError({}, `'${flowName}' flow failed!`)
        jobStatus = false
      }
    }
  })
  flow.execution = 'finished'
  return { jobStatus, flowStatus }
}

import chalk from 'chalk'
import ora from 'ora'
import { displayResult } from '../utils/displayResult'

export async function execute(
  sasjs,
  accessToken,
  jobPath,
  target,
  waitForJob,
  showOutput
) {
  let result

  const startTime = new Date().getTime()

  const spinner = ora(
    `Job located at ${chalk.greenBright(
      jobPath
    )} has been submitted for execution...\n`
  )

  spinner.start()

  const submittedJob = await sasjs
    .startComputeJob(
      jobPath,
      null,
      { contextName: target.tgtDeployVars.contextName },
      accessToken,
      waitForJob
    )
    .catch((err) => {
      result = err

      displayResult(err, 'An error has occurred when executing a job.', null)
    })

  spinner.stop()

  const endTime = new Date().getTime()

  if (submittedJob && submittedJob.links) {
    result = true

    const sessionLink = submittedJob.links.find(
      (l) => l.method === 'GET' && l.rel === 'self'
    ).href

    displayResult(
      null,
      null,
      (waitForJob
        ? `Job located at '${jobPath}' has been executed.\nJob details`
        : `Job session`) + ` can be found at ${target.serverUrl + sessionLink}`
    )

    if (showOutput) {
      try {
        const output = JSON.stringify(submittedJob, null, 2)

        console.log(output)

        result = submittedJob
      } catch (error) {
        result = false

        displayResult(
          null,
          'An error has occurred when parsing an output of the job.',
          null
        )
      }
    }
  }

  console.log(
    chalk.whiteBright(
      `This operation took ${(endTime - startTime) / 1000} seconds`
    )
  )

  return result
}

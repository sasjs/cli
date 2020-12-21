import path from 'path'
import { displayResult } from '../../utils/displayResult'
import {
  fileExists,
  readFile,
  isJsonFile,
  isCsvFile,
  createFile,
  folderExists,
  createFolder
} from '../../utils/file'
import {
  generateTimestamp,
  parseLogLines,
  millisecondsToDdHhMmSs
} from '../../utils/utils'
import { getAccessToken } from '../../utils/config-utils'
import { Target } from '@sasjs/utils/types'
import SASjs from '@sasjs/adapter/node'
import stringify from 'csv-stringify'
import { setInterval } from 'timers'
import examples from './examples'

export async function execute(
  source: string,
  logFolder: string,
  csvFile: string,
  target: Target,
  prefixAppLoc: Function
) {
  return new Promise(async (resolve, reject) => {
    const pollOptions = { MAX_POLL_COUNT: 24 * 60 * 60, POLL_INTERVAL: 1000 }

    if (!source || !isJsonFile(source)) {
      return reject(
        `Please provide flow source (--source) file.\n${examples.command}`
      )
    }

    if (!(await fileExists(source))) {
      return reject(`Source file does not exist.\n${examples.command}`)
    }

    let sourceConfig = await readFile(source).catch((err) =>
      displayResult(err, 'Error while reading source file.')
    )

    try {
      sourceConfig = JSON.parse(sourceConfig)
    } catch (_) {
      return reject(examples.source)
    }

    let flows = sourceConfig.flows

    if (!flows) return reject(examples.source)

    const sasjs = new SASjs({
      serverUrl: target.serverUrl,
      appLoc: target.appLoc,
      serverType: target.serverType
    })
    const accessToken = await getAccessToken(target).catch((err) => {
      displayResult(err, 'Error while getting access token.')
      throw err
    })

    if (csvFile) {
      if (!isCsvFile(csvFile)) {
        return reject(
          `Please provide csv file location (--csvFile).\n${examples.command}`
        )
      }

      await createFile(csvFile, '').catch((err) =>
        displayResult(err, 'Error while creating CSV file.')
      )
    }

    if (logFolder && !(await folderExists(logFolder))) {
      await createFolder(logFolder).catch((err) =>
        displayResult(err, 'Error while creating log folder file.')
      )
    }

    const contextName = target.contextName

    displayResult(
      null,
      null,
      `Executing flow for '${target.name}' target with app location '${target.appLoc}':`
    )

    await Object.keys(flows).forEach((flowName) => {
      const flow = flows[flowName]

      if (!flow.jobs || !Array.isArray(flow.jobs))
        return reject(examples.source)

      if (!flow.predecessors || flow.predecessors.length === 0) {
        flow.jobs.forEach(async (job: any) => {
          const jobLocation = prefixAppLoc(target.appLoc, job.location)

          let submittedJob: any = await sasjs
            .startComputeJob(
              jobLocation,
              null,
              {
                contextName: contextName
              },
              accessToken,
              true,
              pollOptions
            )
            .catch(async (err: any) => {
              const logName = await saveLog(
                target,
                logFolder,
                sasjs,
                accessToken,
                err.job ? (err.job.links ? err.job.links : []) : [],
                flowName,
                jobLocation
              ).catch((err) =>
                displayResult(err, 'Error while saving log file.')
              )

              await saveToCsv(
                flowName,
                ['none'],
                jobLocation,
                'failure',
                err.message || '',
                logName ? path.join(logFolder, logName as string) : ''
              ).catch((err) =>
                displayResult(err, 'Error while saving CSV file.')
              )

              job.status = 'failure'

              displayResult(
                {},
                `An error has occurred when executing '${flowName}' flow's job located at: '${job.location}'.`,
                null
              )

              if (
                flow.jobs.filter((j: any) => j.hasOwnProperty('status'))
                  .length === flow.jobs.length
              ) {
                displayResult({}, `'${flowName}' flow failed!`)

                failAllSuccessors(flowName)

                isFlowsCompleted()
              }
            })

          if (submittedJob && submittedJob.job) {
            submittedJob = submittedJob.job

            const details = parseJobDetails(submittedJob)

            const logName = await saveLog(
              target,
              logFolder,
              sasjs,
              accessToken,
              submittedJob.links,
              flowName,
              jobLocation,
              details!.lineCount
            ).catch((err: any) =>
              displayResult(err, 'Error while saving log file.')
            )

            await saveToCsv(
              flowName,
              ['none'],
              jobLocation,
              submittedJob.state || 'failure',
              details?.details,
              logName ? path.join(logFolder, logName as string) : ''
            ).catch((err) => displayResult(err, 'Error while saving CSV file.'))

            job.status =
              submittedJob.state === 'completed'
                ? 'success'
                : submittedJob.state || 'failure'

            if (job.status === 'success') {
              displayResult(
                null,
                null,
                `'${flowName}' flow's job located at: '${job.location}' completed.`
              )
            } else {
              displayResult(
                {},
                `'${flowName}' flow's job located at: '${
                  job.location
                }' failed with the status '${job.status}'.${
                  job.status === 'running'
                    ? ` Job had been aborted due to timeout(${millisecondsToDdHhMmSs(
                        pollOptions.MAX_POLL_COUNT * pollOptions.POLL_INTERVAL
                      )}).`
                    : ''
                }`
              )
            }

            if (
              flow.jobs.filter((j: any) => j.status === 'success').length ===
              flow.jobs.length
            ) {
              displayResult(
                null,
                null,
                `'${flowName}' flow completed successfully!`
              )

              isFlowsCompleted()

              checkPredecessors(flow, flowName)
            } else if (
              flow.jobs.filter((j: any) => j.hasOwnProperty('status'))
                .length === flow.jobs.length
            ) {
              displayResult({}, `'${flowName}' flow failed!`)

              failAllSuccessors(flowName)

              isFlowsCompleted()
            }
          }
        })
      } else {
        flow.predecessors.forEach((predecessor: any) => {
          if (!Object.keys(flows).includes(predecessor)) {
            displayResult(
              {},
              `Predecessor '${predecessor}' mentioned in '${flowName}' flow does not exist.`
            )
          } else if (predecessor === flowName) {
            displayResult(
              {},
              `Predecessor '${predecessor}' mentioned in '${flowName}' cannot point to itself.`
            )
          }
        })
      }
    })

    const failAllSuccessors = (flowName: string) => {
      const successors = Object.keys(flows).filter(
        (flow: any) =>
          flows[flow].predecessors &&
          flows[flow].predecessors.includes(flowName)
      )

      successors.forEach((successor: any) => {
        flows[successor].jobs.map((job: any) => (job.status = 'failure'))
      })
    }

    const isFlowsCompleted = () => {
      const flowNames = Object.keys(flows)

      let jobsCount = 0
      let jobsWithSuccessStatus = 0
      let jobsWithNotSuccessStatus = 0

      flowNames.map((name) => (jobsCount += flows[name].jobs.length))
      flowNames.map(
        (name) =>
          (jobsWithSuccessStatus += flows[name].jobs.filter(
            (job: any) => job.status && job.status === 'success'
          ).length)
      )
      flowNames.map(
        (name) =>
          (jobsWithNotSuccessStatus += flows[name].jobs.filter(
            (job: any) => job.status && job.status !== 'success'
          ).length)
      )

      if (jobsCount === jobsWithSuccessStatus) resolve(true)
      if (jobsCount === jobsWithNotSuccessStatus) resolve(false)
      if (jobsCount === jobsWithSuccessStatus + jobsWithNotSuccessStatus) {
        resolve(false)
      }
    }

    let csvFileAbleToSave = true

    // REFACTOR: move to utility
    const saveToCsv = async (
      flowName: string,
      predecessors: any,
      location: string,
      status: string,
      details = '',
      logName = ''
    ) => {
      return new Promise(async (resolve, reject) => {
        if (!csvFile) reject('No csvFile provided.')

        const timerId = setInterval(async () => {
          if (csvFileAbleToSave) {
            csvFileAbleToSave = false

            let csvData = await readFile(csvFile).catch((err) =>
              displayResult(err, 'Error while reading CSV file.')
            )

            if (typeof csvData === 'string') {
              csvData = csvData
                .split('\n')
                .filter((row) => row.length)
                .map((data) => data.split(','))
            }

            const columns = {
              id: 'id',
              flow: 'Flow',
              predecessors: 'Predecessors',
              name: 'Location',
              status: 'Status',
              logLocation: 'Log location',
              details: 'Details'
            }

            const id = csvData.length === 0 ? 1 : csvData.length

            const data = [
              id,
              flowName,
              predecessors.join(' | '),
              location,
              status,
              logName,
              details
            ]

            csvData.push(data)

            stringify(
              csvData,
              { header: csvData.length === 1, columns: columns },
              async (err, output) => {
                if (err) reject(err)

                await createFile(csvFile, output).catch((err) =>
                  displayResult(err, 'Error while creating CSV file.')
                )

                csvFileAbleToSave = true

                clearInterval(timerId)

                resolve(true)
              }
            )
          }
        }, 100)
      })
    }

    const checkPredecessors = (flow: any, flowName: any) => {
      const successors = Object.keys(flows)
        .filter(
          (name) =>
            flows[name].predecessors &&
            flows[name].predecessors.includes(flowName)
        )
        .filter((name) => name !== flowName)

      successors.forEach((successor) => {
        const flowPredecessors = flows[successor].predecessors

        if (flowPredecessors.length > 1) {
          const successFullPredecessors = flowPredecessors.map(
            (flPred: any) =>
              flows[flPred].jobs.length ===
              flows[flPred].jobs.filter((j: any) => j.status === 'success')
                .length
          )

          if (successFullPredecessors.includes(false)) return
        }

        flows[successor].jobs.forEach((job: any) => {
          const jobLocation = prefixAppLoc(target.appLoc, job.location)

          sasjs
            .startComputeJob(
              jobLocation,
              null,
              {
                contextName: contextName
              },
              accessToken,
              true,
              pollOptions
            )
            .then(async (res: any) => {
              if (res && res.job) {
                res = res.job

                const details = parseJobDetails(res)

                const logName = await saveLog(
                  target,
                  logFolder,
                  sasjs,
                  accessToken,
                  res.links,
                  successor,
                  jobLocation,
                  details?.lineCount
                ).catch((err: any) => {
                  displayResult(err, 'Error while saving log file.')
                })

                await saveToCsv(
                  successor,
                  flows[successor].predecessors || ['none'],
                  jobLocation,
                  res.state || 'failure',
                  details?.details,
                  logName ? path.join(logFolder, logName as string) : ''
                ).catch((err) =>
                  displayResult(err, 'Error while saving CSV file.')
                )

                job.status =
                  res.state === 'completed' ? 'success' : res.state || 'failure'

                if (job.status === 'success') {
                  displayResult(
                    null,
                    null,
                    `'${successor}' flow's job located at: '${job.location}' completed.`
                  )
                } else {
                  displayResult(
                    {},
                    `'${successor}' flow's job located at: '${
                      job.location
                    }' failed with the status '${job.status}'.${
                      job.status === 'running'
                        ? ` Job had been aborted due to timeout(${millisecondsToDdHhMmSs(
                            pollOptions.MAX_POLL_COUNT *
                              pollOptions.POLL_INTERVAL
                          )}).`
                        : ''
                    }`
                  )
                }

                if (
                  flows[successor].jobs.filter(
                    (j: any) => j.status === 'success'
                  ).length === flows[successor].jobs.length
                ) {
                  displayResult(
                    null,
                    null,
                    `'${successor}' flow completed successfully!`
                  )

                  isFlowsCompleted()
                } else if (
                  flows[successor].jobs.filter((j: any) =>
                    j.hasOwnProperty('status')
                  ).length === flows[successor].jobs.length
                ) {
                  displayResult({}, `'${successor}' flow failed!`)

                  failAllSuccessors(successor)

                  isFlowsCompleted()
                }

                const allJobs = Object.keys(flows)
                  .map((key) => flows[key].jobs)
                  .reduce((acc, val) => acc.concat(val), [])
                const allJobsWithStatus = Object.keys(flows)
                  .map((key) =>
                    flows[key].jobs.filter((job: any) =>
                      job.hasOwnProperty('status')
                    )
                  )
                  .reduce((acc, val) => acc.concat(val), [])

                if (allJobs.length === allJobsWithStatus.length)
                  isFlowsCompleted()

                if (
                  flows[successor].jobs.filter(
                    (j: any) => j.status === 'success'
                  ).length === flows[successor].jobs.length
                ) {
                  checkPredecessors(flows[successor], successor)
                }
              }
            })
            .catch(async (err: any) => {
              const logName = await saveLog(
                target,
                logFolder,
                sasjs,
                accessToken,
                err.job ? (err.job.links ? err.job.links : []) : [],
                successor,
                jobLocation
              ).catch((err) =>
                displayResult(err, 'Error while saving log file.')
              )

              await saveToCsv(
                successor,
                flows[successor].predecessors || ['none'],
                jobLocation,
                'failure',
                err.message || '',
                logName ? path.join(logFolder, logName as string) : ''
              ).catch((err) =>
                displayResult(err, 'Error while saving CSV file.')
              )

              job.status = 'failure'

              displayResult(
                {},
                `An error has occurred when executing '${successor}' flow's job located at: '${job.location}'.`,
                null
              )

              if (
                flows[successor].jobs.filter((j: any) =>
                  j.hasOwnProperty('status')
                ).length === flows[successor].jobs.length
              ) {
                displayResult({}, `'${successor}' flow failed!`)

                failAllSuccessors(successor)

                isFlowsCompleted()
              }
            })
        })
      })
    }
  })
}

const parseJobDetails = (response: any) => {
  if (!response) return

  let details = ''

  const concatDetails = (data: any, title: string) => {
    if (data)
      details = details.concat(
        details.length ? ' | ' : '',
        `${title}: ${Object.keys(data)
          .map((key) => `${key}: ${data[key]}`)
          .join('; ')}}`
      )
  }

  concatDetails(response.statistics, 'Statistics')
  concatDetails(response.listingStatistics, 'Listing Statistics')
  concatDetails(response.logStatistics, 'Log Statistics')

  let lineCount = 1000000

  if (response.logStatistics && response.logStatistics.lineCount) {
    lineCount = parseInt(response.logStatistics.lineCount)
  }

  return { details, lineCount }
}

// REFACTOR: move to utility
const saveLog = async (
  target: Target,
  logFolder: string,
  sasjs: SASjs,
  accessToken: string | undefined,
  links: any[],
  flowName: string,
  jobLocation: string,
  lineCount: number = 1000000
) => {
  return new Promise(async (resolve, reject) => {
    if (!logFolder) return reject('No log folder provided')
    if (!links) return reject('No links provided')

    const logObj = links.find(
      (link: any) => link.rel === 'log' && link.method === 'GET'
    )

    if (logObj) {
      const logUrl = target.serverUrl + logObj.href + `?limit=${lineCount}`
      const logData = await sasjs
        .fetchLogFileContent(logUrl, accessToken)
        .catch((err) => displayResult(err, 'Error while fetching log content.'))
      const logJson = JSON.parse(logData as string)

      const logParsed = parseLogLines(logJson)

      const generateFileName = () =>
        `${flowName}_${jobLocation.replace(
          /\W/g,
          '_'
        )}_${generateTimestamp()}.log`

      let logName = generateFileName()

      while (await fileExists(path.join(logFolder, logName))) {
        logName = generateFileName()
      }

      await createFile(path.join(logFolder, logName), logParsed).catch((err) =>
        displayResult(err, 'Error while creating log file.')
      )

      return resolve(logName)
    }

    return resolve(null)
  })
}

import path from 'path'
import { displayResult } from '../../utils/displayResult'
import {
  fileExists,
  readFile,
  isJsonFile,
  isCsvFile,
  createFile,
  writeFile,
  folderExists,
  createFolder
} from '../../utils/file-utils'
import {
  generateTimestamp,
  parseLogLines,
  millisecondsToDdHhMmSs,
  asyncForEach
} from '../../utils/utils'
import { getAccessToken } from '../../utils/config-utils'
import { Target } from '../../types'
import SASjs from '@sasjs/adapter/node'
import stringify from 'csv-stringify'
import { setInterval } from 'timers'
import examples from './examples'

// TODO: handle cases when job wasn't found
export async function execute(
  source: string,
  logFolder: string,
  csvFile: string,
  target: Target,
  prefixAppLoc: Function
) {
  return new Promise(async (resolve, reject) => {
    const commandExample = `sasjs flow execute --source /local/flow.json --logFolder /local/log/folder --csvFile /local/some.csv --target targetName`
    const pollOptions = { MAX_POLL_COUNT: 24 * 60 * 60, POLL_INTERVAL: 1000 }

    if (!source || !isJsonFile(source)) {
      displayResult(
        {},
        `Please provide flow source (--source) file.\nCommand example: ${commandExample}`
      )

      reject(false)
    }

    if (!(await fileExists(source))) {
      displayResult(
        true,
        `Source file does not exist.\nCommand example: ${commandExample}`
      )

      reject(false)
    }

    let sourceConfig = await readFile(source)

    try {
      sourceConfig = JSON.parse(sourceConfig)
    } catch (error) {
      throw `Invalid json file.`
    }

    let flows = sourceConfig.flows

    if (!flows) {
      displayResult(
        true,
        `Source file is not valid. Source file example:${examples.source}`
      )

      reject(false)
    }

    const sasjs = new SASjs({
      serverUrl: target.serverUrl,
      appLoc: target.appLoc,
      serverType: target.serverType
    })
    const accessToken = await getAccessToken(target).catch((err) => {
      displayResult(err)
    })

    if (csvFile) {
      if (!isCsvFile(csvFile)) {
        displayResult(
          {},
          `Please provide csv file location (--csvFile).\nCommand example: ${commandExample}`
        )

        reject(false)
      }

      await createFile(csvFile, '')
    }

    if (logFolder && !(await folderExists(logFolder))) {
      await createFolder(logFolder)
    }

    const defaultContextName = 'SAS Job Execution compute context'
    const contextName = target.tgtDeployVars
      ? target.tgtDeployVars.contextName
        ? target.tgtDeployVars.contextName
        : defaultContextName
      : defaultContextName

    displayResult(
      null,
      null,
      `Executing flow for '${target.name}' target with app location '${target.appLoc}':`
    )

    await Object.keys(flows).forEach((flowName) => {
      const flow = flows[flowName]

      if (!flow.jobs || !Array.isArray(flow.jobs)) reject(false)

      if (!flow.predecessors || flow.predecessors.length === 0) {
        flow.jobs.forEach(async (job: any) => {
          const jobLocation = prefixAppLoc(target.appLoc, job.location)

          const submittedJob: any = await sasjs
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
                err.job ? (err.job.links ? err.job.links : []) : [],
                flowName,
                jobLocation
              )

              await saveToCsv(
                flowName,
                ['none'],
                jobLocation,
                'failure',
                err.message || '',
                logName ? path.join(logFolder, logName as string) : ''
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

          if (submittedJob) {
            let details = parseJobDetails(submittedJob)

            const logName = await saveLog(
              submittedJob.links,
              flowName,
              jobLocation
            ).catch((err: any) =>
              displayResult(err, 'Error while saving log file.')
            )

            await saveToCsv(
              flowName,
              ['none'],
              jobLocation,
              submittedJob.state || 'failure',
              details,
              logName ? path.join(logFolder, logName as string) : ''
            )

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
                  job.status === 'running' &&
                  ` Job had been aborted due to timeout(${millisecondsToDdHhMmSs(
                    pollOptions.MAX_POLL_COUNT * pollOptions.POLL_INTERVAL
                  )}).`
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
      if (jobsCount === jobsWithSuccessStatus + jobsWithNotSuccessStatus)
        resolve(false)
    }

    const saveLog = async (
      links: any[],
      flowName: string,
      jobLocation: string
    ) => {
      return new Promise(async (resolve, reject) => {
        if (!logFolder) reject('No log folder provided')

        const logObj = links.find(
          (link: any) => link.rel === 'log' && link.method === 'GET'
        )

        if (logObj) {
          const logUrl = target.serverUrl + logObj.href
          const logData = await sasjs.fetchLogFileContent(logUrl, accessToken)
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

          await createFile(path.join(logFolder, logName), logParsed)

          resolve(logName)
        }

        resolve(null)
      })
    }

    let csvFileAbleToSave = true

    const saveToCsv = async (
      flowName: string,
      predecessors: any,
      location: string,
      status: string,
      details = '',
      logName = ''
    ) => {
      return new Promise(async (resolve, reject) => {
        if (!csvFile) reject()

        const timerId = setInterval(async () => {
          if (csvFileAbleToSave) {
            csvFileAbleToSave = false

            let csvData = await readFile(csvFile)

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
                if (err) throw err // FIXME

                await writeFile(csvFile, output)

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

          // if (successFullPredecessors.includes(false)) reject(false)
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
              if (res) {
                let details = parseJobDetails(res)

                const logName = await saveLog(
                  res.links,
                  successor,
                  jobLocation
                ).catch((err: any) => console.log(`[err]`, err))

                await saveToCsv(
                  successor,
                  flows[successor].predecessors || ['none'],
                  jobLocation,
                  res.state || 'failure',
                  details,
                  logName ? path.join(logFolder, logName as string) : ''
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
                      job.status === 'running' &&
                      ` Job had been aborted due to timeout(${millisecondsToDdHhMmSs(
                        pollOptions.MAX_POLL_COUNT * pollOptions.POLL_INTERVAL
                      )}).`
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
                err.job ? (err.job.links ? err.job.links : []) : [],
                successor,
                jobLocation
              )

              await saveToCsv(
                successor,
                flows[successor].predecessors || ['none'],
                jobLocation,
                'failure',
                err.message || '',
                logName ? path.join(logFolder, logName as string) : ''
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

  return details
}

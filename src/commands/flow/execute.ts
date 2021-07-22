import path from 'path'
import { displayError, displaySuccess } from '../../utils/displayResult'
import { isJsonFile, isCsvFile, saveToDefaultLocation } from '../../utils/file'
import { parseLogLines, millisecondsToDdHhMmSs } from '../../utils/utils'
import { getAuthConfig } from '../../utils/config'
import {
  Target,
  generateTimestamp,
  fileExists,
  readFile,
  createFile,
  folderExists,
  createFolder,
  getRealPath
} from '@sasjs/utils'
import SASjs, { PollOptions } from '@sasjs/adapter/node'
import stringify from 'csv-stringify'
import examples from './examples'
import { FilePath, Flow } from '../../types'
import { fetchLogFileContent } from '../shared/fetchLogFileContent'

export async function execute(
  source: string,
  logFolder: string,
  csvFile: string,
  target: Target,
  prefixAppLoc: Function,
  streamLog: boolean,
  sasjs: SASjs
) {
  return new Promise(async (resolve, reject) => {
    const pollOptions: PollOptions = {
      maxPollCount: 24 * 60 * 60,
      pollInterval: 1000,
      streamLog,
      logFolderPath: logFolder
    }

    const normalizeFilePath = (filePath: string) => {
      const pathSepRegExp = new RegExp(path.sep.replace(/\\/g, '\\\\'), 'g')

      return getRealPath(filePath).replace(pathSepRegExp, '/')
    }
    let defaultCsvLoc: FilePath

    const logger = process.logger

    const isSessionStateError = (err: string) =>
      err.includes('Could not get session state')

    const printError = (
      job: { location: string },
      flowName: string,
      err: { name?: string; message?: string } | string
    ) => {
      logger?.error(
        `An error has occurred when executing '${flowName}' flow's job located at: '${
          job.location
        }'. ${
          typeof err === 'object'
            ? err?.name === 'NotFoundError'
              ? 'Job was not found.'
              : err?.message || ''
            : '\n' + err
        }`
      )

      if (typeof err === 'string' && isSessionStateError(err)) {
        process.exit(2)
      }
    }

    if (!source || !isJsonFile(source)) {
      return reject(
        `Please provide flow source (--source) file.\n${examples.command}`
      )
    }

    if (
      !(await fileExists(source).catch((err) =>
        displayError(err, 'Error while checking if source file exists.')
      ))
    ) {
      return reject(`Source file does not exist.\n${examples.command}`)
    }

    const sourceContent = (await readFile(source).catch((err) =>
      displayError(err, 'Error while reading source file.')
    )) as string

    let sourceConfig: Flow

    try {
      sourceConfig = JSON.parse(sourceContent)
    } catch (_) {
      return reject(examples.source)
    }

    let flows = sourceConfig?.flows

    if (!flows) return reject(examples.source)

    const authConfig = await getAuthConfig(target).catch((err) => {
      displayError(err, 'Error while getting access token.')
      throw err
    })

    const defaultCsvFileName = 'flowResults.csv'

    if (csvFile) {
      if (csvFile.includes('.')) {
        if (!isCsvFile(csvFile)) {
          return reject(
            `Please provide csv file location (--csvFile).\n${examples.command}`
          )
        }
      } else {
        csvFile = path.join(csvFile, defaultCsvFileName)
      }

      await createFile(csvFile, '').catch((err) =>
        displayError(err, 'Error while creating CSV file.')
      )
    } else {
      defaultCsvLoc = await saveToDefaultLocation(defaultCsvFileName, '')

      csvFile = defaultCsvLoc.relativePath
    }

    if (
      logFolder &&
      !(await folderExists(logFolder).catch((err) =>
        displayError(err, 'Error while checking if log folder exists.')
      ))
    ) {
      await createFolder(logFolder).catch((err) =>
        displayError(err, 'Error while creating log folder file.')
      )
    }

    const contextName = target.contextName

    logger?.info(
      `Executing flow for '${target.name}' target with app location '${target.appLoc}':`
    )

    await Object.keys(flows).forEach((flowName) => {
      const flow = flows[flowName]

      if (!flow.jobs || !Array.isArray(flow.jobs))
        return reject(examples.source)

      if (!flow.predecessors || flow.predecessors.length === 0) {
        displaySuccess(`'${flowName}' flow started.`)

        flow.jobs.forEach(async (job: any) => {
          const jobLocation = prefixAppLoc(target.appLoc, job.location)

          displaySuccess(`'${job.location}' has been submitted for execution.`)

          let submittedJob: any = await sasjs
            .startComputeJob(
              jobLocation,
              null,
              {
                contextName: contextName
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
                return reject('Flow has been terminated.')
              }

              let logName = await saveLog(
                err.job ? (err.job.links ? err.job.links : []) : [],
                flowName,
                jobLocation,
                1000000
              ).catch((err) =>
                displayError(err, 'Error while saving log file.')
              )

              logName = logName ? `${logFolder}/${logName}` : ''

              await saveToCsv(
                flowName,
                ['none'],
                jobLocation,
                'failure',
                err.message || '',
                logName as string
              ).catch((err) =>
                displayError(err, 'Error while saving CSV file.')
              )

              job.status = 'failure'

              if (logName) {
                logger?.info(
                  `Log file located at: ${normalizeFilePath(logName as string)}`
                )
              }

              if (
                flow.jobs.filter((j: any) => j.hasOwnProperty('status'))
                  .length === flow.jobs.length
              ) {
                displayError({}, `'${flowName}' flow failed!`)

                failAllSuccessors(flowName)

                isFlowsCompleted()
              }
            })

          if (submittedJob && submittedJob.job) {
            submittedJob = submittedJob.job

            const details = parseJobDetails(submittedJob)

            let logName = await saveLog(
              submittedJob.links,
              flowName,
              jobLocation,
              details!.lineCount
            ).catch((err: any) =>
              displayError(err, 'Error while saving log file.')
            )

            logName = logName ? `${logFolder}/${logName}` : ''

            await saveToCsv(
              flowName,
              ['none'],
              jobLocation,
              submittedJob.state || 'failure',
              details?.details,
              logName as string
            ).catch((err) => displayError(err, 'Error while saving CSV file.'))

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
              logger?.info(
                `Log file located at: ${normalizeFilePath(logName as string)}`
              )
            }

            if (
              flow.jobs.filter((j: any) => j.status === 'success').length ===
              flow.jobs.length
            ) {
              displaySuccess(`'${flowName}' flow completed successfully!`)

              isFlowsCompleted()

              checkPredecessors(flow, flowName)
            } else if (
              flow.jobs.filter((j: any) => j.hasOwnProperty('status'))
                .length === flow.jobs.length
            ) {
              displayError({}, `'${flowName}' flow failed!`)

              failAllSuccessors(flowName)

              isFlowsCompleted()
            }
          }
        })
      } else {
        flow.predecessors.forEach((predecessor: any) => {
          if (!Object.keys(flows).includes(predecessor)) {
            displayError(
              {},
              `Predecessor '${predecessor}' mentioned in '${flowName}' flow does not exist.`
            )
          } else if (predecessor === flowName) {
            displayError(
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
          flows[flow].predecessors?.includes(flowName)
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

      if (jobsCount === jobsWithSuccessStatus)
        resolve(defaultCsvLoc?.absolutePath || getRealPath(csvFile))
      if (jobsCount === jobsWithNotSuccessStatus) resolve(false)
      if (jobsCount === jobsWithSuccessStatus + jobsWithNotSuccessStatus) {
        resolve(false)
      }
    }

    // REFACTOR: move to utility
    const saveLog = async (
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
          const logUrl = target.serverUrl + logObj.href

          const logJson = await fetchLogFileContent(
            sasjs,
            authConfig.access_token,
            logUrl,
            lineCount
          ).catch((err) => Promise.reject(err))

          const logParsed = parseLogLines(logJson)

          let logName = generateFileName(flowName, jobLocation)

          while (
            await fileExists(path.join(logFolder, logName)).catch((err) =>
              displayError(err, 'Error while checking if log file exists.')
            )
          ) {
            logName = generateFileName(flowName, jobLocation)
          }

          await createFile(path.join(logFolder, logName), logParsed).catch(
            (err) => displayError(err, 'Error while creating log file.')
          )

          return resolve(logName)
        }

        return resolve(null)
      })
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

            const csvFileRealPath = defaultCsvLoc?.absolutePath || csvFile

            if (
              !(await fileExists(csvFileRealPath).catch((err) =>
                displayError(err, 'Error while checking if csv file exists.')
              ))
            ) {
              await createFile(getRealPath(csvFileRealPath), '').catch((err) =>
                displayError(err, 'Error while creating CSV file.')
              )
            }

            let csvContent = await readFile(csvFileRealPath).catch((err) => {
              displayError(err, 'Error while reading CSV file.')

              return ''
            })

            let csvData = csvContent
              .split('\n')
              .filter((row) => row.length)
              .map((data) => data.split(','))

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

                await createFile(csvFileRealPath, output).catch((err) =>
                  displayError(err, 'Error while creating CSV file.')
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
            flows[name].predecessors?.includes(flowName)
        )
        .filter((name) => name !== flowName)

      successors.forEach((successor) => {
        const flowPredecessors = flows[successor].predecessors

        if (flowPredecessors && flowPredecessors.length > 1) {
          const successFullPredecessors = flowPredecessors.map(
            (flPred: any) =>
              flows[flPred].jobs.length ===
              flows[flPred].jobs.filter((j: any) => j.status === 'success')
                .length
          )

          if (successFullPredecessors.includes(false)) return
        }

        displaySuccess(`'${successor}' flow started.`)

        flows[successor].jobs.forEach((job: any) => {
          const jobLocation = prefixAppLoc(target.appLoc, job.location)

          displaySuccess(`'${job.location}' has been submitted for execution.`)

          let logName: string

          if (pollOptions.streamLog) {
            logName = `${logFolder}/${generateFileName(flowName, jobLocation)}`
          }

          sasjs
            .startComputeJob(
              jobLocation,
              null,
              {
                contextName: contextName
              },
              authConfig,
              true,
              pollOptions,
              true
            )
            .then(async (res: any) => {
              if (res && res.job) {
                res = res.job

                const details = parseJobDetails(res)

                // If the log was being streamed, it should already be present
                // at the specified log path
                if (!pollOptions.streamLog) {
                  logName = (await saveLog(
                    res.links,
                    successor,
                    jobLocation,
                    details?.lineCount
                  ).catch((err: any) => {
                    displayError(err, 'Error while saving log file.')
                  })) as string

                  logName = logName ? `${logFolder}/${logName}` : ''
                }

                await saveToCsv(
                  successor,
                  flows[successor].predecessors || ['none'],
                  jobLocation,
                  res.state || 'failure',
                  details?.details,
                  logName as string
                ).catch((err) =>
                  displayError(err, 'Error while saving CSV file.')
                )

                job.status =
                  res.state === 'completed' ? 'success' : res.state || 'failure'

                if (job.status === 'success') {
                  displaySuccess(
                    `'${successor}' flow's job located at: '${job.location}' completed.`
                  )
                } else {
                  displayError(
                    {},
                    `'${successor}' flow's job located at: '${
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
                  logger?.info(
                    `Log file located at: ${normalizeFilePath(
                      logName as string
                    )}`
                  )
                }

                if (
                  flows[successor].jobs.filter(
                    (j: any) => j.status === 'success'
                  ).length === flows[successor].jobs.length
                ) {
                  displaySuccess(`'${successor}' flow completed successfully!`)

                  isFlowsCompleted()
                } else if (
                  flows[successor].jobs.filter((j: any) =>
                    j.hasOwnProperty('status')
                  ).length === flows[successor].jobs.length
                ) {
                  displayError({}, `'${successor}' flow failed!`)

                  failAllSuccessors(successor)

                  isFlowsCompleted()
                }

                const allJobs = Object.keys(flows)
                  .map((key) => flows[key].jobs)
                  .reduce((acc, val) => acc.concat(val as any), [])
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
              printError(job, flowName, err)

              if (typeof err === 'string' && isSessionStateError(err)) {
                return reject('Flow has been terminated.')
              }

              let logName = await saveLog(
                err.job ? (err.job.links ? err.job.links : []) : [],
                successor,
                jobLocation,
                1000000
              ).catch((err) =>
                displayError(err, 'Error while saving log file.')
              )

              logName = logName ? `${logFolder}/${logName}` : ''

              await saveToCsv(
                successor,
                flows[successor].predecessors || ['none'],
                jobLocation,
                'failure',
                err.message || '',
                logName as string
              ).catch((err) =>
                displayError(err, 'Error while saving CSV file.')
              )

              job.status = 'failure'

              if (logName) {
                logger?.info(
                  `Log file located at: ${normalizeFilePath(logName as string)}`
                )
              }

              if (
                flows[successor].jobs.filter((j: any) =>
                  j.hasOwnProperty('status')
                ).length === flows[successor].jobs.length
              ) {
                displayError({}, `'${successor}' flow failed!`)

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
          .join('; ')}`
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

const generateFileName = (flowName: string, jobLocation: string) =>
  `${flowName}_${jobLocation
    .split('/')
    .splice(-1, 1)
    .join('')
    .replace(/\W/g, '_')}_${generateTimestamp('_')}.log`

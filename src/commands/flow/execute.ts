import { displayResult } from '../../utils/displayResult'
import {
  fileExists,
  readFile,
  isJsonFile,
  isCsvFile,
  createFile,
  writeFile
} from '../../utils/file-utils'
import { getAccessToken } from '../../utils/config-utils'
import { Target } from '../../types'
import SASjs from '@sasjs/adapter/node'
import stringify from 'csv-stringify'
import { setInterval } from 'timers'

// TODO: check if 'lf' alias is working
export async function execute(
  source: string,
  logFolder: string,
  csvFile: string,
  target: Target,
  prefixAppLoc: Function
) {
  const commandExample = `sasjs flow execute --source /local/flow.json --logFolder /local/log/folder --csvFile /local/some.csv --target targetName`

  if (!source || !isJsonFile(source)) {
    displayResult(
      {},
      `Please provide flow source (--source) file.\nCommand example: ${commandExample}`
    )

    return false
  }

  if (!(await fileExists(source))) {
    displayResult(
      true,
      `Source file does not exist.\nCommand example: ${commandExample}`
    )

    return false
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
      `Source file is not valid. Source file example:
{
  "name": "myAmazingFlow",
  "flows": {
    "firstFlow": {
      "jobs": [
        {
          "location": "/Projects/job1"
        },
        {
          "location": "/Projects/job2"
        },
        {
          "location": "/Projects/job3"
        }
      ],
      "predecessors": []
    },
    "secondFlow": {
      "jobs": [
        {
          "location": "/Projects/job11"
        }
      ],
      "predecessors": [
        "firstFlow"
      ]
    },
    "anotherFlow": {
      "jobs": [
        {
          "location": "/Public/job15"
        }
      ],
      "predecessors": [
        "firstFlow",
        "secondFlow"
      ]
    },
    "yetAnotherFlow": {
      "jobs": [
        {
          "location": "/Public/job115"
        }
      ],
      "predecessors": []
    }
  }
}`
    )

    return false
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
    }

    if (!(await fileExists(csvFile))) {
      await createFile(csvFile, '')
    }
  }

  Object.keys(flows).forEach((flowName) => {
    const flow = flows[flowName]

    if (!flow.jobs || !Array.isArray(flow.jobs)) return

    if (!flow.predecessors || flow.predecessors.length === 0) {
      flow.jobs.forEach((job: any) => {
        sasjs
          .startComputeJob(
            prefixAppLoc(target.appLoc, job.location),
            null,
            {
              contextName: target.tgtDeployVars.contextName
            },
            accessToken,
            true
          )
          .then(async (res: any) => {
            if (res) {
              let details = parseJobDetails(res)

              job.status = res.state === 'completed' ? 'success' : 'failure'

              await saveToCsv(
                csvFile,
                flowName,
                ['none'],
                job.location,
                res.state || 'failure',
                details
              )

              displayResult(
                null,
                null,
                `'${flowName}' flow's job located at: '${job.location}' completed.`
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

              checkPredecessors(
                sasjs,
                flows,
                flow,
                flowName,
                prefixAppLoc,
                target,
                accessToken,
                csvFile
              )
            } else if (
              flow.jobs.filter((j: any) => j.hasOwnProperty('status'))
                .length === flow.jobs.length
            ) {
              displayResult({}, `'${flowName}' flow failed!`)
            }
          })
          .catch(async (err: { message: string | undefined }) => {
            job.status = 'failure'

            await saveToCsv(
              csvFile,
              flowName,
              ['none'],
              job.location,
              'failure',
              err.message || ''
            )

            displayResult(
              err,
              `An error has occurred when executing '${flowName}' flow's job located at: '${job.location}'.`,
              null
            )

            if (
              flow.jobs.filter((j: any) => j.hasOwnProperty('status'))
                .length === flow.jobs.length
            ) {
              displayResult({}, `'${flowName}' flow failed!`)
            }
          })
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
}

let csvFileAbleToSave = true

const saveToCsv = async (
  csvFile: string,
  flowName: string,
  predecessors: any,
  location: string,
  status: string,
  details = ''
) => {
  const timerId = setInterval(async () => {
    if (csvFileAbleToSave) {
      csvFileAbleToSave = false
      if (!csvFile) return

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
        details: 'Details'
      }

      const id = csvData.length === 0 ? 1 : csvData.length

      const data = [
        id,
        flowName,
        predecessors.join(' | '),
        location,
        status,
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
        }
      )
    }
  }, 100)
}

const checkPredecessors = (
  sasjs: any,
  flows: any,
  flow: any,
  flowName: any,
  prefixAppLoc: any,
  target: any,
  accessToken: any,
  csvFile: any
) => {
  const successors = Object.keys(flows)
    .filter(
      (name) =>
        flows[name].predecessors && flows[name].predecessors.includes(flowName)
    )
    .filter((name) => name !== flowName)

  successors.forEach((successor) => {
    const flowPredecessors = flows[successor].predecessors

    if (flowPredecessors.length > 1) {
      const successFullPredecessors = flowPredecessors.map(
        (flPred: any) =>
          flows[flPred].jobs.length ===
          flows[flPred].jobs.filter((j: any) => j.status === 'success').length
      )

      if (successFullPredecessors.includes(false)) return
    }

    flows[successor].jobs.forEach((job: any) => {
      sasjs
        .startComputeJob(
          prefixAppLoc(target.appLoc, job.location),
          null,
          {
            contextName: target.tgtDeployVars.contextName
          },
          accessToken,
          true
        )
        .then(async (res: any) => {
          if (res) {
            let details = parseJobDetails(res)

            job.status = res.state === 'completed' ? 'success' : 'failure'

            await saveToCsv(
              csvFile,
              successor,
              flows[successor].predecessors || ['none'],
              job.location,
              res.state || 'failure',
              details
            )

            displayResult(
              null,
              null,
              `'${successor}' flow's job located at: '${job.location}' completed.`
            )

            if (
              flow.jobs.filter((j: any) => j.status === 'success').length ===
              flow.jobs.length
            ) {
              displayResult(
                null,
                null,
                `'${successor}' flow completed successfully!`
              )
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

            if (allJobs.length === allJobsWithStatus.length) return

            if (
              flow.jobs.filter((j: any) => j.status === 'success').length ===
              flow.jobs.length
            ) {
              checkPredecessors(
                sasjs,
                flows,
                flow,
                successor,
                prefixAppLoc,
                target,
                accessToken,
                csvFile
              )
            }
          }
        })
        .catch(async (err: { message: string | undefined }) => {
          job.status = 'failure'

          await saveToCsv(
            csvFile,
            successor,
            flows[successor].predecessors || ['none'],
            job.location,
            'failure',
            err.message || ''
          )

          displayResult(
            err,
            `An error has occurred when executing '${successor}' flow's job located at: '${job.location}'.`,
            null
          )

          if (
            flow.jobs.filter((j: any) => j.hasOwnProperty('status')).length ===
            flow.jobs.length
          ) {
            displayResult({}, `'${successor}' flow failed!`)
          }
        })
    })
  })
}

const saveLog = (links: any, target: any, sasjs: any) => {
  const logObj = links.find(
    (link: any) => link.rel === 'log' && link.method === 'GET'
  )
}

const parseJobDetails = (res: any) => {
  let details = ''

  if (res.statistics) {
    details = `Statistics: ${Object.keys(res.statistics)
      .map((key) => `${key}: ${res.statistics[key]}`)
      .join('; ')}`
  }

  if (res.listingStatistics) {
    details = details.concat(
      ' | ',
      `Listing Statistics: ${Object.keys(res.listingStatistics)
        .map((key) => `${key}: ${res.listingStatistics[key]}`)
        .join('; ')}`
    )
  }

  if (res.logStatistics) {
    details = details.concat(
      ' | ',
      `Log Statistics: ${Object.keys(res.logStatistics)
        .map((key) => `${key}: ${res.logStatistics[key]}`)
        .join('; ')}`
    )
  }

  return details
}

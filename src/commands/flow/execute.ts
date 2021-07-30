import { displayError } from '../../utils/displayResult'
import { Target } from '@sasjs/utils'
import SASjs, { PollOptions } from '@sasjs/adapter/node'
import examples from './examples'
import {
  executeFlow,
  failAllSuccessors,
  saveToCsv,
  allFlowsCompleted,
  validateParams,
  isFlowExecuted
} from './internal'

export async function execute(
  source: string,
  logFolder: string,
  csvFile: string,
  target: Target,
  streamLog: boolean,
  sasjs: SASjs
) {
  return new Promise(async (resolve, reject) => {
    const { terminate, message, flows, authConfig } = await validateParams(
      source,
      csvFile,
      logFolder,
      target
    )
    if (terminate) return reject(message)

    const pollOptions: PollOptions = {
      maxPollCount: 24 * 60 * 60,
      pollInterval: 1000,
      streamLog,
      logFolderPath: logFolder
    }

    process.logger?.info(
      `Executing flow for '${target.name}' target with app location '${target.appLoc}':`
    )

    let csvFileAbleToSave = true

    const preExecuteFlow = async (flowName: string) => {
      const flow = flows[flowName]

      if (!flow.jobs || !Array.isArray(flow.jobs))
        return reject(examples.source)

      if (isFlowExecuted(flow)) return

      flow.predecessors?.forEach(async (predecessorName: string) => {
        if (!Object.keys(flows).includes(predecessorName))
          displayError(
            {},
            `Predecessor '${predecessorName}' mentioned in '${flowName}' flow does not exist.`
          )
        else if (predecessorName === flowName)
          displayError(
            {},
            `Predecessor '${predecessorName}' mentioned in '${flowName}' cannot point to itself.`
          )
        else if (!isFlowExecuted(flows[predecessorName]))
          await preExecuteFlow(predecessorName)
      })

      if (isFlowExecuted(flow)) return

      const { jobStatus, flowStatus } = await executeFlow(
        flow,
        sasjs,
        pollOptions,
        target,
        authConfig!,
        async (
          jobLocation: string,
          jobStatus: string,
          errMessage: string,
          logName: string
        ) => {
          await saveToCsv(
            csvFile,
            csvFileAbleToSave,
            flowName,
            flow.predecessors || ['none'],
            jobLocation,
            jobStatus,
            errMessage,
            logName as string
          ).catch((err) => displayError(err, 'Error while saving CSV file.'))
        }
      )
      if (!jobStatus) failAllSuccessors(flows, flowName)
      if (flowStatus.terminate) reject(flowStatus.message)

      const { completed, completedWithAllSuccess } = allFlowsCompleted(flows)
      if (completed) {
        if (completedWithAllSuccess) resolve(csvFile)
        else resolve(false)
      }
    }

    Object.keys(flows).forEach(preExecuteFlow)
  })
}

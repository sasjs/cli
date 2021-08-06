import { displayError } from '../../utils/displayResult'
import { Target } from '@sasjs/utils'
import SASjs, { PollOptions } from '@sasjs/adapter/node'
import examples from './examples'
import {
  executeFlow,
  failAllSuccessors,
  allFlowsCompleted,
  validateParams,
  checkPredecessorDeadlock
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
    const {
      terminate,
      message,
      flows,
      authConfig,
      csvFile: csvFileRealPath
    } = await validateParams(source, csvFile, logFolder, target)
    if (terminate) return reject(message)

    const predecessorDeadlock = checkPredecessorDeadlock(flows)
    if (predecessorDeadlock)
      return reject(
        'Circular dependency found in flows, cannot proceed\n- ' +
          predecessorDeadlock.join(' -> ')
      )

    const pollOptions: PollOptions = {
      maxPollCount: 24 * 60 * 60,
      pollInterval: 1000,
      streamLog,
      logFolderPath: logFolder
    }

    process.logger?.info(
      `Executing flow for '${target.name}' target with app location '${target.appLoc}':`
    )

    const preExecuteFlow = async (flowName: string) => {
      const flow = flows[flowName]
      flow.name = flowName

      if (!flow.jobs || !Array.isArray(flow.jobs))
        return reject(examples.source)

      if (flow.execution) return

      for (const predecessorName of flow.predecessors) {
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
        else if (!flows[predecessorName].execution)
          await preExecuteFlow(predecessorName)
      }

      if (flow.execution) return

      const { jobStatus, flowStatus } = await executeFlow(
        flow,
        sasjs,
        pollOptions,
        target,
        authConfig!,
        csvFileRealPath!
      )

      if (!jobStatus) failAllSuccessors(flows, flowName)
      if (flowStatus.terminate) reject(flowStatus.message)

      const { completed, completedWithAllSuccess } = allFlowsCompleted(flows)
      if (completed) {
        if (completedWithAllSuccess) resolve(csvFileRealPath)
        else resolve(false)
      }
    }

    for (const flowName in flows) {
      await preExecuteFlow(flowName)
    }
  })
}

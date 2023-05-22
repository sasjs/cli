import { displayError } from '../../utils/displayResult'
import { AuthConfig, Target } from '@sasjs/utils'
import SASjs, { PollOptions } from '@sasjs/adapter/node'
import examples from './internal/examples'
import {
  executeFlow,
  failAllSuccessors,
  allFlowsCompleted,
  validateParams,
  checkPredecessorDeadlock
} from './internal'
import { FlowWave } from '../../types'

export async function execute(
  target: Target,
  sasjs: SASjs,
  authConfig: AuthConfig,
  source: string,
  logFolder?: string,
  csvFile?: string,
  streamLog: boolean = false
) {
  return new Promise(async (resolve, reject) => {
    const {
      terminate,
      message,
      flows,
      csvFile: csvFileRealPath,
      logFolder: logFolderRealPath
    } = await validateParams(target, source, csvFile, logFolder)
    if (terminate) return reject(message)

    const { present: predecessorDeadlock, chain: deadlockChain } =
      checkPredecessorDeadlock(flows!)
    if (predecessorDeadlock)
      return reject(
        'Circular dependency found in flows, cannot proceed\n- ' +
          deadlockChain!.join(' -> ')
      )

    const pollOptions: PollOptions = {
      maxPollCount: 24 * 60 * 60,
      pollInterval: 1000,
      streamLog,
      logFolderPath: logFolderRealPath
    }

    process.logger?.info(
      `Executing flow for '${target.name}' target with app location '${target.appLoc}':`
    )

    const preExecuteFlow = async (flowName: string) => {
      const flow: FlowWave = flows![flowName]
      flow.name = flowName

      if (!flow.jobs || !Array.isArray(flow.jobs))
        return reject(examples.source)

      if (flow.execution) return

      const predecessors = flow.predecessors
      if (predecessors)
        for (const predecessorName of predecessors) {
          if (!Object.keys(flows!).includes(predecessorName))
            displayError(
              {},
              `Predecessor '${predecessorName}' mentioned in '${flowName}' flow does not exist.`
            )
          else if (predecessorName === flowName)
            displayError(
              {},
              `Predecessor '${predecessorName}' mentioned in '${flowName}' cannot point to itself.`
            )
          else if (!flows![predecessorName].execution)
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

      if (!jobStatus) failAllSuccessors(flows!, flowName)
      if (flowStatus.terminate) reject(flowStatus.message)

      const { completed, completedWithAllSuccess } = allFlowsCompleted(flows!)
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

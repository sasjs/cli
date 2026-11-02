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
import { FlowWaveJobStatus } from '../../types/flow'

/**
 * A flow that finished without every job succeeding.
 *
 * It carries the jobs that did not, so the command can say which ones rather
 * than reporting a JavaScript fault two frames later - which is what happened
 * when `execute()` resolved `false` instead and the command called `.replace`
 * on it.
 *
 * The marker flag rather than `instanceof`: this package compiles to es5, where
 * a subclass of a built-in loses its prototype chain and `instanceof` answers
 * false in the built artefact.
 */
export class FlowExecutionError extends Error {
  readonly flowFailure = true
  readonly csvFilePath?: string

  /**
   * @param message what did not succeed.
   * @param csvFilePath the flow results file, which records every job and its
   *   outcome. It is the diagnostic for a failed run, so it belongs in the
   *   message: without it the failure path says less than the success path,
   *   which prints the same path.
   */
  constructor(message: string, csvFilePath?: string) {
    super(
      csvFilePath
        ? `${message} The flow results were written to ${csvFilePath}.`
        : message
    )
    this.name = 'FlowExecutionError'
    this.csvFilePath = csvFilePath
  }
}

export const isFlowFailure = (error: unknown): error is FlowExecutionError =>
  (error as FlowExecutionError | undefined)?.flowFailure === true

/**
 * Names the jobs that did not succeed, so the message a pipeline sees is about
 * the flow rather than about the code that reported it.
 *
 * A job with no status never ran - its flow was failed by a predecessor - and is
 * left out. The test is against `undefined` rather than truthiness: a status
 * constant added later that happens to be falsy would otherwise be dropped from
 * the message, and the message is the whole diagnosis.
 */
export const describeFailedJobs = (flows: {
  [key: string]: FlowWave
}): string => {
  const failed = Object.values(flows).flatMap((flow) =>
    flow.jobs
      .filter(
        (job) =>
          job.status !== undefined && job.status !== FlowWaveJobStatus.Success
      )
      .map((job) => `${job.location} (${job.status})`)
  )

  return failed.length
    ? `The flow did not complete with all jobs successful: ${failed.join(', ')}.`
    : 'The flow did not complete with all jobs successful.'
}

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

    // job state poll options
    // maxPollCount and pollInterval are set to 0 to use default polling options
    // configured in @sasjs/adapter/src/api/viya/pollJobState.ts
    const pollOptions: PollOptions = {
      maxPollCount: 0,
      pollInterval: 0,
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
        // a flow that did not succeed is a failure of the flow, not of the CLI:
        // reject with what did not run, so the command can report it and exit
        // with a code that means "the flow failed"
        if (completedWithAllSuccess) resolve(csvFileRealPath)
        else
          reject(
            new FlowExecutionError(describeFailedJobs(flows!), csvFileRealPath)
          )
      }
    }

    for (const flowName in flows) {
      await preExecuteFlow(flowName)
    }
  })
}

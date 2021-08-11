import { FlowWave, FlowWaveJob } from '../../../types'

interface flowsCompletionStatus {
  completed: boolean
  completedWithAllSuccess: boolean
}

export const allFlowsCompleted = (flows: {
  [key: string]: FlowWave
}): flowsCompletionStatus => {
  const flowNames = Object.keys(flows)

  const jobsCount = flowNames.reduce(
    (count: number, name: string) => count + flows[name].jobs.length,
    0
  )
  const jobsWithSuccessStatus = flowNames.reduce(
    (count: number, name: string) =>
      count +
      flows[name].jobs.filter(
        (job: FlowWaveJob) => job.status && job.status === 'success'
      ).length,
    0
  )
  const jobsWithFailureStatus = flowNames.reduce(
    (count: number, name: string) =>
      count +
      flows[name].jobs.filter(
        (job: FlowWaveJob) => job.status && job.status !== 'success'
      ).length,
    0
  )

  return {
    completed:
      jobsCount === jobsWithSuccessStatus ||
      jobsCount === jobsWithFailureStatus ||
      jobsCount === jobsWithSuccessStatus + jobsWithFailureStatus,
    completedWithAllSuccess: jobsCount === jobsWithSuccessStatus
  }
}

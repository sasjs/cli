import { FlowWave, FlowWaveJob } from '../../../types'

export const allFlowsCompleted = (flows: {
  [key: string]: FlowWave
}): {
  completed: boolean
  completedWithAllSuccess: boolean
} => {
  const flowNames = Object.keys(flows)

  let jobsCount = 0
  let jobsWithSuccessStatus = 0
  let jobsWithFailureStatus = 0

  flowNames.map((name) => (jobsCount += flows[name].jobs.length))
  flowNames.map(
    (name) =>
      (jobsWithSuccessStatus += flows[name].jobs.filter(
        (job: FlowWaveJob) => job.status && job.status === 'success'
      ).length)
  )
  flowNames.map(
    (name) =>
      (jobsWithFailureStatus += flows[name].jobs.filter(
        (job: FlowWaveJob) => job.status && job.status !== 'success'
      ).length)
  )

  return {
    completed:
      jobsCount === jobsWithSuccessStatus ||
      jobsCount === jobsWithFailureStatus ||
      jobsCount === jobsWithSuccessStatus + jobsWithFailureStatus,
    completedWithAllSuccess: jobsCount === jobsWithSuccessStatus
  }
}

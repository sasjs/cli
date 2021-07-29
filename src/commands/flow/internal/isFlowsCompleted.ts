const isFlowsCompleted = (
  flows: any
): {
  completed: boolean
  completedWithAllSuccess: boolean
} => {
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

  return {
    completed:
      jobsCount === jobsWithSuccessStatus ||
      jobsCount === jobsWithNotSuccessStatus ||
      jobsCount === jobsWithSuccessStatus + jobsWithNotSuccessStatus,
    completedWithAllSuccess: jobsCount === jobsWithSuccessStatus
  }
}

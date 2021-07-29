export const isFlowExecuted = (flow: any): boolean => {
  const jobsExecuted = flow.jobs.filter((job: any) => !!job.status)
  return jobsExecuted.length !== 0
}

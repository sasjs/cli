export const failAllSuccessors = (flows: any, flowName: string) => {
  const successors = Object.keys(flows).filter((flow: any) =>
    flows[flow]?.predecessors?.includes(flowName)
  )

  successors.forEach((successor: any) => {
    flows[successor].jobs.map((job: any) => (job.status = 'failure'))
    flows[successor].execution = 'failedByPredecessor'
    failAllSuccessors(flows, successor)
  })
}

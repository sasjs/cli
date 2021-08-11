import { FlowWave, FlowWaveJob } from '../../../types'
import { FlowWaveJobStatus } from '../../../types/flow'

export const failAllSuccessors = (
  flows: { [key: string]: FlowWave },
  flowName: string
) => {
  const successors = Object.keys(flows).filter((flow: string) =>
    flows[flow]?.predecessors?.includes(flowName)
  )

  successors.forEach((successor: string) => {
    flows[successor].jobs.map(
      (job: FlowWaveJob) => (job.status = FlowWaveJobStatus.Failure)
    )
    flows[successor].execution = 'failedByPredecessor'
    failAllSuccessors(flows, successor)
  })
}

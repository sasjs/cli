import { allFlowsCompleted } from '..'
import { FlowWaveJobStatus } from '../../../../types/flow'

describe('allFlowsCompleted', () => {
  it('should return true, if all flows are completed', () => {
    const flows = {
      flow1: {
        jobs: [{ location: 'job', status: FlowWaveJobStatus.Success }],
        predecessors: ['flow4']
      },
      flow2: {
        jobs: [{ location: 'job', status: FlowWaveJobStatus.Failure }],
        predecessors: ['flow5', 'flow4']
      },
      flow3: {
        jobs: [{ location: 'job', status: FlowWaveJobStatus.Success }],
        predecessors: []
      }
    }

    const { completed } = allFlowsCompleted(flows)

    expect(completed).toEqual(true)
  })

  it('should return false, if all flows are not completed', () => {
    const flows = {
      flow1: {
        jobs: [{ location: 'job', status: FlowWaveJobStatus.Success }],
        predecessors: ['flow4']
      },
      flow2: {
        jobs: [{ location: 'job' }],
        predecessors: ['flow5', 'flow4']
      },
      flow3: {
        jobs: [{ location: 'job', status: FlowWaveJobStatus.Success }],
        predecessors: []
      }
    }

    const { completed } = allFlowsCompleted(flows)

    expect(completed).toEqual(false)
  })

  it('should return true, if all flows are failed', () => {
    const flows = {
      flow1: {
        jobs: [{ location: 'job', status: FlowWaveJobStatus.Failure }],
        predecessors: ['flow4']
      },
      flow2: {
        jobs: [{ location: 'job', status: FlowWaveJobStatus.Failure }],
        predecessors: ['flow5', 'flow4']
      },
      flow3: {
        jobs: [{ location: 'job', status: FlowWaveJobStatus.Failure }],
        predecessors: []
      }
    }

    const { completed } = allFlowsCompleted(flows)

    expect(completed).toEqual(true)
  })

  it('should return true, if all flows are completed successfully', () => {
    const flows = {
      flow1: {
        jobs: [{ location: 'job', status: FlowWaveJobStatus.Success }],
        predecessors: ['flow4']
      },
      flow2: {
        jobs: [{ location: 'job', status: FlowWaveJobStatus.Success }],
        predecessors: ['flow5', 'flow4']
      },
      flow3: {
        jobs: [{ location: 'job', status: FlowWaveJobStatus.Success }],
        predecessors: []
      }
    }

    const { completed, completedWithAllSuccess } = allFlowsCompleted(flows)

    expect(completed).toEqual(true)
    expect(completedWithAllSuccess).toEqual(true)
  })
})

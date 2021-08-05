import { allFlowsCompleted } from '..'

describe('allFlowsCompleted', () => {
  it('should return true, if all flows are completed', () => {
    const flows = {
      flow1: {
        jobs: [{ location: 'job', status: 'success' }],
        predecessors: ['flow4']
      },
      flow2: {
        jobs: [{ location: 'job', status: 'failure' }],
        predecessors: ['flow5', 'flow4']
      },
      flow3: {
        jobs: [{ location: 'job', status: 'success' }],
        predecessors: []
      }
    }

    const { completed } = allFlowsCompleted(flows)

    expect(completed).toEqual(true)
  })

  it('should return false, if all flows are not completed', () => {
    const flows = {
      flow1: {
        jobs: [{ location: 'job', status: 'success' }],
        predecessors: ['flow4']
      },
      flow2: {
        jobs: [{ location: 'job' }],
        predecessors: ['flow5', 'flow4']
      },
      flow3: {
        jobs: [{ location: 'job', status: 'success' }],
        predecessors: []
      }
    }

    const { completed } = allFlowsCompleted(flows)

    expect(completed).toEqual(false)
  })

  it('should return true, if all flows are completed successfully', () => {
    const flows = {
      flow1: {
        jobs: [{ location: 'job', status: 'success' }],
        predecessors: ['flow4']
      },
      flow2: {
        jobs: [{ location: 'job', status: 'success' }],
        predecessors: ['flow5', 'flow4']
      },
      flow3: {
        jobs: [{ location: 'job', status: 'success' }],
        predecessors: []
      }
    }

    const { completed, completedWithAllSuccess } = allFlowsCompleted(flows)

    expect(completed).toEqual(true)
    expect(completedWithAllSuccess).toEqual(true)
  })
})

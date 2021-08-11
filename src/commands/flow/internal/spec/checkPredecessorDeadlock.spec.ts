import { checkPredecessorDeadlock } from '..'

describe('checkPredecessorDeadlock', () => {
  it('should return true, if predecessorDeadlock is present and it is pointing to itself', () => {
    const flows = {
      flow1: {
        jobs: [{ location: 'job' }],
        predecessors: ['flow1']
      }
    }

    expect(checkPredecessorDeadlock(flows)).toEqual({
      present: true,
      chain: ['flow1', 'flow1']
    })
  })

  it('should return true, if predecessorDeadlock is present and pointing to each other', () => {
    const flows = {
      flow1: {
        jobs: [{ location: 'job' }],
        predecessors: ['flow2']
      },
      flow2: {
        jobs: [{ location: 'job' }],
        predecessors: ['flow1']
      }
    }

    expect(checkPredecessorDeadlock(flows)).toEqual({
      present: true,
      chain: ['flow1', 'flow2', 'flow1']
    })
  })

  it('should return true, if predecessorDeadlock is present and pointing to each other indirectly', () => {
    const flows = {
      flow1: {
        jobs: [{ location: 'job' }],
        predecessors: ['flow2']
      },
      flow2: {
        jobs: [{ location: 'job' }],
        predecessors: ['flow3']
      },
      flow3: {
        jobs: [{ location: 'job' }],
        predecessors: ['flow1']
      }
    }

    expect(checkPredecessorDeadlock(flows)).toEqual({
      present: true,
      chain: ['flow1', 'flow2', 'flow3', 'flow1']
    })
  })

  it('should return false, if predecessorDeadlock is not present', () => {
    const flows = {
      flow1: {
        jobs: [{ location: 'job' }],
        predecessors: ['flow2']
      },
      flow2: {
        jobs: [{ location: 'job' }],
        predecessors: []
      },
      flow3: {
        jobs: [{ location: 'job' }],
        predecessors: ['flow1']
      }
    }

    expect(checkPredecessorDeadlock(flows)).toEqual({ present: false })
  })
})

import { checkPredecessorDeadlock } from '..'

describe('checkPredecessorDeadlock', () => {
  it('should return true, if predecessorDeadlock is present and itself', () => {
    const flows = {
      flow1: {
        jobs: [{ location: 'job' }],
        predecessors: ['flow1']
      }
    }

    expect(checkPredecessorDeadlock(flows)).toEqual(['flow1', 'flow1'])
  })

  it('should return true, if predecessorDeadlock is present and direct', () => {
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

    expect(checkPredecessorDeadlock(flows)).toEqual(['flow1', 'flow2', 'flow1'])
  })

  it('should return true, if predecessorDeadlock is present and indirect', () => {
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

    expect(checkPredecessorDeadlock(flows)).toEqual([
      'flow1',
      'flow2',
      'flow3',
      'flow1'
    ])
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

    expect(checkPredecessorDeadlock(flows)).toEqual(false)
  })

  it('should return false, if predecessorDeadlock is not present with undefined/null', () => {
    const flows = {
      flow1: {
        jobs: [{ location: 'job' }],
        predecessors: [undefined as any as string]
      },
      flow2: {
        jobs: [{ location: 'job' }],
        predecessors: []
      },
      flow3: {
        jobs: [{ location: 'job' }],
        predecessors: ['']
      },
      flow4: {
        jobs: [{ location: 'job' }],
        predecessors: [null as any as string]
      }
    }

    expect(checkPredecessorDeadlock(flows)).toEqual(false)
  })
})

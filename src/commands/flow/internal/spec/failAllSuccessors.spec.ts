import { failAllSuccessors } from '..'

describe('failAllSuccessors', () => {
  it('should update all successors only, recursively', () => {
    const flows = {
      flow1: {
        jobs: [{ location: 'job' }],
        predecessors: ['flow4']
      },
      flow2: {
        jobs: [{ location: 'job' }],
        predecessors: ['flow5', 'flow4']
      },
      flow3: {
        jobs: [{ location: 'job' }],
        predecessors: []
      },
      flowIndependent: {
        jobs: [{ location: 'job' }],
        predecessors: []
      },
      flow4: {
        jobs: [{ location: 'job' }],
        predecessors: ['flow3']
      },
      flow5: {
        jobs: [{ location: 'job' }],
        predecessors: ['flow3']
      }
    }

    failAllSuccessors(flows, 'flow3')

    expect(flows.flow1.jobs[0]).toEqual({ location: 'job', status: 'failure' })
    expect(flows.flow2.jobs[0]).toEqual({ location: 'job', status: 'failure' })
    expect(flows.flow3.jobs[0]).toEqual({ location: 'job', status: undefined })
    expect(flows.flowIndependent.jobs[0]).toEqual({
      location: 'job',
      status: undefined
    })
    expect(flows.flow4.jobs[0]).toEqual({ location: 'job', status: 'failure' })
    expect(flows.flow5.jobs[0]).toEqual({ location: 'job', status: 'failure' })
  })
})

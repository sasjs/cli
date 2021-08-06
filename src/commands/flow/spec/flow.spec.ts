import { AuthConfig, Target } from '@sasjs/utils'
import * as internalModule from '../internal/'
import SASjs, { PollOptions } from '@sasjs/adapter/node'
import { execute } from '../execute'

describe('sasjs flow', () => {
  describe('execute', () => {
    it('should execute flow in order - basic', async () => {
      const flows = {
        flow1: {
          jobs: [{ location: 'somejob' }],
          predecessors: []
        },
        flow2: {
          jobs: [{ location: 'somejob' }],
          predecessors: ['flow1']
        }
      }

      setupMocks(flows)

      await execute(
        '',
        '',
        '',
        undefined as any as Target,
        undefined as any as boolean,
        undefined as any as SASjs
      )

      const [flow1, flow2] = Object.values(flows)

      validateFlowExecution([flow1, flow2])
    })

    it('should execute flow in order - dependent on first', async () => {
      const flows = {
        flow1: {
          jobs: [{ location: 'somejob' }],
          predecessors: ['flow2']
        },
        flow2: {
          jobs: [{ location: 'somejob' }],
          predecessors: []
        }
      }

      setupMocks(flows)

      await execute(
        '',
        '',
        '',
        undefined as any as Target,
        undefined as any as boolean,
        undefined as any as SASjs
      )

      const [flow1, flow2] = Object.values(flows)

      validateFlowExecution([flow2, flow1])
    })

    it('should execute flow in order - two level dependency', async () => {
      const flows = {
        flow1: {
          jobs: [{ location: 'somejob' }],
          predecessors: ['flow3']
        },
        flow2: {
          jobs: [{ location: 'somejob' }],
          predecessors: []
        },
        flow3: {
          jobs: [{ location: 'somejob' }],
          predecessors: ['flow2']
        }
      }

      setupMocks(flows)

      await execute(
        '',
        '',
        '',
        undefined as any as Target,
        undefined as any as boolean,
        undefined as any as SASjs
      )

      const [flow1, flow2, flow3] = Object.values(flows)

      validateFlowExecution([flow2, flow3, flow1])
    })

    it('should execute flow in order - complex dependency', async () => {
      const flows = {
        flow1: {
          jobs: [{ location: 'somejob' }],
          predecessors: ['flow4']
        },
        flow2: {
          jobs: [{ location: 'somejob' }],
          predecessors: ['flow5', 'flow4']
        },
        flow3: {
          jobs: [{ location: 'somejob' }],
          predecessors: []
        },
        flow4: {
          jobs: [{ location: 'somejob' }],
          predecessors: ['flow3']
        },
        flow5: {
          jobs: [{ location: 'somejob' }],
          predecessors: ['flow3']
        }
      }
      setupMocks(flows)

      await execute(
        '',
        '',
        '',
        undefined as any as Target,
        undefined as any as boolean,
        undefined as any as SASjs
      )

      const [flow1, flow2, flow3, flow4, flow5] = Object.values(flows)

      validateFlowExecution([flow3, flow4, flow1, flow5, flow2])
    })
  })

  // it(`should execute 2 chained flows with a failing job in predecessor's flow`, async () => {})

  // it(`should execute 2 chained flows with a failing job in successor's flow`, async () => {})

  // it(`should execute 3 chained flows with a failing job in one of the predecessor's flow`, async () => {})

  // it(`should execute 6 chained flows with failing and succeeding jobs`, async () => {})
})

const setupMocks = (flows: any) => {
  jest.restoreAllMocks()
  jest.spyOn(internalModule, 'validateParams').mockImplementation(() =>
    Promise.resolve({
      terminate: false,
      flows,
      authConfig: {} as any as AuthConfig
    })
  )
  jest.spyOn(internalModule, 'executeFlow').mockImplementation(
    async (
      flow: any
    ): Promise<{
      jobStatus: boolean
      flowStatus: { terminate: boolean; message: string }
    }> => {
      flow.execution = 'started'
      flow.jobs.forEach((job: any) => (job.status = 'Success!!'))
      return {
        jobStatus: true,
        flowStatus: { terminate: false, message: '' }
      }
    }
  )
}

const validateFlowExecution = (flowsExecutionInOrder: any[]) => {
  const noOfTimesExecuteFlowCalled = flowsExecutionInOrder.length
  expect(internalModule.executeFlow).toHaveBeenCalledTimes(
    noOfTimesExecuteFlowCalled
  )
  flowsExecutionInOrder.forEach((flow, index) => {
    expect(internalModule.executeFlow).toHaveBeenNthCalledWith(
      index + 1,
      flow,
      undefined,
      expect.anything(),
      undefined,
      {},
      undefined
    )
  })
}

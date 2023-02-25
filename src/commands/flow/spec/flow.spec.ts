import { AuthConfig, Target } from '@sasjs/utils'
import * as validateParamsModule from '../internal/validateParams'
import * as executeFlowModule from '../internal/executeFlow'
import SASjs from '@sasjs/adapter/node'
import { execute } from '../execute'
import { FlowWave, FlowWaveJob } from '../../../types'
import { FlowWaveJobStatus } from '../../../types/flow'

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

      await executeFlowWrapper()

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

      await executeFlowWrapper()

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

      await executeFlowWrapper()

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

      await executeFlowWrapper()

      const [flow1, flow2, flow3, flow4, flow5] = Object.values(flows)

      validateFlowExecution([flow3, flow4, flow1, flow5, flow2])
    })
  })
})

const setupMocks = (flows: { [key: string]: FlowWave }) => {
  jest.restoreAllMocks()
  jest.mock('../internal/validateParams')
  jest.mock('../internal/executeFlow')

  jest.spyOn(validateParamsModule, 'validateParams').mockImplementation(() =>
    Promise.resolve({
      terminate: false,
      flows,
      authConfig: {} as any as AuthConfig
    })
  )
  jest.spyOn(executeFlowModule, 'executeFlow').mockImplementation(
    async (
      flow: FlowWave
    ): Promise<{
      jobStatus: boolean
      flowStatus: { terminate: boolean; message: string }
    }> => {
      flow.execution = 'started'
      flow.jobs.forEach(
        (job: FlowWaveJob) => (job.status = FlowWaveJobStatus.Success)
      )
      return {
        jobStatus: true,
        flowStatus: { terminate: false, message: '' }
      }
    }
  )
}

const validateFlowExecution = (flowsExecutionOrder: FlowWave[]) => {
  expect(executeFlowModule.executeFlow).toHaveBeenCalledTimes(
    flowsExecutionOrder.length
  )
  flowsExecutionOrder.forEach((flow: FlowWave, index) => {
    expect(executeFlowModule.executeFlow).toHaveBeenNthCalledWith(
      index + 1,
      flow,
      undefined,
      expect.anything(),
      undefined,
      undefined,
      undefined
    )
  })
}

const executeFlowWrapper = async () =>
  await execute(
    undefined as any as Target,
    undefined as any as SASjs,
    undefined as any as AuthConfig,
    undefined as any as string
  )

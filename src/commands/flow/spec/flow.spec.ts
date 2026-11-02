import { AuthConfig, Target } from '@sasjs/utils'
import * as validateParamsModule from '../internal/validateParams'
import * as executeFlowModule from '../internal/executeFlow'
import SASjs from '@sasjs/adapter/node'
import {
  describeFailedJobs,
  execute,
  FlowExecutionError,
  isFlowFailure
} from '../execute'
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

    it('rejects with the failing job rather than resolving a value', async () => {
      // the defect this covers: resolving `false` here made the command call
      // `.replace` on it and report a TypeError two frames later
      const flows = {
        flow1: {
          jobs: [{ location: 'goodJob' }, { location: 'badJob' }],
          predecessors: []
        }
      }

      setupMocks(flows, 'badJob')

      // one call, because a flow object carries its own execution state: a
      // second execute() over the same flows returns early and never settles
      const error: any = await executeFlowWrapper().catch(
        (thrown: unknown) => thrown
      )

      // the marker, not `instanceof`: the built artefact is es5, where an Error
      // subclass loses its prototype chain, so the assertion has to be the one
      // that holds in both places
      expect(isFlowFailure(error)).toBe(true)
      expect(error.message).toEqual(
        'The flow did not complete with all jobs successful: badJob (failure).'
      )
    })

    it('rejects with a flow error a caller can recognise', async () => {
      const flows = {
        flow1: { jobs: [{ location: 'badJob' }], predecessors: [] }
      }

      setupMocks(flows, 'badJob')

      await expect(executeFlowWrapper()).rejects.toSatisfy(isFlowFailure)
    })
  })
})

describe('FlowExecutionError', () => {
  it('carries the flow results path, and says where they are', () => {
    const error = new FlowExecutionError(
      'The flow did not complete with all jobs successful: /b (failure).',
      '/project/sasjsresults/flow-results.csv'
    )

    expect(error.csvFilePath).toEqual('/project/sasjsresults/flow-results.csv')
    expect(error.message).toEqual(
      'The flow did not complete with all jobs successful: /b (failure). ' +
        'The flow results were written to /project/sasjsresults/flow-results.csv.'
    )
    expect(isFlowFailure(error)).toBe(true)
  })

  it('says nothing about a path it was not given', () => {
    expect(new FlowExecutionError('The flow failed.').message).toEqual(
      'The flow failed.'
    )
  })
})

describe('describeFailedJobs', () => {
  it('names every job that did not succeed, across flows', () => {
    const flows = {
      flow1: {
        jobs: [
          { location: '/a', status: FlowWaveJobStatus.Success },
          { location: '/b', status: FlowWaveJobStatus.Failure }
        ]
      },
      flow2: {
        jobs: [{ location: '/c', status: FlowWaveJobStatus.Failure }]
      }
    } as any

    expect(describeFailedJobs(flows)).toEqual(
      'The flow did not complete with all jobs successful: /b (failure), /c (failure).'
    )
  })

  it('leaves out jobs that did not run', () => {
    const flows = {
      flow1: {
        jobs: [
          { location: '/never-ran' },
          { location: '/b', status: FlowWaveJobStatus.Failure }
        ]
      }
    } as any

    expect(describeFailedJobs(flows)).toEqual(
      'The flow did not complete with all jobs successful: /b (failure).'
    )
  })

  it('names a job whose status is falsy rather than dropping it', () => {
    // a status constant added later could be falsy; truthiness would silently
    // omit that job from the only diagnosis the caller gets
    const flows = {
      flow1: { jobs: [{ location: '/zero', status: 0 }] }
    } as any

    expect(describeFailedJobs(flows)).toEqual(
      'The flow did not complete with all jobs successful: /zero (0).'
    )
  })

  it('states the failure without a list when no job carries a status', () => {
    const flows = { flow1: { jobs: [{ location: '/a' }] } } as any

    expect(describeFailedJobs(flows)).toEqual(
      'The flow did not complete with all jobs successful.'
    )
  })
})

const setupMocks = (
  flows: { [key: string]: FlowWave },
  failingJob?: string
) => {
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
      flow.jobs.forEach((job: FlowWaveJob) => {
        job.status =
          job.location === failingJob
            ? FlowWaveJobStatus.Failure
            : FlowWaveJobStatus.Success
      })
      return {
        jobStatus: !failingJob,
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

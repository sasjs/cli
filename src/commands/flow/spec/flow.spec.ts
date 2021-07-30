import { AuthConfig, Target } from '@sasjs/utils'
import * as internalModule from '../internal/'
import SASjs, { PollOptions } from '@sasjs/adapter/node'
import { execute } from '../execute'

describe('sasjs flow', () => {
  describe('execute', () => {
    it('should execute flow in order case 1', async () => {
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

      jest.spyOn(internalModule, 'validateParams').mockImplementation(() =>
        Promise.resolve({
          terminate: false,
          flows,
          authConfig: {} as any as AuthConfig
        })
      )
      jest.spyOn(internalModule, 'executeFlow').mockImplementation(
        async (
          flow: any,
          sasjs: SASjs,
          pollOptions: PollOptions,
          target: Target,
          authConfig: AuthConfig,
          sendToCsv: Function
        ): Promise<{
          jobStatus: boolean
          flowStatus: { terminate: boolean; message: string }
        }> => {
          flow.jobs.forEach((job: any) => (job.status = 'Success!!'))
          return {
            jobStatus: true,
            flowStatus: { terminate: false, message: '' }
          }
        }
      )

      await execute(
        '',
        '',
        '',
        undefined as any as Target,
        undefined as any as boolean,
        undefined as any as SASjs
      )

      const [flow1, flow2] = Object.values(flows)

      expect(internalModule.executeFlow).toHaveBeenCalledTimes(2)
      expect(internalModule.executeFlow).toHaveBeenNthCalledWith(
        1,
        flow1,
        undefined,
        expect.anything(),
        undefined,
        expect.anything(),
        expect.anything()
      )
      expect(internalModule.executeFlow).toHaveBeenNthCalledWith(
        2,
        flow2,
        undefined,
        expect.anything(),
        undefined,
        expect.anything(),
        expect.anything()
      )
    })

    it('should execute flow in order case 2', async () => {
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

      jest.spyOn(internalModule, 'validateParams').mockImplementation(() =>
        Promise.resolve({
          terminate: false,
          flows,
          authConfig: {} as any as AuthConfig
        })
      )
      jest.spyOn(internalModule, 'executeFlow').mockImplementation(
        async (
          flow: any,
          sasjs: SASjs,
          pollOptions: PollOptions,
          target: Target,
          authConfig: AuthConfig,
          sendToCsv: Function
        ): Promise<{
          jobStatus: boolean
          flowStatus: { terminate: boolean; message: string }
        }> => {
          flow.jobs.forEach((job: any) => (job.status = 'Success!!'))
          return {
            jobStatus: true,
            flowStatus: { terminate: false, message: '' }
          }
        }
      )

      await execute(
        '',
        '',
        '',
        undefined as any as Target,
        undefined as any as boolean,
        undefined as any as SASjs
      )

      const [flow1, flow2] = Object.values(flows)

      expect(internalModule.executeFlow).toHaveBeenCalledTimes(2)
      expect(internalModule.executeFlow).toHaveBeenNthCalledWith(
        1,
        flow2,
        undefined,
        expect.anything(),
        undefined,
        expect.anything(),
        expect.anything()
      )
      expect(internalModule.executeFlow).toHaveBeenNthCalledWith(
        2,
        flow1,
        undefined,
        expect.anything(),
        undefined,
        expect.anything(),
        expect.anything()
      )
    })

    it('should execute flow in order case 3', async () => {
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

      jest.spyOn(internalModule, 'validateParams').mockImplementation(() =>
        Promise.resolve({
          terminate: false,
          flows,
          authConfig: {} as any as AuthConfig
        })
      )
      jest.spyOn(internalModule, 'executeFlow').mockImplementation(
        async (
          flow: any,
          sasjs: SASjs,
          pollOptions: PollOptions,
          target: Target,
          authConfig: AuthConfig,
          sendToCsv: Function
        ): Promise<{
          jobStatus: boolean
          flowStatus: { terminate: boolean; message: string }
        }> => {
          flow.jobs.forEach((job: any) => (job.status = 'Success!!'))
          return {
            jobStatus: true,
            flowStatus: { terminate: false, message: '' }
          }
        }
      )

      await execute(
        '',
        '',
        '',
        undefined as any as Target,
        undefined as any as boolean,
        undefined as any as SASjs
      )

      const [flow1, flow2, flow3] = Object.values(flows)

      expect(internalModule.executeFlow).toHaveBeenCalledTimes(3)
      expect(internalModule.executeFlow).toHaveBeenNthCalledWith(
        1,
        flow2,
        undefined,
        expect.anything(),
        undefined,
        expect.anything(),
        expect.anything()
      )
      expect(internalModule.executeFlow).toHaveBeenNthCalledWith(
        2,
        flow3,
        undefined,
        expect.anything(),
        undefined,
        expect.anything(),
        expect.anything()
      )
      expect(internalModule.executeFlow).toHaveBeenNthCalledWith(
        3,
        flow1,
        undefined,
        expect.anything(),
        undefined,
        expect.anything(),
        expect.anything()
      )
    })

    it('should execute flow in order case 4', async () => {
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

      jest.spyOn(internalModule, 'validateParams').mockImplementation(() =>
        Promise.resolve({
          terminate: false,
          flows,
          authConfig: {} as any as AuthConfig
        })
      )
      jest.spyOn(internalModule, 'executeFlow').mockImplementation(
        async (
          flow: any,
          sasjs: SASjs,
          pollOptions: PollOptions,
          target: Target,
          authConfig: AuthConfig,
          sendToCsv: Function
        ): Promise<{
          jobStatus: boolean
          flowStatus: { terminate: boolean; message: string }
        }> => {
          flow.jobs.forEach((job: any) => (job.status = 'Success!!'))
          return {
            jobStatus: true,
            flowStatus: { terminate: false, message: '' }
          }
        }
      )

      await execute(
        '',
        '',
        '',
        undefined as any as Target,
        undefined as any as boolean,
        undefined as any as SASjs
      )

      const [flow1, flow2, flow3, flow4, flow5] = Object.values(flows)

      expect(internalModule.executeFlow).toHaveBeenCalledTimes(5)
      expect(internalModule.executeFlow).toHaveBeenNthCalledWith(
        1,
        flow3,
        undefined,
        expect.anything(),
        undefined,
        expect.anything(),
        expect.anything()
      )
      expect(internalModule.executeFlow).toHaveBeenNthCalledWith(
        2,
        flow4,
        undefined,
        expect.anything(),
        undefined,
        expect.anything(),
        expect.anything()
      )
      expect(internalModule.executeFlow).toHaveBeenNthCalledWith(
        3,
        flow1,
        undefined,
        expect.anything(),
        undefined,
        expect.anything(),
        expect.anything()
      )
      expect(internalModule.executeFlow).toHaveBeenNthCalledWith(
        4,
        flow5,
        undefined,
        expect.anything(),
        undefined,
        expect.anything(),
        expect.anything()
      )
      expect(internalModule.executeFlow).toHaveBeenNthCalledWith(
        5,
        flow2,
        undefined,
        expect.anything(),
        undefined,
        expect.anything(),
        expect.anything()
      )
    })
  })
})

import SASjs from '@sasjs/adapter/node'
import { ServerType, Target } from '@sasjs/utils/types'
import path from 'path'
import { execute } from '../execute'
import { mockAuthConfig } from './mocks'

const sasjs = new (<jest.Mock<SASjs>>SASjs)()
const target = new Target({
  name: 'test',
  serverType: ServerType.SasViya,
  appLoc: '/test',
  contextName: 'Mock Context'
})

describe('execute', () => {
  beforeEach(() => {
    setupMocks()
  })

  it('should set streamLog to true when the flag is passed in', async () => {
    await execute(
      sasjs,
      mockAuthConfig,
      'test/job',
      target,
      false,
      '',
      'logs',
      'test',
      false,
      false,
      undefined,
      true
    )

    expect(sasjs.startComputeJob).toHaveBeenCalledWith(
      'test/job',
      null,
      {
        contextName: 'Mock Context'
      },
      mockAuthConfig,
      true,
      {
        maxPollCount: 24 * 60 * 60,
        pollInterval: 1000,
        streamLog: true,
        logFolderPath: path.join(process.projectDir, 'logs')
      },
      true,
      undefined
    )
  })

  it('should set streamLog to false when the flag is false', async () => {
    await execute(
      sasjs,
      mockAuthConfig,
      'test/job',
      target,
      false,
      '',
      'logs',
      'test',
      false,
      false,
      undefined,
      false
    )

    expect(sasjs.startComputeJob).toHaveBeenCalledWith(
      'test/job',
      null,
      {
        contextName: 'Mock Context'
      },
      mockAuthConfig,
      true,
      {
        maxPollCount: 24 * 60 * 60,
        pollInterval: 1000,
        streamLog: false,
        logFolderPath: path.join(process.projectDir, 'logs')
      },
      true,
      undefined
    )
  })
})

const setupMocks = () => {
  process.projectDir = process.cwd()
  jest.restoreAllMocks()
  jest.mock('@sasjs/adapter')

  jest
    .spyOn(sasjs, 'startComputeJob')
    .mockImplementation(() => Promise.resolve())
}

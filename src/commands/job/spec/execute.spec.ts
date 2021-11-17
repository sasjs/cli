import SASjs from '@sasjs/adapter/node'
import { deleteFile } from '@sasjs/utils'
import { ServerType, Target } from '@sasjs/utils/types'
import path from 'path'
import { setConstants } from '../../../utils'
import { executeJobViya, executeJobSasjs } from '../internal/execute'
import { mockAuthConfig } from './mocks'

const sasjs = new (<jest.Mock<SASjs>>SASjs)()
const target = new Target({
  name: 'test',
  serverType: ServerType.Sasjs,
  appLoc: '/test',
  contextName: 'Mock Context'
})
let statusFile: string

describe('executeJobViya', () => {
  beforeEach(async () => {
    await setupMocks(ServerType.SasViya)
  })

  const testFilePath = path.join(__dirname, 'test')
  const testLogsPath = path.join(__dirname, 'logs')

  it('should set streamLog to true when the flag is passed in', async () => {
    await executeJobViya(
      sasjs,
      mockAuthConfig,
      'test/job',
      target,
      false,
      false,
      testLogsPath,
      testFilePath,
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
        logFolderPath: testLogsPath
      },
      true,
      undefined
    )

    await deleteFile(testFilePath)
  })

  it('should set streamLog to false when the flag is false', async () => {
    await executeJobViya(
      sasjs,
      mockAuthConfig,
      'test/job',
      target,
      false,
      false,
      testLogsPath,
      testFilePath,
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
        logFolderPath: testLogsPath
      },
      true,
      undefined
    )

    await deleteFile(testFilePath)
  })
})

describe('executeJobSasjs', () => {
  beforeEach(async () => {
    await setupMocks(ServerType.Sasjs)
  })

  it('should pass job pass as a _program parameter', async () => {
    await executeJobSasjs(
      sasjs,
      'test/job',
      path.join(process.projectDir, 'logs')
    )

    expect(sasjs.executeJobSASjs).toHaveBeenCalledWith({ _program: 'test/job' })
  })
})

const setupMocks = async (serverType: ServerType) => {
  process.projectDir = process.cwd()
  await setConstants()
  jest.restoreAllMocks()
  jest.mock('@sasjs/adapter')

  jest
    .spyOn(
      sasjs,
      serverType === ServerType.SasViya ? 'startComputeJob' : 'executeJobSASjs'
    )
    .mockImplementation(() => Promise.resolve())
}

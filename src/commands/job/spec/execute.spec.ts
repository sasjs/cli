import SASjs, { SASjsApiClient } from '@sasjs/adapter/node'
import { deleteFile } from '@sasjs/utils'
import { ServerType, Target } from '@sasjs/utils/types'
import path from 'path'
import { setConstants, getSASjsAndAuthConfig } from '../../../utils'
import * as utilsModule from '../../../utils/utils'
import { executeJobViya, executeJobSasjs } from '../internal/execute'
import { mockAuthConfig } from './mocks'

const sasjs = new (<jest.Mock<SASjs>>SASjs)()
let executeJobMock: jest.SpyInstance
const target = new Target({
  name: 'test',
  serverType: ServerType.Sasjs,
  appLoc: '/test',
  contextName: 'Mock Context'
})

describe('executeJobViya', () => {
  beforeEach(async () => {
    await setupMocksForViya()
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
        maxPollCount: 0,
        pollInterval: 0,
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
        maxPollCount: 0,
        pollInterval: 0,
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
    await setupMocksForSasjs()
  })

  it('should pass job pass as a _program parameter', async () => {
    const { sasjs, authConfig } = await getSASjsAndAuthConfig(target)

    await executeJobSasjs(
      sasjs,
      target,
      'test/job',
      path.join(process.projectDir, 'logs'),
      undefined,
      authConfig
    )

    expect(executeJobMock).toHaveBeenCalledWith(
      { _program: 'test/job' },
      target.appLoc,
      undefined
    )
  })
})

const setupMocksForViya = async () => {
  process.projectDir = process.cwd()
  await setConstants()
  jest.restoreAllMocks()
  jest.mock('@sasjs/adapter')

  jest
    .spyOn(sasjs, 'startComputeJob')
    .mockImplementation(() => Promise.resolve())
}

const setupMocksForSasjs = async () => {
  process.projectDir = process.cwd()
  await setConstants()
  jest.restoreAllMocks()

  executeJobMock = jest
    .spyOn(SASjsApiClient.prototype, 'executeJob')
    .mockImplementation(() =>
      Promise.resolve({
        result: '',
        log: ''
      })
    )

  jest
    .spyOn(utilsModule, 'isSasJsServerInServerMode')
    .mockImplementation(() => Promise.resolve(false))
}

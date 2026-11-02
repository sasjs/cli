import SASjs, { SASjsApiClient } from '@sasjs/adapter/node'
import { deleteFile } from '@sasjs/utils'
import { ServerType, Target } from '@sasjs/utils/types'
import path from 'path'
import {
  setConstants,
  getSASjsAndAuthConfig,
  persistTokensRefreshedByAdapter
} from '../../../utils'
import * as utilsModule from '../../../utils/utils'
import * as configUtils from '../../../utils/config'
import * as logcheckModule from '../../../utils/logcheck'
import * as fetchLogFileContentModule from '../../shared/fetchLogFileContent'
import { LogCheckFailure } from '../../../utils/logcheck'
import * as jobUtils from '../internal/utils'
import * as displayResultModule from '../../../utils/displayResult'
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
      undefined,
      undefined,
      expect.any(Function)
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
      undefined,
      undefined,
      expect.any(Function)
    )

    await deleteFile(testFilePath)
  })

  it('should pass persistTokensRefreshedByAdapter(target) as onTokensRefreshed', async () => {
    const spy = jest
      .spyOn(configUtils, 'persistTokensRefreshedByAdapter')
      .mockImplementation(() => jest.fn())

    await executeJobViya(
      sasjs,
      mockAuthConfig,
      'test/job',
      target,
      false,
      false,
      undefined,
      undefined,
      false,
      undefined,
      false
    )

    expect(spy).toHaveBeenCalledWith(target)

    const callArgs = (sasjs.startComputeJob as jest.Mock).mock.calls[0]
    const onTokensRefreshed = callArgs[callArgs.length - 1]
    expect(onTokensRefreshed).toBeDefined()
    expect(typeof onTokensRefreshed).toEqual('function')

    spy.mockRestore()
  })

  it('propagates a log-check failure instead of reporting a parse error', async () => {
    // a job whose log fails the check used to print the verdict and then exit 0,
    // because this function's catch-all treated the failure as a bad output
    jest.spyOn(sasjs, 'startComputeJob').mockResolvedValue({
      job: {
        state: 'completed',
        links: [{ rel: 'log', method: 'GET', href: '/log' }],
        logStatistics: { lineCount: 5 }
      }
    } as any)

    jest
      .spyOn(fetchLogFileContentModule, 'fetchLogFileContent')
      .mockResolvedValue('ERROR: deliberate' as any)

    const failure = new LogCheckFailure('SAS log check failed for test/job')

    jest.spyOn(logcheckModule, 'checkLog').mockRejectedValue(failure)

    await expect(
      executeJobViya(
        sasjs,
        mockAuthConfig,
        'test/job',
        target,
        true,
        false,
        testLogsPath,
        undefined,
        false,
        undefined,
        false
      )
    ).rejects.toBe(failure)
  })

  it('fetches the log under --logcheck even when no log file was named', async () => {
    // otherwise the flag prints nothing and exits 0, which reads as a clean log
    jest.spyOn(logcheckModule, 'logCheckWantsVerdict').mockResolvedValue(true)

    const saveSpy = jest.spyOn(jobUtils, 'saveLog').mockResolvedValue(undefined)

    jest.spyOn(sasjs, 'startComputeJob').mockResolvedValue({
      job: {
        state: 'completed',
        links: [{ rel: 'log', method: 'GET', href: '/log' }],
        logStatistics: { lineCount: 5 }
      }
    } as any)

    const fetchSpy = jest
      .spyOn(fetchLogFileContentModule, 'fetchLogFileContent')
      .mockResolvedValue('ERROR: deliberate' as any)

    const failure = new LogCheckFailure('SAS log check failed for test/job')

    jest.spyOn(logcheckModule, 'checkLog').mockRejectedValue(failure)

    await expect(
      executeJobViya(
        sasjs,
        mockAuthConfig,
        'test/job',
        target,
        true,
        false,
        undefined,
        undefined,
        false,
        undefined,
        false
      )
    ).rejects.toBe(failure)

    expect(fetchSpy).toHaveBeenCalled()

    // the log was fetched for the verdict, not asked for: writing it would
    // leave a file in the project directory that nobody requested
    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('names the log fetch, not the job output, when the log cannot be retrieved', async () => {
    jest.spyOn(logcheckModule, 'logCheckWantsVerdict').mockResolvedValue(true)

    jest.spyOn(sasjs, 'startComputeJob').mockResolvedValue({
      job: {
        state: 'completed',
        links: [{ rel: 'log', method: 'GET', href: '/log' }],
        logStatistics: { lineCount: 5 }
      }
    } as any)

    jest
      .spyOn(fetchLogFileContentModule, 'fetchLogFileContent')
      .mockRejectedValue(new Error('502 Bad Gateway'))

    const checkSpy = jest.spyOn(logcheckModule, 'checkLog')
    const displaySpy = jest.spyOn(displayResultModule, 'displayError')

    const result = await executeJobViya(
      sasjs,
      mockAuthConfig,
      'test/job',
      target,
      false,
      false,
      undefined,
      undefined,
      false,
      undefined,
      false
    )

    expect(result).toBe(false)
    expect(checkSpy).not.toHaveBeenCalled()
    expect(displaySpy).toHaveBeenCalledWith(
      null,
      'An error has occurred when retrieving the job log.'
    )
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

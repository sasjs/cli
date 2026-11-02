import SASjs, { PollOptions } from '@sasjs/adapter/node'
import { AuthConfig, Logger, LogLevel, ServerType, Target } from '@sasjs/utils'
import { executeFlow } from '../executeFlow'
import * as saveLogModule from '../saveLog'
import * as saveToCsvModule from '../saveToCsv'
import * as normalizeFilePath from '../normalizeFilePath'
import * as logcheckModule from '../../../../utils/logcheck'
import csvColumns from '../csvColumns'

const pollOptions: PollOptions = {
  maxPollCount: 0,
  pollInterval: 0,
  streamLog: false,
  logFolderPath: 'fake/log/folder/path'
}
const fakeLogFileName = 'fakeLog.log'
const fakeLogPath = `${pollOptions.logFolderPath}/${fakeLogFileName}`
describe('executeFlow', () => {
  const target: Target = {
    name: 'test-target',
    serverUrl: 'http://server.com',
    serverType: ServerType.SasViya,
    appLoc: '/test',
    contextName: 'fakeContext'
  } as any as Target
  const sasjs = new SASjs()
  jest
    .spyOn(sasjs, 'fetchLogFileContent')
    .mockImplementation(() => Promise.resolve(''))
  process.logger = new Logger(LogLevel.Off)

  beforeEach(() => {
    jest
      .spyOn(saveLogModule, 'saveLog')
      .mockImplementation(() =>
        Promise.resolve({ fileName: fakeLogFileName, logText: '' })
      )
    jest
      .spyOn(saveToCsvModule, 'saveToCsv')
      .mockImplementation(() => Promise.resolve())
    jest
      .spyOn(normalizeFilePath, 'normalizeFilePath')
      .mockImplementation((filePath: string) => filePath)
  })

  it('should execute flow with 2 successful jobs and 1 failing job', async () => {
    const flowName = 'firstFlow'
    const flow = {
      name: flowName,
      jobs: [
        { location: 'jobs/testJob/job' },
        { location: 'jobs/testJob/failingJob' },
        { location: 'jobs/testJob/job' }
      ],
      predecessors: []
    }

    jest
      .spyOn(sasjs, 'startComputeJob')
      .mockImplementation(async (jobLocation: string) =>
        jobLocation === '/test/jobs/testJob/job'
          ? Promise.resolve({ job: { state: 'success' } })
          : Promise.reject()
      )

    await executeFlow(
      flow,
      sasjs,
      pollOptions,
      target,
      {} as any as AuthConfig,
      ''
    )

    const csvDataSuccess = [
      flowName,
      'none',
      `${target.appLoc}/${flow.jobs[0].location}`,
      'success',
      fakeLogPath,
      ''
    ]
    const csvDataFailed = [
      flowName,
      'none',
      `${target.appLoc}/${flow.jobs[1].location}`,
      'failure',
      fakeLogPath,
      ''
    ]

    validateSaveToCsv([csvDataFailed, csvDataSuccess, csvDataSuccess])
  })

  it('should execute flow with 1 successful job and 1 job that does not exist', async () => {
    const nonExistingJob = 'jobs/testJob/DOES_NOT_EXIST'
    const flowName = 'firstFlow'
    const flow = {
      name: flowName,
      jobs: [{ location: 'jobs/testJob/job' }, { location: nonExistingJob }],
      predecessors: []
    }
    const jobNotFoundMessage = 'Job was not found.'

    jest
      .spyOn(sasjs, 'startComputeJob')
      .mockImplementation(async (jobLocation: string) =>
        jobLocation === '/test/jobs/testJob/job'
          ? Promise.resolve({ job: { state: 'success' } })
          : Promise.reject({ message: jobNotFoundMessage })
      )

    jest.spyOn(process.logger, 'error')

    await executeFlow(
      flow,
      sasjs,
      pollOptions,
      target,
      {} as any as AuthConfig,
      ''
    )

    const csvDataSuccess = [
      flowName,
      'none',
      `${target.appLoc}/${flow.jobs[0].location}`,
      'success',
      fakeLogPath,
      ''
    ]
    const csvDataFailed = [
      flowName,
      'none',
      `${target.appLoc}/${flow.jobs[1].location}`,
      'failure',
      fakeLogPath,
      jobNotFoundMessage
    ]

    validateSaveToCsv([csvDataFailed, csvDataSuccess])

    expect(process.logger.error).toHaveBeenNthCalledWith(
      1,
      `An error has occurred when executing 'firstFlow' flow's job located at: '${nonExistingJob}'. Job was not found.`
    )
  })

  it('should terminate the process if server could not get session status', async () => {
    const flow = {
      name: 'myFlow',
      jobs: [{ location: 'somejob' }],
      predecessors: []
    }

    jest
      .spyOn(sasjs, 'startComputeJob')
      .mockImplementation(() => Promise.reject('Could not get session state.'))
    jest
      .spyOn(saveToCsvModule, 'saveToCsv')
      .mockImplementation(() => Promise.resolve())

    const { jobStatus, flowStatus } = await executeFlow(
      flow,
      sasjs,
      pollOptions,
      target,
      {} as any as AuthConfig,
      'fake/csv/path'
    )

    expect(flowStatus).toEqual({
      terminate: true,
      message: 'Flow has been terminated.'
    })

    expect(jobStatus).toEqual(false)

    const csvDataFailed = [
      'myFlow',
      'none',
      `${target.appLoc}/${flow.jobs[0].location}`,
      'failure',
      fakeLogPath,
      ''
    ]
    validateSaveToCsv([csvDataFailed])
  })

  it('writes the report and the log before a failing check stops the flow', async () => {
    const flowName = 'checkedFlow'
    const flow = {
      name: flowName,
      jobs: [{ location: 'jobs/testJob/job' }],
      predecessors: []
    }

    jest
      .spyOn(sasjs, 'startComputeJob')
      .mockResolvedValue({ job: { state: 'success' } } as any)

    const saveLogSpy = jest
      .spyOn(saveLogModule, 'saveLog')
      .mockImplementation(() =>
        Promise.resolve({ fileName: fakeLogFileName, logText: 'ERROR 22-322' })
      )

    const csvSpy = jest
      .spyOn(saveToCsvModule, 'saveToCsv')
      .mockImplementation(() => Promise.resolve())

    // last test in the file: the rejecting spy is restored before it ends, so
    // it cannot leak into another case
    const checkSpy = jest
      .spyOn(logcheckModule, 'checkLog')
      .mockRejectedValue(new Error('SAS log check failed'))

    await expect(
      executeFlow(
        flow as any,
        sasjs,
        pollOptions,
        target,
        {} as any as AuthConfig,
        ''
      )
    ).rejects.toThrow('SAS log check failed')

    // the job whose log fails the check is the job a reader has to find in the
    // CSV, with its log on disk
    expect(saveLogSpy.mock.invocationCallOrder[0]).toBeLessThan(
      checkSpy.mock.invocationCallOrder[0]
    )
    expect(csvSpy.mock.invocationCallOrder[0]).toBeLessThan(
      checkSpy.mock.invocationCallOrder[0]
    )

    checkSpy.mockRestore()
  })
})

const validateSaveToCsv = (jobExecutionInOrder: any[]) => {
  expect(saveToCsvModule.saveToCsv).toHaveBeenCalledTimes(
    jobExecutionInOrder.length
  )
  jobExecutionInOrder.forEach((expectedCsvData, index) => {
    expect(saveToCsvModule.saveToCsv).toHaveBeenNthCalledWith(
      index + 1,
      expect.anything(),
      expectedCsvData,
      Object.values(csvColumns),
      'id'
    )
  })
}

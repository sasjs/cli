import path from 'path'
import * as viyaExecuteModule from '../internal/execute/viya'
import * as sas9ExecuteModule from '../internal/execute/sas9'
import SASjs from '@sasjs/adapter/node'
import { JobCommand } from '../jobCommand'
import { AuthConfig, Logger, LogLevel, ServerType, Target } from '@sasjs/utils'
import * as SasjsUtilsFilesModule from '@sasjs/utils/file'
import * as configUtils from '../../../utils/config'
import { ReturnCode } from '../../../types/command'
import * as utilsModule from '../internal/utils'

const defaultArgs = ['node', 'sasjs', 'job', 'execute']
const targetViya = new Target({
  name: 'test',
  appLoc: '/Public/test/',
  serverType: ServerType.SasViya,
  contextName: 'test context'
})

const target9 = new Target({
  name: 'test',
  appLoc: '/Public/test/',
  serverType: ServerType.Sas9,
  contextName: 'test context',
  authConfigSas9: {
    userName: 'testUser',
    password: 'password'
  }
})

const sas9TargetWithoutAuthConfig = new Target({
  name: 'test',
  appLoc: '/Public/test/',
  serverType: ServerType.Sas9,
  contextName: 'test context'
})

const authConfig = {}
const jobFileName = 'someJob'
const jobPath = `/Public/folder/${jobFileName}`
const log = './jobLog.log'
const output = './jobOutput.json'
const statusFile = './status/file.txt'
const source = './macros.json'
const projectFolder = __dirname

describe('JobCommand', () => {
  beforeAll(async () => {
    process.projectDir = projectFolder
  })

  describe('for server type viya', () => {
    beforeEach(() => {
      setupMocksForViya()
    })

    it('should parse sasjs job execute command', async () => {
      await executeCommandWrapper([jobPath])

      expect(viyaExecuteModule.executeJobViya).toHaveBeenCalledWith(
        ...executeCalledWith({ jobPath })
      )
    })

    it('should pass wait as true if log flag with value is present', async () => {
      await executeCommandWrapper([jobPath, '--log', log])

      expect(viyaExecuteModule.executeJobViya).toHaveBeenCalledWith(
        ...executeCalledWith({
          jobPath,
          waitForJob: true,
          logFile: path.join(projectFolder, log)
        })
      )
    })

    it('should pass path for log file and wait to true if log flag without value is present', async () => {
      await executeCommandWrapper([jobPath, '--log'])

      expect(viyaExecuteModule.executeJobViya).toHaveBeenCalledWith(
        ...executeCalledWith({
          jobPath,
          waitForJob: true,
          logFile: path.join(process.projectDir, `${jobFileName}.log`)
        })
      )
    })

    it('should pass wait as true if returnStatusOnly flag is present', async () => {
      await executeCommandWrapper([jobPath, '--returnStatusOnly'])

      expect(viyaExecuteModule.executeJobViya).toHaveBeenCalledWith(
        ...executeCalledWith({
          jobPath,
          waitForJob: true,
          returnStatusOnly: true
        })
      )
    })

    it('should parse sasjs job execute command with all arguments', async () => {
      await executeCommandWrapper([
        jobPath,
        '--target',
        'test',
        '--log',
        log,
        '--output',
        output,
        '--statusFile',
        statusFile,
        '--source',
        source,
        '--returnStatusOnly',
        '--ignoreWarnings',
        '--wait',
        '--streamLog'
      ])

      expect(viyaExecuteModule.executeJobViya).toHaveBeenCalledWith(
        ...executeCalledWith({
          jobPath,
          waitForJob: true,
          output,
          logFile: path.join(projectFolder, log),
          statusFile: path.join(projectFolder, statusFile),
          returnStatusOnly: true,
          ignoreWarnings: true,
          source,
          streamLog: true
        })
      )
    })

    it('should parse a sasjs job execute command with all shorthand arguments', async () => {
      await executeCommandWrapper([
        jobPath,
        '-t',
        'test',
        '-l',
        log,
        '-o',
        output,
        '--statusFile',
        statusFile,
        '-s',
        source,
        '-r',
        '-i',
        '-w',
        '--streamLog'
      ])

      expect(viyaExecuteModule.executeJobViya).toHaveBeenCalledWith(
        ...executeCalledWith({
          jobPath,
          waitForJob: true,
          output,
          logFile: path.join(projectFolder, log),
          statusFile: path.join(projectFolder, statusFile),
          returnStatusOnly: true,
          ignoreWarnings: true,
          source,
          streamLog: true
        })
      )
    })

    it('should log success and return the success code when execution is successful', async () => {
      const returnCode = await executeCommandWrapper([jobPath])

      expect(returnCode).toEqual(ReturnCode.Success)
    })

    it('should return the error code when getting Auth Config is unsuccessful', async () => {
      jest
        .spyOn(configUtils, 'getSASjsAndAuthConfig')
        .mockImplementation(() => Promise.reject(new Error('Test Error')))

      const returnCode = await executeCommandWrapper([jobPath])

      expect(returnCode).toEqual(ReturnCode.InternalError)
      expect(process.logger.error).toHaveBeenCalled()
    })

    it('should log the error and return the error code when execution is unsuccessful', async () => {
      jest
        .spyOn(viyaExecuteModule, 'executeJobViya')
        .mockImplementation(() => Promise.reject(new Error('Test Error')))

      const returnCode = await executeCommandWrapper([jobPath])

      expect(returnCode).toEqual(ReturnCode.InternalError)
      expect(process.logger.error).toHaveBeenCalled()
    })
  })

  describe('for server type sas9', () => {
    beforeEach(() => {
      setupMocksForSAS9()
    })

    it('should return the error code when user credentials are not found', async () => {
      const username = process.env.SAS_USERNAME
      const password = process.env.SAS_PASSWORD
      process.env.SAS_USERNAME = ''
      process.env.SAS_PASSWORD = ''
      jest
        .spyOn(configUtils, 'findTargetInConfiguration')
        .mockImplementation(() =>
          Promise.resolve({
            target: sas9TargetWithoutAuthConfig,
            isLocal: true
          })
        )

      const returnCode = await executeCommandWrapper([jobPath])

      expect(returnCode).toEqual(ReturnCode.InternalError)
      expect(process.logger.error).toHaveBeenCalled()

      process.env.SAS_USERNAME = username
      process.env.SAS_PASSWORD = password
    })

    it('should log success and return the success code when execution is successful', async () => {
      jest
        .spyOn(sas9ExecuteModule, 'executeJobSas9')
        .mockImplementation(() => Promise.resolve())
      const returnCode = await executeCommandWrapper([jobPath])
      expect(returnCode).toEqual(ReturnCode.Success)
    })

    it('should log the error and return the error code when execution is unsuccessful', async () => {
      jest
        .spyOn(sas9ExecuteModule, 'executeJobSas9')
        .mockImplementation(() => Promise.reject(new Error('Test Error')))

      const returnCode = await executeCommandWrapper([jobPath])

      expect(returnCode).toEqual(ReturnCode.InternalError)
      expect(process.logger.error).toHaveBeenCalled()
    })

    it('should log success and return the success code with source argument', async () => {
      const returnCode = await executeCommandWrapper([
        jobPath,
        '--source',
        'testSource/source.json'
      ])
      expect(returnCode).toEqual(ReturnCode.Success)
    })

    it('should log the error and return the error code when source argument is provide but source file does not exists', async () => {
      const returnCode = await executeCommandWrapper([
        jobPath,
        '--source',
        'source.json'
      ])
      expect(returnCode).toEqual(ReturnCode.InternalError)
      expect(process.logger.error).toHaveBeenCalled()
    })

    it('should log the error and return the error code when source argument is provide but source does not contain valid macroVars', async () => {
      const returnCode = await executeCommandWrapper([
        jobPath,
        '--source',
        'testSource/invalid.json'
      ])
      expect(returnCode).toEqual(ReturnCode.InternalError)
      expect(process.logger.error).toHaveBeenCalled()
    })

    it('should log success and return the success code with log argument', async () => {
      jest
        .spyOn(utilsModule, 'saveLog')
        .mockImplementation(() => Promise.resolve())

      const returnCode = await executeCommandWrapper([
        jobPath,
        '--log',
        'sample.log'
      ])
      expect(returnCode).toEqual(ReturnCode.Success)
    })

    it('should log success and return the success code with output argument', async () => {
      jest
        .spyOn(SasjsUtilsFilesModule, 'createFile')
        .mockImplementation(() => Promise.resolve())
      const returnCode = await executeCommandWrapper([
        jobPath,
        '--output',
        'output.json'
      ])
      expect(returnCode).toEqual(ReturnCode.Success)
    })
  })
})

const setupMocksForViya = () => {
  jest.resetAllMocks()
  jest.mock('../internal/execute')
  jest.mock('../../../utils/config')
  jest
    .spyOn(viyaExecuteModule, 'executeJobViya')
    .mockImplementation(() => Promise.resolve())

  jest
    .spyOn(configUtils, 'findTargetInConfiguration')
    .mockImplementation(() =>
      Promise.resolve({ target: targetViya, isLocal: true })
    )

  jest
    .spyOn(configUtils, 'getSASjsAndAuthConfig')
    .mockImplementation((target: Target) => {
      return Promise.resolve({
        sasjs: configUtils.getSASjs(target),
        authConfig: authConfig as AuthConfig
      })
    })

  process.logger = new Logger(LogLevel.Off)
  jest.spyOn(process.logger, 'error')
}

const setupMocksForSAS9 = () => {
  jest.resetAllMocks()
  jest.mock('../internal/execute')
  jest.spyOn(SASjs.prototype, 'request').mockImplementation(() =>
    Promise.resolve({
      status: 200,
      result: { data: 'test data' },
      log: 'test log'
    })
  )
  jest
    .spyOn(configUtils, 'findTargetInConfiguration')
    .mockImplementation(() =>
      Promise.resolve({ target: target9, isLocal: true })
    )

  process.logger = new Logger(LogLevel.Off)
  jest.spyOn(process.logger, 'error')
}

interface executeWrapperParams {
  jobPath: string
  waitForJob?: boolean
  output?: string | boolean
  logFile?: string
  statusFile?: string
  returnStatusOnly?: boolean
  ignoreWarnings?: boolean
  source?: string
  streamLog?: boolean
}

const executeCalledWith = ({
  jobPath,
  waitForJob = false,
  output = false,
  logFile = undefined,
  statusFile = undefined,
  returnStatusOnly = false,
  ignoreWarnings = false,
  source = undefined,
  streamLog = false
}: executeWrapperParams) => [
  expect.anything(),
  authConfig,
  jobPath,
  targetViya,
  waitForJob,
  output,
  logFile,
  statusFile,
  returnStatusOnly,
  ignoreWarnings,
  source,
  streamLog
]

const executeCommandWrapper = async (additionalParams: string[]) => {
  let subCommand = 'execute'
  const args = [...defaultArgs, ...additionalParams].map((arg: string) => {
    if (arg === 'execute') {
      arg = Math.random() > 0.5 ? 'exec' : arg
      subCommand = arg
    }

    return arg
  })

  const command = new JobCommand(args)
  const returnCode = await command.execute()

  expect(command.name).toEqual('job')
  expect(command.subCommand).toEqual(subCommand)

  return returnCode
}

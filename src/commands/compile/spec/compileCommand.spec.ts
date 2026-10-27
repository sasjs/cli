import path from 'path'
import os from 'os'
import * as compileModule from '../compile'
import * as compileSingleFileModule from '../compileSingleFile'
import * as identifySasFileModule from '../internal/identifySasFile'
import { SasFileType } from '../internal'
import { CompileCommand } from '../compileCommand'
import { Logger, LogLevel, ServerType, Target } from '@sasjs/utils'
import { setConstants } from '../../../utils'
import * as configUtils from '../../../utils/config'
import * as setConstantsUtils from '../../../utils/setConstants'
import { ReturnCode } from '../../../types/command'

const target = new Target({
  name: 'test',
  appLoc: '/Public/test/',
  serverType: ServerType.SasViya,
  contextName: 'test context'
})
const defaultArgs = ['node', 'sasjs']

describe('CompileCommand', () => {
  beforeAll(async () => {
    await setConstants(false)
  })

  beforeEach(() => {
    setupMocks()
  })

  it('should parse a simple sasjs compile command', () => {
    const args = [...defaultArgs, 'compile']

    const command = new CompileCommand(args)

    expect(command.name).toEqual('compile')
    expect(command.subCommand).toEqual('')
  })

  it('should parse a shorthand sasjs compile command', () => {
    const args = [...defaultArgs, 'c']

    const command = new CompileCommand(args)

    expect(command.name).toEqual('compile')
    expect(command.subCommand).toEqual('')
  })

  it('should parse a sasjs compile command with a target', async () => {
    const args = [...defaultArgs, 'compile', '--target', 'test']

    const command = new CompileCommand(args)
    const targetInfo = await command.getTargetInfo()

    expect(command.name).toEqual('compile')
    expect(command.subCommand).toEqual('')
    expect(JSON.stringify(targetInfo.target)).toEqual(JSON.stringify(target))
    expect(targetInfo.isLocal).toBeTrue()
  })

  it('should parse a sasjs compile command with a shorthand target argument', async () => {
    const args = [...defaultArgs, 'compile', '-t', 'test']

    const command = new CompileCommand(args)
    const targetInfo = await command.getTargetInfo()

    expect(command.name).toEqual('compile')
    expect(command.subCommand).toEqual('')
    expect(targetInfo.target).toEqual(target)
    expect(targetInfo.isLocal).toBeTrue()
  })

  it('should call the compile handler when executed with the correct target', async () => {
    const args = [...defaultArgs, 'compile', '-t', 'test']

    const command = new CompileCommand(args)
    await command.execute()

    expect(compileModule.compile).toHaveBeenCalledWith(target, true)
  })

  it('should log success and return the success code when execution is successful', async () => {
    const args = [...defaultArgs, 'compile', '-t', 'test']

    const command = new CompileCommand(args)
    const returnCode = await command.execute()

    const { buildDestinationFolder } = process.sasjsConstants
    const expectedLoggedMessage = `The project was successfully compiled for ${target.serverType} using target '${target.name}'\nThe compile output is located in the ${buildDestinationFolder} directory.`

    expect(returnCode).toEqual(ReturnCode.Success)
    expect(process.logger.success).toHaveBeenNthCalledWith(
      1,
      expectedLoggedMessage
    )
  })

  it('should log the error and return the error code when execution is unsuccessful', async () => {
    const args = [...defaultArgs, 'compile', '-t', 'test']
    jest
      .spyOn(compileModule, 'compile')
      .mockImplementation(() => Promise.reject(new Error('Test Error')))

    const command = new CompileCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(process.logger.error).toHaveBeenCalled()
  })
})

describe('CompileCommand', () => {
  const defaultArgs = ['node', 'sasjs']
  const target = new Target({
    name: 'test',
    appLoc: '/Public/test/',
    serverType: ServerType.SasViya,
    contextName: 'test context'
  })

  beforeAll(async () => {
    await setConstants(false)
  })

  beforeEach(() => {
    setupMocks()
  })

  it('should parse a simple sasjs compile command', () => {
    const args = [...defaultArgs, 'compile', 'service', '--source', 'test.sas']

    const command = new CompileCommand(args)

    expect(command.name).toEqual('compile')
    expect(command.subCommand).toEqual('service')
  })

  it('should parse a shorthand sasjs compile command', () => {
    const args = [...defaultArgs, 'c', 'job', '-s', './test.sas']

    const command = new CompileCommand(args)

    expect(command.name).toEqual('compile')
    expect(command.subCommand).toEqual('job')
  })

  it('should parse a sasjs compile command with a target', async () => {
    const args = [
      ...defaultArgs,
      'compile',
      'job',
      '--target',
      'test',
      '-s',
      'test.sas'
    ]

    const command = new CompileCommand(args)
    const targetInfo = await command.getTargetInfo()

    expect(command.name).toEqual('compile')
    expect(command.subCommand).toEqual('job')
    expect(JSON.stringify(targetInfo.target)).toEqual(JSON.stringify(target))
    expect(targetInfo.isLocal).toBeTrue()
  })

  it('should parse a sasjs compile command with a shorthand target argument', async () => {
    const args = [
      ...defaultArgs,
      'compile',
      'job',
      '-t',
      'test',
      '-s',
      'test.sas'
    ]

    const command = new CompileCommand(args)
    const targetInfo = await command.getTargetInfo()

    expect(command.name).toEqual('compile')
    expect(command.subCommand).toEqual('job')
    expect(JSON.stringify(targetInfo.target)).toEqual(JSON.stringify(target))
    expect(targetInfo.isLocal).toBeTrue()
  })

  it('should call the compileSingleFile handler when executed with the correct target', async () => {
    const args = [
      ...defaultArgs,
      'compile',
      'job',
      '-t',
      'test',
      '-s',
      path.join(os.homedir(), 'test.sas')
    ]

    const command = new CompileCommand(args)
    await command.execute()

    const expectedTarget: { [key: string]: any } = {}

    Object.keys(target).forEach((key: string) => {
      expectedTarget[key] = (target as any)[key]
    })

    delete expectedTarget.getConfig

    expect(compileSingleFileModule.compileSingleFile).toHaveBeenCalledWith(
      expect.objectContaining(expectedTarget),
      'job',
      path.join(os.homedir(), 'test.sas'),
      undefined
    )
  })

  it('should log success and return the success code when execution is successful', async () => {
    const args = [
      ...defaultArgs,
      'compile',
      'job',
      '-t',
      'test',
      '-s',
      path.join(os.homedir(), 'test.sas')
    ]

    const command = new CompileCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.Success)
    expect(process.logger.success).toHaveBeenCalled()
  })

  it('should log the error and return the error code when execution is unsuccessful', async () => {
    const args = [
      ...defaultArgs,
      'compile',
      'job',
      '-t',
      'test',
      '-s',
      path.join(os.homedir(), 'test.sas')
    ]
    jest
      .spyOn(compileSingleFileModule, 'compileSingleFile')
      .mockImplementation(() => Promise.reject(new Error('Test Error')))

    const command = new CompileCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(process.logger.error).toHaveBeenCalled()
  })

  it('should return the output base for a job when specified', () => {
    const args = [
      ...defaultArgs,
      'compile',
      'job',
      '-t',
      'test',
      '-s',
      './test.sas',
      '-o',
      os.homedir()
    ]
    const command = new CompileCommand(args)

    // the base only - the type folder and the file's own path are added by
    // compileSingleFile
    expect(command.getOutputPath()).toEqual(os.homedir())
  })

  it('should return the output base for a service when specified', () => {
    const args = [
      ...defaultArgs,
      'compile',
      'service',
      '-t',
      'test',
      '-s',
      './test.sas',
      '-o',
      os.homedir()
    ]
    const command = new CompileCommand(args)

    expect(command.getOutputPath()).toEqual(os.homedir())
  })

  it('should leave the destination to the compile when not specified', () => {
    const args = [
      ...defaultArgs,
      'compile',
      'job',
      '-t',
      'test',
      '-s',
      '/dev/test.sas'
    ]
    const command = new CompileCommand(args)

    // the default for the type lives in compileSingleFile, not here
    expect(command.getOutputPath()).toBeUndefined()
  })

  it('should leave the destination to the compile for a service too', () => {
    const args = [
      ...defaultArgs,
      'compile',
      'service',
      '-t',
      'test',
      '-s',
      '/dev/test.sas'
    ]
    const command = new CompileCommand(args)

    expect(command.getOutputPath()).toBeUndefined()
  })

  it('should pass identify through for a job source', async () => {
    jest
      .spyOn(identifySasFileModule, 'identifySasFile')
      .mockImplementation(() => Promise.resolve(SasFileType.Job))

    const args = [
      ...defaultArgs,
      'compile',
      'identify',
      '-t',
      'test',
      '-s',
      '/dev/test.sas'
    ]
    const command = new CompileCommand(args)

    await command.execute()

    // the type is left to compileSingleFile, which is the only place that
    // resolves 'identify'
    expect(compileSingleFileModule.compileSingleFile).toHaveBeenCalledWith(
      expect.anything(),
      'identify',
      '/dev/test.sas',
      undefined
    )
  })

  it('should pass identify through for a service source', async () => {
    jest
      .spyOn(identifySasFileModule, 'identifySasFile')
      .mockImplementation(() => Promise.resolve(SasFileType.Service))

    const args = [
      ...defaultArgs,
      'compile',
      'identify',
      '-t',
      'test',
      '-s',
      '/dev/test.sas'
    ]
    const command = new CompileCommand(args)

    await command.execute()

    expect(compileSingleFileModule.compileSingleFile).toHaveBeenCalledWith(
      expect.anything(),
      'identify',
      '/dev/test.sas',
      undefined
    )
  })
})

const setupMocks = () => {
  jest.resetAllMocks()
  jest.mock('../compile')
  jest.mock('../compileSingleFile')
  jest.mock('../../../utils/config')
  jest.mock('../../../utils/setConstants')

  jest
    .spyOn(compileModule, 'compile')
    .mockImplementation(() => Promise.resolve())

  jest
    .spyOn(configUtils, 'findTargetInConfiguration')
    .mockImplementation(() => Promise.resolve({ target, isLocal: true }))

  jest
    .spyOn(configUtils, 'getLocalConfig')
    .mockImplementation(() => Promise.resolve({}))

  jest
    .spyOn(setConstantsUtils, 'setConstants')
    .mockImplementation(() => Promise.resolve())

  process.logger = new Logger(LogLevel.Off)
  jest.spyOn(process.logger, 'success')
  jest.spyOn(process.logger, 'error')

  jest
    .spyOn(compileSingleFileModule, 'compileSingleFile')
    .mockImplementation(() =>
      Promise.resolve({ destinationPath: './test.sas' })
    )
}

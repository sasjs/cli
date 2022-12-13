import path from 'path'
import os from 'os'
import * as compileModule from '../compile'
import * as compileSingleFileModule from '../compileSingleFile'
import { CompileCommand } from '../compileCommand'
import { Logger, LogLevel, ServerType, Target } from '@sasjs/utils'
import * as configUtils from '../../../utils/config'
import { ReturnCode } from '../../../types/command'
import { setConstants } from '../../../utils'

const target = new Target({
  name: 'test',
  appLoc: '/Public/test/',
  serverType: ServerType.SasViya,
  contextName: 'test context'
})
const defaultArgs = ['node', 'sasjs']

describe('CompileCommand', () => {
  beforeAll(async () => {
    await setConstants()
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
    await setConstants()
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
      expect.anything()
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

  it('should return the output path for a job when specified', () => {
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

    const output = command.output

    expect(output).toEqual(path.join(os.homedir(), 'jobs'))
  })

  it('should return the output path for a service when specified', () => {
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

    const output = command.output

    expect(output).toEqual(path.join(os.homedir(), 'services'))
  })

  it('should return the output path for a job when not specified', () => {
    const args = [
      ...defaultArgs,
      'compile',
      'job',
      '-t',
      'test',
      '-s',
      '/dev/test.sas'
    ]
    const { buildDestinationJobsFolder } = process.sasjsConstants
    const command = new CompileCommand(args)

    const output = command.output

    expect(output).toEqual(path.join(buildDestinationJobsFolder, 'dev'))
  })

  it('should return the output path for a service when not specified', () => {
    const args = [
      ...defaultArgs,
      'compile',
      'service',
      '-t',
      'test',
      '-s',
      '/dev/test.sas'
    ]
    const { buildDestinationServicesFolder } = process.sasjsConstants
    const command = new CompileCommand(args)

    const output = command.output

    expect(output).toEqual(path.join(buildDestinationServicesFolder, 'dev'))
  })
})

const setupMocks = () => {
  jest.resetAllMocks()
  jest.mock('../compile')
  jest.mock('../compileSingleFile')
  jest.mock('../../../utils/config')
  jest
    .spyOn(compileModule, 'compile')
    .mockImplementation(() => Promise.resolve())

  jest
    .spyOn(configUtils, 'findTargetInConfiguration')
    .mockImplementation(() => Promise.resolve({ target, isLocal: true }))

  process.logger = new Logger(LogLevel.Off)
  jest.spyOn(process.logger, 'success')
  jest.spyOn(process.logger, 'error')

  jest
    .spyOn(compileSingleFileModule, 'compileSingleFile')
    .mockImplementation(() =>
      Promise.resolve({ destinationPath: './test.sas' })
    )
}

import * as compileSingleFileModule from '../compileSingleFile'
import { CompileSingleFileCommand } from '../compileSingleFileCommand'
import { Logger, LogLevel, ServerType, Target } from '@sasjs/utils'
import * as configUtils from '../../../utils/config'
import { ReturnCode } from '../../../types/command'
import path from 'path'
import os from 'os'
import { getConstants } from '../../../constants'

describe('CompileSingleFileCommand', () => {
  const defaultArgs = ['node', 'sasjs']
  const target = new Target({
    name: 'test',
    appLoc: '/Public/test/',
    serverType: ServerType.SasViya,
    contextName: 'test context'
  })

  beforeEach(() => {
    jest.resetAllMocks()
    jest.mock('../compile')
    jest.mock('../../../utils/config')
    jest
      .spyOn(compileSingleFileModule, 'compileSingleFile')
      .mockImplementation(() =>
        Promise.resolve({ destinationPath: './test.sas' })
      )

    jest
      .spyOn(configUtils, 'findTargetInConfiguration')
      .mockImplementation(() => Promise.resolve({ target, isLocal: true }))

    process.logger = new Logger(LogLevel.Off)
    jest.spyOn(process.logger, 'success')
    jest.spyOn(process.logger, 'error')
  })

  it('should parse a simple sasjs compile command', () => {
    const args = [...defaultArgs, 'compile', 'service', '--source', 'test.sas']

    const command = new CompileSingleFileCommand(args)

    expect(command.name).toEqual('compile')
    expect(command.subCommand).toEqual('service')
  })

  it('should parse a shorthand sasjs compile command', () => {
    const args = [...defaultArgs, 'c', 'job', '-s', './test.sas']

    const command = new CompileSingleFileCommand(args)

    expect(command.name).toEqual('compile')
    expect(command.subCommand).toEqual('job')
  })

  it('should parse a sasjs compile command with a target', async () => {
    const args = [
      ...defaultArgs,
      'compile',
      '--target',
      'test',
      '-s',
      'test.sas'
    ]

    const command = new CompileSingleFileCommand(args)
    const targetInfo = await command.target

    expect(command.name).toEqual('compile')
    expect(command.subCommand).toEqual('')
    expect(targetInfo.target).toEqual(target)
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

    const command = new CompileSingleFileCommand(args)
    const targetInfo = await command.target

    expect(command.name).toEqual('compile')
    expect(command.subCommand).toEqual('job')
    expect(targetInfo.target).toEqual(target)
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

    const command = new CompileSingleFileCommand(args)
    await command.execute()

    expect(compileSingleFileModule.compileSingleFile).toHaveBeenCalledWith(
      target,
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

    const command = new CompileSingleFileCommand(args)
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

    const command = new CompileSingleFileCommand(args)
    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(process.logger.error).toHaveBeenCalled()
  })

  it('should return the output path for a job when specified', async () => {
    const args = [
      ...defaultArgs,
      'compile',
      'job',
      '-t',
      'test',
      '-s',
      'test.sas',
      '-o',
      os.homedir()
    ]
    const command = new CompileSingleFileCommand(args)

    const output = await command.output

    expect(output).toEqual(path.join(os.homedir(), 'jobs'))
  })

  it('should return the output path for a service when specified', async () => {
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
    const command = new CompileSingleFileCommand(args)

    const output = await command.output

    expect(output).toEqual(path.join(os.homedir(), 'services'))
  })

  it('should return the output path for a job when not specified', async () => {
    const args = [
      ...defaultArgs,
      'compile',
      'job',
      '-t',
      'test',
      '-s',
      '/dev/test.sas'
    ]
    const { buildDestinationJobsFolder } = await getConstants()
    const command = new CompileSingleFileCommand(args)

    const output = await command.output

    expect(output).toEqual(path.join(buildDestinationJobsFolder, 'dev'))
  })

  it('should return the output path for a service when not specified', async () => {
    const args = [
      ...defaultArgs,
      'compile',
      'service',
      '-t',
      'test',
      '-s',
      '/dev/test.sas'
    ]
    const { buildDestinationServicesFolder } = await getConstants()
    const command = new CompileSingleFileCommand(args)

    const output = await command.output

    expect(output).toEqual(path.join(buildDestinationServicesFolder, 'dev'))
  })
})

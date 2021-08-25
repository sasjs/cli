import { cli } from './cli'
import { mockProcessExit } from './utils/test'
import * as envVariablesModule from './utils/loadEnvVariables'
import * as projectDirModule from './utils/setProjectDir'
import * as parseModule from './types/command/parse'
import { Logger } from '@sasjs/utils'
import { CommandBase } from './types/command/commandBase'
import { ReturnCode } from './types/command'

const args = ['/usr/local/bin/node', '/usr/local/bin/sasjs', 'mock', 'command']

class MockCommand extends CommandBase {
  constructor(args: string[]) {
    super(args, {
      syntax: 'mock <command>'
    })
  }
  public async execute() {
    return 0
  }
}

const mockCommand = new MockCommand(args)

describe('CLI command parsing', () => {
  beforeEach(() => {
    setupMocks()
  })

  it('should set up common infrastructure before parsing the command', async () => {
    await cli(args)

    expect(envVariablesModule.loadProjectEnvVariables).toHaveBeenCalledTimes(1)
    expect(projectDirModule.setProjectDir).toHaveBeenCalledTimes(1)
    expect(projectDirModule.setProjectDir).toHaveBeenCalledWith(args)
    expect(process.logger).toBeInstanceOf(Logger)
  })

  it('should parse the command passed in', async () => {
    await cli(args)

    expect(parseModule.parse).toHaveBeenCalledTimes(1)
    expect(parseModule.parse).toHaveBeenCalledWith(args)
  })

  it('should execute the command when successfully parsed', async () => {
    await cli(args)

    expect(process.logger).toBeInstanceOf(Logger)
    expect(mockCommand.execute).toHaveBeenCalledTimes(1)
  })

  it('should return with the correct exit code after successful execution', async () => {
    await cli(args)

    expect(process.exit).toHaveBeenCalledWith(0)
  })

  it('should return with the correct exit code on errors', async () => {
    jest
      .spyOn(mockCommand, 'execute')
      .mockImplementation(() => Promise.resolve(ReturnCode.InternalError))
    await cli(args)

    expect(process.exit).toHaveBeenCalledWith(2)
  })
})

const setupMocks = () => {
  jest.resetAllMocks()
  mockProcessExit()
  jest.mock('./utils')
  jest.mock('./types/command')

  jest
    .spyOn(envVariablesModule, 'loadProjectEnvVariables')
    .mockImplementation(() => Promise.resolve())
  jest
    .spyOn(projectDirModule, 'setProjectDir')
    .mockImplementation(() => Promise.resolve())
  jest.spyOn(parseModule, 'parse').mockImplementation(() => mockCommand)
  jest.spyOn(mockCommand, 'execute')
}

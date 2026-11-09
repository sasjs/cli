import { cli, closestCommand, unknownCommandMessage } from './cli'
import { mockProcessExit } from './utils/test'
import * as envVariablesModule from './utils/loadEnvVariables'
import * as projectDirModule from './utils/setProjectDir'
import * as parseModule from './types/command/parse'
import * as helpModule from './commands/help/help'
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

  describe('when the arguments name no command', () => {
    const helpSpy = () =>
      jest
        .spyOn(helpModule, 'printHelpText')
        .mockImplementation(() =>
          Promise.resolve({ outputCommands: '', outputAliases: '' })
        )

    it('should print the whole help when no command is given', async () => {
      jest.spyOn(parseModule, 'parse').mockImplementation(() => undefined)
      jest
        .spyOn(parseModule, 'requestedCommandName')
        .mockImplementation(() => '')
      jest.spyOn(parseModule, 'commandNames').mockImplementation(() => ['run'])
      const help = helpSpy()

      await cli(['node', 'sasjs'])

      expect(help).toHaveBeenCalledTimes(1)
      expect(process.exit).toHaveBeenCalledWith(ReturnCode.InvalidCommand)
    })

    it('should list the commands when the name is unknown', async () => {
      jest.spyOn(parseModule, 'parse').mockImplementation(() => undefined)
      jest
        .spyOn(parseModule, 'requestedCommandName')
        .mockImplementation(() => 'frobnicate')
      jest
        .spyOn(parseModule, 'commandNames')
        .mockImplementation(() => ['run', 'lint'])
      const help = helpSpy()

      await cli(['node', 'sasjs', 'frobnicate'])

      // The full text is for `sasjs` on its own; a typo gets the list, which is
      // the part that answers it, rather than two hundred lines.
      expect(help).not.toHaveBeenCalled()
      expect(parseModule.commandNames).toHaveBeenCalled()
      expect(process.exit).toHaveBeenCalledWith(ReturnCode.InvalidCommand)
    })

    it('should not execute anything', async () => {
      jest.spyOn(parseModule, 'parse').mockImplementation(() => undefined)
      jest
        .spyOn(parseModule, 'requestedCommandName')
        .mockImplementation(() => 'x')
      jest.spyOn(parseModule, 'commandNames').mockImplementation(() => [])
      helpSpy()

      await cli(['node', 'sasjs', 'x'])

      expect(mockCommand.execute).not.toHaveBeenCalled()
    })
  })

  it('should return with the correct exit code on errors', async () => {
    jest
      .spyOn(mockCommand, 'execute')
      .mockImplementation(() => Promise.resolve(ReturnCode.InternalError))
    await cli(args)

    expect(process.exit).toHaveBeenCalledWith(2)
  })
})

describe('closestCommand', () => {
  it('suggests a command one letter away', () => {
    expect(closestCommand('logchek')).toEqual('logcheck')
  })

  it('suggests the command a prefix belongs to', () => {
    expect(closestCommand('logc')).toEqual('logcheck')
  })

  it('suggests nothing when the name is unrelated', () => {
    expect(closestCommand('frobnicate')).toBeUndefined()
  })
})

describe('unknownCommandMessage', () => {
  it('names the command that was typed', () => {
    expect(unknownCommandMessage('frobnicate')).toEqual(
      'Invalid SASjs command: frobnicate.'
    )
  })

  it('says no command was given when there is none', () => {
    expect(unknownCommandMessage('')).toEqual(
      'No command given - here is what this CLI can do.'
    )
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
  jest
    .spyOn(parseModule, 'requestedCommandName')
    .mockImplementation(() => 'mock')
  jest
    .spyOn(helpModule, 'printHelpText')
    .mockImplementation(() =>
      Promise.resolve({ outputCommands: '', outputAliases: '' })
    )
  jest.spyOn(mockCommand, 'execute')
}

import { SnippetsCommand } from '../snippetsCommand'
import * as snippetsModule from '../snippets'
import { ReturnCode } from '../../../types/command'
import { Configuration, ServerType, Target } from '@sasjs/utils'
import * as configUtils from '../../../utils/config'
import * as setConstantsUtils from '../../../utils/setConstants'
import { Logger, LogLevel } from '@sasjs/utils/logger'

const target = new Target({
  name: 'test',
  appLoc: '/Public/test/',
  serverType: ServerType.SasViya,
  contextName: 'test context'
})

const config: Configuration = {}

describe('SnippetsCommand', () => {
  const defaultArgs = ['node', 'sasjs']
  const commandName = 'snippets'

  beforeEach(() => {
    setupMocks()
  })

  it('should parse sasjs snippets command without flags', () => {
    const args = [...defaultArgs, commandName]

    const command = new SnippetsCommand(args)

    expect(command.name).toEqual(commandName)
  })

  it('should call snippets handler when executed', async () => {
    const args = [...defaultArgs, commandName]

    const command = new SnippetsCommand(args)

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.Success)
  })

  it('should parse a sasjs snippets command with a target', async () => {
    const args = [...defaultArgs, commandName, '-t', 'test']

    const command = new SnippetsCommand(args)
    const targetInfo = await command.getTargetInfo()

    expect(command.name).toEqual(commandName)
    expect(command.subCommand).toEqual('')
    expect(targetInfo.target).toEqual(target)
  })

  it('should return with the error code when execution fails', async () => {
    const args = [...defaultArgs, commandName]
    jest
      .spyOn(snippetsModule, 'generateSnippets')
      .mockImplementation(() => Promise.reject())
    const command = new SnippetsCommand(args)

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(process.logger.error).toHaveBeenCalled()
  })
})

const setupMocks = () => {
  jest.resetAllMocks()
  jest
    .spyOn(snippetsModule, 'generateSnippets')
    .mockImplementation(() => Promise.resolve(''))
  jest
    .spyOn(configUtils, 'findTargetInConfiguration')
    .mockImplementation(() => Promise.resolve({ target, isLocal: true }))
  jest
    .spyOn(configUtils, 'getLocalConfig')
    .mockImplementation(() => Promise.resolve(config))
  jest
    .spyOn(configUtils, 'findTargetInConfiguration')
    .mockImplementation(() => Promise.resolve({ target, isLocal: true }))
  jest
    .spyOn(setConstantsUtils, 'setConstants')
    .mockImplementation(() => Promise.resolve())

  process.logger = new Logger(LogLevel.Off)
  jest.spyOn(process.logger, 'success')
  jest.spyOn(process.logger, 'error')
}

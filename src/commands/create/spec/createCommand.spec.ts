import { Logger, LogLevel } from '@sasjs/utils/logger'
import { ReturnCode } from '../../../types/command'
import * as createModule from '../create'
import { CreateCommand } from '../createCommand'
import { CreateTemplate } from '../createTemplate'

describe('CreateCommand', () => {
  const defaultArgs = ['node', 'sasjs']

  beforeEach(() => {
    setupMocks()
  })

  it('should parse a simple sasjs create command', () => {
    const args = [...defaultArgs, 'create']

    const command = new CreateCommand(args)

    expect(command.name).toEqual('create')
    expect(command.value).toEqual('')
    expect(command.folderName).toEqual('.')
  })

  it('should parse a sasjs create command with a folder name', () => {
    const args = [...defaultArgs, 'create', 'test-app']

    const command = new CreateCommand(args)

    expect(command.name).toEqual('create')
    expect(command.folderName).toEqual('test-app')
  })

  it('should parse a sasjs create command with a template argument', () => {
    const args = [...defaultArgs, 'create', '-t', 'react']

    const command = new CreateCommand(args)

    expect(command.name).toEqual('create')
    expect(command.value).toEqual('')
    expect(command.folderName).toEqual('.')
    expect(command.template).toEqual(CreateTemplate.React)
  })

  it('should parse a sasjs create command with a template argument and folder name', () => {
    const args = [...defaultArgs, 'create', 'test-app', '--template', 'angular']

    const command = new CreateCommand(args)

    expect(command.name).toEqual('create')
    expect(command.folderName).toEqual('test-app')
    expect(command.template).toEqual(CreateTemplate.Angular)
  })

  it('should call the create handler when executed', async () => {
    const args = [...defaultArgs, 'create', 'test-app', '--template', 'angular']
    const command = new CreateCommand(args)

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.Success)
    expect(process.logger.success).toHaveBeenCalledWith(
      'Project test-app created successfully.\nGet ready to unleash your SAS!'
    )
  })

  it('should return an error code when the execution errors out', async () => {
    const args = [...defaultArgs, 'create', 'test-app', '--template', 'angular']
    jest
      .spyOn(createModule, 'create')
      .mockImplementation(() => Promise.reject(new Error('Test Error')))
    const command = new CreateCommand(args)

    const returnCode = await command.execute()

    expect(returnCode).toEqual(ReturnCode.InternalError)
    expect(process.logger.error).toHaveBeenCalledWith(
      'Error while creating your project: ',
      new Error('Test Error')
    )
  })
})

const setupMocks = () => {
  jest.resetAllMocks()
  jest.mock('../create')
  jest.mock('../../../utils/config')
  jest.spyOn(createModule, 'create').mockImplementation(() => Promise.resolve())

  process.logger = new Logger(LogLevel.Off)
  jest.spyOn(process.logger, 'success')
  jest.spyOn(process.logger, 'error')
}

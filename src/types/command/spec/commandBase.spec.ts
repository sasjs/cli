import { CommandBase } from '../commandBase'

describe('CommandBase', () => {
  const defaultArgs = ['node', 'sasjs']

  beforeEach(() => {
    jest.resetAllMocks()
    jest
      .spyOn(process, 'exit')
      .mockImplementation((code?: number) => code as never)
  })

  it('should parse a simple sasjs command', () => {
    const args = [...defaultArgs, 'create', 'test-app']

    const command = new CommandBase(args)

    expect(command.name).toEqual('create')
    expect(command.value).toEqual('test-app')
    expect(command.subCommand).toEqual('')
  })

  it('should parse a sasjs command with a subcommand', () => {
    const args = [...defaultArgs, 'flow', 'execute']

    const command = new CommandBase(args)

    expect(command.name).toEqual('flow')
    expect(command.value).toEqual('')
    expect(command.subCommand).toEqual('execute')
  })

  it('should parse a sasjs command with a value', () => {
    const args = [...defaultArgs, 'create', 'test-app']

    const command = new CommandBase(args)

    expect(command.name).toEqual('create')
    expect(command.value).toEqual('test-app')
    expect(command.subCommand).toEqual('')
  })

  it('should parse a sasjs command with a subcommand and a value', () => {
    const args = [
      ...defaultArgs,
      'job',
      'execute',
      '/path/to/job',
      '--ignoreWarnings'
    ]

    const command = new CommandBase(args, {
      parseOptions: { ignoreWarnings: { type: 'boolean' } }
    })

    expect(command.name).toEqual('job')
    expect(command.subCommand).toEqual('execute')
    expect(command.value).toEqual('/path/to/job')
  })

  it('should fail and exit when there is an unknown option', () => {
    const args = [
      ...defaultArgs,
      'job',
      'execute',
      '/path/to/job',
      '--invalidOption'
    ]

    new CommandBase(args)

    expect(process.exit).toHaveBeenCalledWith(1)
  })

  it('should throw an error when execute is called', async () => {
    const args = [...defaultArgs, 'test', 'command']

    const command = new CommandBase(args)
    const error = await command.execute().catch((e) => e)
    expect(error.message).toEqual(
      'CommandBase does not provide an `execute` method. Please implement the specific `execute` method for your command.'
    )
  })
})

import { AddTargetCommand } from '../addTargetCommand'
import * as addTargetModule from '../addTarget'

describe('AddTargetCommand', () => {
  const defaultArgs = ['node', 'sasjs']

  beforeEach(() => {
    jest.resetAllMocks()
    jest.mock('../addTarget')
    jest
      .spyOn(addTargetModule, 'addTarget')
      .mockImplementation(() => Promise.resolve(true))
  })

  it('should parse a simple sasjs add command', () => {
    const args = [...defaultArgs, 'add']

    const command = new AddTargetCommand(args)

    expect(command.name).toEqual('add')
    expect(command.insecure).toEqual(false)
  })

  it('should parse a sasjs add command with the insecure flag', () => {
    const args = [...defaultArgs, 'add', '--insecure']

    const command = new AddTargetCommand(args)

    expect(command.name).toEqual('add')
    expect(command.insecure).toEqual(true)
  })

  it('should parse a sasjs add command with the shorthand insecure flag', () => {
    const args = [...defaultArgs, 'add', '-i']

    const command = new AddTargetCommand(args)

    expect(command.name).toEqual('add')
    expect(command.insecure).toEqual(true)
  })

  it('should call the addTarget handler when executed with the insecure option', async () => {
    const args = [...defaultArgs, 'add', '-i']

    const command = new AddTargetCommand(args)
    await command.execute()

    expect(addTargetModule.addTarget).toHaveBeenCalledWith(true)
  })

  it('should call the addTarget handler when executed without the insecure option', async () => {
    const args = [...defaultArgs, 'add']

    const command = new AddTargetCommand(args)
    await command.execute()

    expect(addTargetModule.addTarget).toHaveBeenCalledWith(false)
  })
})

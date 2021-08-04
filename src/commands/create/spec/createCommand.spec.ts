import { CreateCommand } from '../createCommand'
import { CreateTemplate } from '../createTemplate'

describe('CreateCommand', () => {
  const defaultArgs = ['node', 'sasjs']

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
    expect(command.value).toEqual('test-app')
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
    expect(command.value).toEqual('test-app')
    expect(command.folderName).toEqual('test-app')
    expect(command.template).toEqual(CreateTemplate.Angular)
  })

  // it('should parse a sasjs create command with a template argument and folder name', () => {
  //   const args = [...defaultArgs, 'create', 'test-app', '--blast', 'angular']

  //   const command = new CreateCommand(args)

  //   expect(command.name).toEqual('create')
  //   expect(command.value).toEqual('test-app')
  //   expect(command.folderName).toEqual('test-app')
  //   // expect(command.template).toEqual(CreateTemplate.Angular)
  // })
})

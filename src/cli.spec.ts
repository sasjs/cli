import { removeFromGlobalConfig } from './utils/config'
import { cli } from './cli'
import {
  createTestApp,
  createTestGlobalTarget,
  mockProcessExit,
  removeTestApp
} from './utils/test'
import * as mainModule from './main'
import { ReturnCode } from './main'
import { Command } from './utils/command'
import { Target, generateTimestamp } from '@sasjs/utils'

describe('CLI command parsing', () => {
  let target: Target

  beforeEach(async () => {
    const appName = `cli-tests-${generateTimestamp()}`
    await createTestApp(__dirname, appName)
    target = await createTestGlobalTarget(
      appName,
      `/Public/app/cli-tests/${appName}`
    )
    mockProcessExit()
  })

  afterEach(async () => {
    await removeTestApp(__dirname, target.name)
    await removeFromGlobalConfig(target.name)
    jest.clearAllMocks()
  })

  it('should call the correct function for the create command', async () => {
    jest
      .spyOn(mainModule, 'createFileStructure')
      .mockImplementation(() => Promise.resolve(ReturnCode.Success))
    const args = [
      '/usr/local/bin/node',
      '/usr/local/bin/sasjs',
      'create',
      'testapp'
    ]

    await cli(args)

    expect(mainModule.createFileStructure).toHaveBeenCalledWith(
      new Command(['create', 'testapp'])
    )
  })

  it('should call the correct function for the create command with additional arguments', async () => {
    jest
      .spyOn(mainModule, 'createFileStructure')
      .mockImplementation(() => Promise.resolve(ReturnCode.Success))
    const args = [
      '/usr/local/bin/node',
      '/usr/local/bin/sasjs',
      'create',
      'testapp',
      '-t',
      'minimal'
    ]

    await cli(args)

    expect(mainModule.createFileStructure).toHaveBeenCalledWith(
      new Command(['create', 'testapp', '-t', 'minimal'])
    )
  })

  it('should call the correct function for the compile command', async () => {
    jest
      .spyOn(mainModule, 'compileServices')
      .mockImplementation(() => Promise.resolve(ReturnCode.Success))
    const args = ['/usr/local/bin/node', '/usr/local/bin/sasjs', 'compile']

    await cli(args)

    expect(mainModule.compileServices).toHaveBeenCalledWith(
      new Command(['compile'])
    )
  })

  it('should call the correct function for the build command', async () => {
    jest
      .spyOn(mainModule, 'buildServices')
      .mockImplementation(() => Promise.resolve(ReturnCode.Success))
    const args = [
      '/usr/local/bin/node',
      '/usr/local/bin/sasjs',
      'build',
      '-t',
      'viya'
    ]

    await cli(args)

    expect(mainModule.buildServices).toHaveBeenCalledWith(
      new Command(['build', '-t', 'viya'])
    )
  })

  it('should call the correct function for the deploy command', async () => {
    jest
      .spyOn(mainModule, 'deployServices')
      .mockImplementation(() => Promise.resolve(ReturnCode.Success))
    const args = [
      '/usr/local/bin/node',
      '/usr/local/bin/sasjs',
      'deploy',
      '-t',
      'viya'
    ]

    await cli(args)

    expect(mainModule.deployServices).toHaveBeenCalledWith(
      new Command(['deploy', '-t', 'viya'])
    )
  })

  it('should call the correct function for the db command', async () => {
    jest
      .spyOn(mainModule, 'buildDBs')
      .mockImplementation(() => Promise.resolve(ReturnCode.Success))
    const args = ['/usr/local/bin/node', '/usr/local/bin/sasjs', 'db']

    await cli(args)

    expect(mainModule.buildDBs).toHaveBeenCalledWith()
  })

  it('should call the correct function for the compilebuild command', async () => {
    jest
      .spyOn(mainModule, 'compileBuildServices')
      .mockImplementation(() => Promise.resolve(ReturnCode.Success))
    const args = ['/usr/local/bin/node', '/usr/local/bin/sasjs', 'cb']

    await cli(args)

    expect(mainModule.compileBuildServices).toHaveBeenCalledWith(
      new Command(['cb'])
    )
  })

  it('should call the correct function for the compilebuilddeploy command', async () => {
    jest
      .spyOn(mainModule, 'compileBuildDeployServices')
      .mockImplementation(() => Promise.resolve(ReturnCode.Success))
    const args = ['/usr/local/bin/node', '/usr/local/bin/sasjs', 'cbd']

    await cli(args)

    expect(mainModule.compileBuildDeployServices).toHaveBeenCalledWith(
      new Command(['cbd'])
    )
  })

  it('should call the correct function for the servicepack command', async () => {
    jest
      .spyOn(mainModule, 'servicepack')
      .mockImplementation(() => Promise.resolve(ReturnCode.Success))
    const args = [
      '/usr/local/bin/node',
      '/usr/local/bin/sasjs',
      'servicepack',
      'deploy'
    ]

    await cli(args)

    expect(mainModule.servicepack).toHaveBeenCalledWith(
      new Command(['servicepack', 'deploy'])
    )
  })

  it('should call the correct function for the help command', async () => {
    jest
      .spyOn(mainModule, 'showHelp')
      .mockImplementation(() => Promise.resolve(ReturnCode.Success))
    const args = ['/usr/local/bin/node', '/usr/local/bin/sasjs', 'help']

    await cli(args)

    expect(mainModule.showHelp).toHaveBeenCalledWith()
  })

  it('should call the correct function for the version command', async () => {
    jest
      .spyOn(mainModule, 'showVersion')
      .mockImplementation(() => Promise.resolve(ReturnCode.Success))
    const args = ['/usr/local/bin/node', '/usr/local/bin/sasjs', 'v']

    await cli(args)

    expect(mainModule.showVersion).toHaveBeenCalledWith()
  })

  it('should call the correct function for the web command', async () => {
    jest
      .spyOn(mainModule, 'buildWebApp')
      .mockImplementation(() => Promise.resolve(ReturnCode.Success))
    const args = ['/usr/local/bin/node', '/usr/local/bin/sasjs', 'web']

    await cli(args)

    expect(mainModule.buildWebApp).toHaveBeenCalledWith(new Command(['web']))
  })

  it('should call the correct function for the add command', async () => {
    jest
      .spyOn(mainModule, 'add')
      .mockImplementation(() => Promise.resolve(ReturnCode.Success))
    const args = ['/usr/local/bin/node', '/usr/local/bin/sasjs', 'add']

    await cli(args)

    expect(mainModule.add).toHaveBeenCalledWith(new Command(['add']))
  })

  it('should call the correct function for the run command', async () => {
    jest
      .spyOn(mainModule, 'run')
      .mockImplementation(() => Promise.resolve(ReturnCode.Success))
    const args = ['/usr/local/bin/node', '/usr/local/bin/sasjs', 'run']

    await cli(args)

    expect(mainModule.run).toHaveBeenCalledWith(new Command(['run']))
  })

  it('should call the correct function for the request command', async () => {
    jest
      .spyOn(mainModule, 'runRequest')
      .mockImplementation(() => Promise.resolve(ReturnCode.Success))
    const args = ['/usr/local/bin/node', '/usr/local/bin/sasjs', 'request']

    await cli(args)

    expect(mainModule.runRequest).toHaveBeenCalledWith(new Command(['request']))
  })

  it('should call the correct function for the context command', async () => {
    jest
      .spyOn(mainModule, 'context')
      .mockImplementation(() => Promise.resolve(ReturnCode.Success))
    const args = [
      '/usr/local/bin/node',
      '/usr/local/bin/sasjs',
      'context',
      'create'
    ]

    await cli(args)

    expect(mainModule.context).toHaveBeenCalledWith(
      new Command(['context', 'create'])
    )
  })

  it('should call the correct function for the folder command', async () => {
    jest
      .spyOn(mainModule, 'folderManagement')
      .mockImplementation(() => Promise.resolve(ReturnCode.Success))
    const args = [
      '/usr/local/bin/node',
      '/usr/local/bin/sasjs',
      'folder',
      'move'
    ]

    await cli(args)

    expect(mainModule.folderManagement).toHaveBeenCalledWith(
      new Command(['folder', 'move'])
    )
  })

  it('should call the correct function for the job command', async () => {
    jest
      .spyOn(mainModule, 'jobManagement')
      .mockImplementation(() => Promise.resolve(ReturnCode.Success))
    const args = [
      '/usr/local/bin/node',
      '/usr/local/bin/sasjs',
      'job',
      'execute'
    ]

    await cli(args)

    expect(mainModule.jobManagement).toHaveBeenCalledWith(
      new Command(['job', 'execute'])
    )
  })

  it('should call the correct function for the flow command', async () => {
    jest
      .spyOn(mainModule, 'flowManagement')
      .mockImplementation(() => Promise.resolve(ReturnCode.Success))
    const args = [
      '/usr/local/bin/node',
      '/usr/local/bin/sasjs',
      'flow',
      'execute'
    ]

    await cli(args)

    expect(mainModule.flowManagement).toHaveBeenCalledWith(
      new Command(['flow', 'execute'])
    )
  })

  it('should call the correct function for the lint command', async () => {
    jest
      .spyOn(mainModule, 'lint')
      .mockImplementation(() => Promise.resolve(ReturnCode.Success))
    const args = ['/usr/local/bin/node', '/usr/local/bin/sasjs', 'lint']

    await cli(args)

    expect(mainModule.lint).toHaveBeenCalledTimes(1)
  })

  it('should exit with an error when an invalid command is entered', async () => {
    jest
      .spyOn(process, 'exit')
      .mockImplementation(
        (code: number | undefined) => console.log(code) as never
      )
    const args = [
      '/usr/local/bin/node',
      '/usr/local/bin/sasjs',
      'garbage',
      'dispose'
    ]

    await cli(args)

    expect(process.exit).toHaveBeenCalledWith(1)
  })
})

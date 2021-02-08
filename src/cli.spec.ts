import { removeFromGlobalConfig } from './utils/config'
import { checkAndSetProjectDirectory, cli } from './cli'
import {
  createTestApp,
  createTestGlobalTarget,
  mockProcessExit,
  removeTestApp
} from './utils/test'
import { generateTimestamp } from './utils/utils'
import * as mainModule from './main'
import { ReturnCode } from './main'
import { Command } from './utils/command'
import { Target } from '@sasjs/utils'

describe('checkAndSetProjectDirectory', () => {
  let target: Target

  beforeEach(async (done) => {
    const appName = `cli-tests-${generateTimestamp()}`
    await createTestApp(__dirname, appName)
    target = await createTestGlobalTarget(
      appName,
      `/Public/app/cli-tests/${appName}`
    )

    mockProcessExit()
    done()
  })

  afterEach(async (done) => {
    await removeTestApp(__dirname, target.name)
    await removeFromGlobalConfig(target.name)
    jest.clearAllMocks()
    done()
  })

  it('should not throw an error when the current folder is a SASjs project', async (done) => {
    await expect(checkAndSetProjectDirectory()).resolves.toEqual(undefined)
    done()
  })

  it('should throw an error when the current folder is not a SASjs project', async (done) => {
    await removeTestApp(__dirname, target.name)
    await expect(checkAndSetProjectDirectory()).rejects.toThrow(
      `${process.projectDir} is not a SASjs project directory or sub-directory. Please set up your SASjs app first using \`sasjs create\`.\nYou can find more info on this and all other SASjs commands at https://cli.sasjs.io/.`
    )
    done()
  })
})

describe('CLI command parsing', () => {
  let target: Target

  beforeEach(async (done) => {
    const appName = `cli-tests-${generateTimestamp()}`
    await createTestApp(__dirname, appName)
    target = await createTestGlobalTarget(
      appName,
      `/Public/app/cli-tests/${appName}`
    )
    mockProcessExit()
    done()
  })

  afterEach(async (done) => {
    await removeTestApp(__dirname, target.name)
    await removeFromGlobalConfig(target.name)
    jest.clearAllMocks()
    done()
  })

  it('should call the correct function for the create command', async (done) => {
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
    done()
  })

  it('should call the correct function for the create command with additional arguments', async (done) => {
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
    done()
  })

  it('should call the correct function for the compile command', async (done) => {
    jest
      .spyOn(mainModule, 'compileServices')
      .mockImplementation(() => Promise.resolve(ReturnCode.Success))
    const args = ['/usr/local/bin/node', '/usr/local/bin/sasjs', 'compile']

    await cli(args)

    expect(mainModule.compileServices).toHaveBeenCalledWith(
      new Command(['compile'])
    )
    done()
  })

  it('should call the correct function for the build command', async (done) => {
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
    done()
  })

  it('should call the correct function for the deploy command', async (done) => {
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
    done()
  })

  it('should call the correct function for the db command', async (done) => {
    jest
      .spyOn(mainModule, 'buildDBs')
      .mockImplementation(() => Promise.resolve(ReturnCode.Success))
    const args = ['/usr/local/bin/node', '/usr/local/bin/sasjs', 'db']

    await cli(args)

    expect(mainModule.buildDBs).toHaveBeenCalledWith()
    done()
  })

  it('should call the correct function for the compilebuild command', async (done) => {
    jest
      .spyOn(mainModule, 'compileBuildServices')
      .mockImplementation(() => Promise.resolve(ReturnCode.Success))
    const args = ['/usr/local/bin/node', '/usr/local/bin/sasjs', 'cb']

    await cli(args)

    expect(mainModule.compileBuildServices).toHaveBeenCalledWith(
      new Command(['cb'])
    )
    done()
  })

  it('should call the correct function for the compilebuilddeploy command', async (done) => {
    jest
      .spyOn(mainModule, 'compileBuildDeployServices')
      .mockImplementation(() => Promise.resolve(ReturnCode.Success))
    const args = ['/usr/local/bin/node', '/usr/local/bin/sasjs', 'cbd']

    await cli(args)

    expect(mainModule.compileBuildDeployServices).toHaveBeenCalledWith(
      new Command(['cbd'])
    )
    done()
  })

  it('should call the correct function for the servicepack command', async (done) => {
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
    done()
  })

  it('should call the correct function for the help command', async (done) => {
    jest
      .spyOn(mainModule, 'showHelp')
      .mockImplementation(() => Promise.resolve(ReturnCode.Success))
    const args = ['/usr/local/bin/node', '/usr/local/bin/sasjs', 'help']

    await cli(args)

    expect(mainModule.showHelp).toHaveBeenCalledWith()
    done()
  })

  it('should call the correct function for the version command', async (done) => {
    jest
      .spyOn(mainModule, 'showVersion')
      .mockImplementation(() => Promise.resolve(ReturnCode.Success))
    const args = ['/usr/local/bin/node', '/usr/local/bin/sasjs', 'v']

    await cli(args)

    expect(mainModule.showVersion).toHaveBeenCalledWith()
    done()
  })

  it('should call the correct function for the web command', async (done) => {
    jest
      .spyOn(mainModule, 'buildWebApp')
      .mockImplementation(() => Promise.resolve(ReturnCode.Success))
    const args = ['/usr/local/bin/node', '/usr/local/bin/sasjs', 'web']

    await cli(args)

    expect(mainModule.buildWebApp).toHaveBeenCalledWith(new Command(['web']))
    done()
  })

  it('should call the correct function for the add command', async (done) => {
    jest
      .spyOn(mainModule, 'add')
      .mockImplementation(() => Promise.resolve(ReturnCode.Success))
    const args = ['/usr/local/bin/node', '/usr/local/bin/sasjs', 'add']

    await cli(args)

    expect(mainModule.add).toHaveBeenCalledWith(new Command(['add']))
    done()
  })

  it('should call the correct function for the run command', async (done) => {
    jest
      .spyOn(mainModule, 'run')
      .mockImplementation(() => Promise.resolve(ReturnCode.Success))
    const args = ['/usr/local/bin/node', '/usr/local/bin/sasjs', 'run']

    await cli(args)

    expect(mainModule.run).toHaveBeenCalledWith(new Command(['run']))
    done()
  })

  it('should call the correct function for the request command', async (done) => {
    jest
      .spyOn(mainModule, 'runRequest')
      .mockImplementation(() => Promise.resolve(ReturnCode.Success))
    const args = ['/usr/local/bin/node', '/usr/local/bin/sasjs', 'request']

    await cli(args)

    expect(mainModule.runRequest).toHaveBeenCalledWith(new Command(['request']))
    done()
  })

  it('should call the correct function for the context command', async (done) => {
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
    done()
  })

  it('should call the correct function for the folder command', async (done) => {
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
    done()
  })

  it('should call the correct function for the job command', async (done) => {
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
    done()
  })

  it('should call the correct function for the flow command', async (done) => {
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
    done()
  })

  it('should exit with an error when an invalid command is entered', async (done) => {
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
    done()
  })
})

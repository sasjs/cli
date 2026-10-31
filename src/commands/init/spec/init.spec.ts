import dotenv from 'dotenv'
import path from 'path'
import { verifyFolder, generateUniqueTimestamp } from '../../../utils/test'
import {
  createFile,
  createFolder,
  deleteFolder,
  fileExists,
  readFile
} from '@sasjs/utils'
import { initFiles } from './initFiles'
import { init, AlreadyInitialisedError } from '../init'
import { setConstants } from '../../../utils'
import {
  findTargetInConfiguration,
  getLocalConfig
} from '../../../utils/config'
import { compile } from '../../compile/compile'

describe('sasjs init', () => {
  beforeAll(() => {
    dotenv.config()
  })

  afterEach(async () => {
    // deleteFolder() takes a literal path, not a glob - 'test-app-init-*' never
    // matches anything on disk, silently leaving every test's real (timestamped)
    // folder behind. Delete the actual folder each test just created instead.
    if (process.projectDir) await deleteFolder(process.projectDir)
  })

  it('should initialise in an empty current folder', async () => {
    await setupProjectFolder('test-app-init-')

    await expect(init()).toResolve()

    await verifyInit()
  })

  it('should add SASjs to an existing npm project', async () => {
    await setupProjectFolder('test-app-init-npm-')

    const packageJsonPath = path.join(process.projectDir, 'package.json')
    const existingPackageJson = {
      name: 'my-existing-project',
      version: '1.0.0',
      scripts: { build: 'exit 0' }
    }
    await createFile(
      packageJsonPath,
      JSON.stringify(existingPackageJson, null, 2)
    )

    await expect(init()).toResolve()

    await verifyInit()

    const packageJson = JSON.parse(await readFile(packageJsonPath))
    expect(packageJson.name).toEqual('my-existing-project')
    expect(packageJson.scripts.build).toEqual('exit 0')
  })

  it('should produce a project that compiles straight away', async () => {
    await setupProjectFolder('test-app-init-compile-')

    await expect(init()).toResolve()

    // Reading the target validates its serverUrl, and compile() reads every
    // folder the config names - the two things that stopped a freshly
    // initialised project from compiling.
    // compile() reads process.sasjsConfig and the build folders, which the CLI
    // sets up from its target command - do the same from a test.
    process.currentDir = process.projectDir
    process.sasjsConfig = await getLocalConfig()
    await setConstants()

    const { target } = await findTargetInConfiguration('mytarget')
    await expect(compile(target)).toResolve()

    await expect(
      fileExists(path.join(process.projectDir, 'sasjsbuild'))
    ).resolves.toEqual(true)
  })

  it('should abort without changes when the folder is already a SASjs project', async () => {
    await setupProjectFolder('test-app-init-existing-')

    const sasjsFolderPath = path.join(process.projectDir, 'sasjs')
    const configPath = path.join(sasjsFolderPath, 'sasjsconfig.json')
    const existingConfig = {
      defaultTarget: 'myTarget',
      targets: [
        {
          name: 'myTarget',
          serverType: 'SAS9',
          serverUrl: 'https://my.server.com',
          appLoc: '/User Folders/my app'
        }
      ]
    }

    await createFolder(sasjsFolderPath)
    await createFile(configPath, JSON.stringify(existingConfig, null, 2))

    const error = await init().catch((err) => err)
    expect(error).toBeInstanceOf(AlreadyInitialisedError)
    expect(error.message).toMatch(
      /already a SASjs project \(sasjs\/sasjsconfig\.json exists\)/
    )

    // Nothing is written before the abort, so the existing project is untouched.
    expect(JSON.parse(await readFile(configPath))).toEqual(existingConfig)
    await expect(
      fileExists(path.join(process.projectDir, 'package.json'))
    ).resolves.toEqual(false)
    await expect(
      fileExists(path.join(process.projectDir, '.gitignore'))
    ).resolves.toEqual(false)
    await expect(
      fileExists(path.join(sasjsFolderPath, 'doxy'))
    ).resolves.toEqual(false)
  })
})

const setupProjectFolder = async (prefix: string) => {
  process.projectDir = path.join(
    __dirname,
    `${prefix}${generateUniqueTimestamp()}`
  )
  await setConstants()
  await createFolder(process.projectDir)
}

const verifyInit = async () => {
  await verifyFolder(initFiles)

  const gitIgnoreFilePath = path.join(process.projectDir, '.gitignore')
  const gitIgnoreContent = await readFile(gitIgnoreFilePath)
  expect(gitIgnoreContent.match(/^sasjsbuild/gm)!.length).toEqual(1)
  expect(gitIgnoreContent.match(/^node_modules/gm)!.length).toEqual(1)

  // The generated target is what the user edits first, so its shape is part of
  // the contract: a minimal single target, pointed at the SASjs server type.
  const configPath = path.join(process.projectDir, 'sasjs', 'sasjsconfig.json')
  const config = JSON.parse(await readFile(configPath))
  expect(config.$schema).toEqual('https://cli.sasjs.io/sasjsconfig-schema.json')
  expect(config.macroFolders).toEqual(['sasjs/macros'])
  expect(config.defaultTarget).toEqual('mytarget')
  expect(config.targets.length).toEqual(1)
  expect(config.targets[0]).toEqual({
    name: 'mytarget',
    serverType: 'SASJS',
    serverUrl: '',
    appLoc: '/Public/apps/myapp'
  })

  // The folder the config points at has to exist, with a file in it so git
  // keeps it: an absent macro folder fails `sasjs compile` with ENOENT.
  const macroFolderPath = path.join(process.projectDir, 'sasjs', 'macros')
  await expect(fileExists(macroFolderPath)).resolves.toEqual(true)
  await expect(
    fileExists(path.join(macroFolderPath, '.gitkeep'))
  ).resolves.toEqual(true)

  const lintConfigPath = path.join(process.projectDir, '.sasjslint')
  await expect(fileExists(lintConfigPath)).resolves.toEqual(true)

  const packageJson = JSON.parse(
    await readFile(path.join(process.projectDir, 'package.json'))
  )
  expect(packageJson.dependencies['@sasjs/core']).toBeDefined()
}

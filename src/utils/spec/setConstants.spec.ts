import { Configuration } from '@sasjs/utils'
import path from 'path'
import * as configUtils from '../config'
import { setConstants } from '../setConstants'
import * as fileModule from '@sasjs/utils/file'
import * as utils from '../utils'

describe('setConstants', () => {
  let config: Configuration
  const origProcessEnv = process.env

  beforeAll(async () => {
    ;({ config } = JSON.parse(
      await fileModule.readFile(path.join(__dirname, '..', '..', 'config.json'))
    ))
  })

  afterEach(() => {
    process.env = { ...origProcessEnv }
  })

  test('should set constants inside appFolder when @sasjs/core dependency is present', async () => {
    process.projectDir = process.cwd()

    jest
      .spyOn(configUtils, 'getLocalOrGlobalConfig')
      .mockImplementation(async () =>
        Promise.resolve({
          configuration: config,
          isLocal: true
        })
      )

    const hasSasjsCore = true

    await setConstants()

    verifySasjsConstants(process.projectDir, hasSasjsCore)
  })

  test('should set constants inside appFolder when @sasjs/core dependency is not present', async () => {
    const appFolder = ['some', 'app', 'folder'].join(path.sep)
    process.projectDir = appFolder
    process.env.macroCorePath = undefined

    jest
      .spyOn(configUtils, 'getLocalOrGlobalConfig')
      .mockImplementation(async () =>
        Promise.resolve({
          configuration: config,
          isLocal: true
        })
      )

    jest.spyOn(process, 'cwd').mockImplementation(() => appFolder)

    jest.spyOn(utils, 'getNodeModulePath').mockImplementation(async () => '')

    await setConstants()

    verifySasjsConstants(process.projectDir)
  })

  test('should set constants outside appFolder', async () => {
    process.env.macroCorePath = undefined

    jest
      .spyOn(configUtils, 'getLocalOrGlobalConfig')
      .mockImplementation(async () =>
        Promise.resolve({
          configuration: config,
          isLocal: false
        })
      )

    jest.spyOn(utils, 'getNodeModulePath').mockImplementation(async () => '')

    await setConstants(false)

    verifySasjsConstants(undefined, false, false)
  })

  test('should look up @sasjs/core scoped to process.projectDir, then fall back unscoped, when environment variable macroCorePath is undefined', async () => {
    process.env.macroCorePath = undefined

    const getNodeModulePathSpy = jest
      .spyOn(utils, 'getNodeModulePath')
      .mockImplementation(async () => Promise.resolve(''))

    await setConstants()

    expect(getNodeModulePathSpy).toHaveBeenNthCalledWith(
      1,
      '@sasjs/core',
      process.projectDir
    )
    expect(getNodeModulePathSpy).toHaveBeenNthCalledWith(2, '@sasjs/core')
    expect(getNodeModulePathSpy).toHaveBeenCalledTimes(2)
  })

  test('should look up @sasjs/core scoped to process.projectDir, then fall back unscoped, when environment variable macroCorePath is blank', async () => {
    process.env.macroCorePath = ''

    const getNodeModulePathSpy = jest
      .spyOn(utils, 'getNodeModulePath')
      .mockImplementation(async () => Promise.resolve(''))

    await setConstants()

    expect(getNodeModulePathSpy).toHaveBeenNthCalledWith(
      1,
      '@sasjs/core',
      process.projectDir
    )
    expect(getNodeModulePathSpy).toHaveBeenNthCalledWith(2, '@sasjs/core')
    expect(getNodeModulePathSpy).toHaveBeenCalledTimes(2)
  })

  test('should not call getNodeModulePath when environment variable macroCorePath is populated', async () => {
    process.env.macroCorePath = '../core'

    const getNodeModulePathSpy = jest
      .spyOn(utils, 'getNodeModulePath')
      .mockImplementation(async (packageName: string) => Promise.resolve(''))

    await setConstants()

    expect(getNodeModulePathSpy).toHaveBeenCalledTimes(0)
  })

  test('should prefer @sasjs/core resolved relative to process.projectDir over the CLI-relative fallback', async () => {
    process.env.macroCorePath = undefined
    const projectCorePath = path.join(
      'some',
      'project',
      'node_modules',
      '@sasjs',
      'core'
    )

    const getNodeModulePathSpy = jest
      .spyOn(utils, 'getNodeModulePath')
      .mockImplementation(async (_packageName: string, fromDir?: string) =>
        Promise.resolve(fromDir ? projectCorePath : 'cli-relative-core-path')
      )

    await setConstants()

    // found on the first, project-scoped lookup - the unscoped fallback
    // should never be reached
    expect(getNodeModulePathSpy).toHaveBeenCalledTimes(1)
    expect(process.sasjsConstants.macroCorePath).toEqual(projectCorePath)
  })

  test('should fall back to the CLI-relative @sasjs/core when the project has none installed', async () => {
    process.env.macroCorePath = undefined
    const fallbackCorePath = path.join('cli', 'node_modules', '@sasjs', 'core')

    const getNodeModulePathSpy = jest
      .spyOn(utils, 'getNodeModulePath')
      .mockImplementation(async (_packageName: string, fromDir?: string) =>
        Promise.resolve(fromDir ? '' : fallbackCorePath)
      )

    await setConstants()

    expect(getNodeModulePathSpy).toHaveBeenNthCalledWith(
      1,
      '@sasjs/core',
      process.projectDir
    )
    expect(getNodeModulePathSpy).toHaveBeenNthCalledWith(2, '@sasjs/core')
    expect(process.sasjsConstants.macroCorePath).toEqual(fallbackCorePath)
  })
})

const verifySasjsConstants = (
  appFolder?: string,
  hasSasjsCore = false,
  isLocal = true
) => {
  const prefixAppFolder = appFolder ?? require('os').homedir()

  const { sasjsConstants } = process

  expect(sasjsConstants.buildSourceFolder).toEqual(prefixAppFolder)
  expect(sasjsConstants.buildSourceDbFolder).toEqual(
    [prefixAppFolder, 'sasjs', 'db'].join(path.sep)
  )
  expect(sasjsConstants.buildDestinationFolder).toEqual(
    path.join(prefixAppFolder, isLocal ? '' : '.sasjs', 'sasjsbuild')
  )
  expect(sasjsConstants.buildDestinationServicesFolder).toEqual(
    path.join(
      prefixAppFolder,
      isLocal ? '' : '.sasjs',
      'sasjsbuild',
      'services'
    )
  )
  expect(sasjsConstants.buildDestinationJobsFolder).toEqual(
    path.join(prefixAppFolder, isLocal ? '' : '.sasjs', 'sasjsbuild', 'jobs')
  )
  expect(sasjsConstants.buildDestinationDbFolder).toEqual(
    path.join(prefixAppFolder, isLocal ? '' : '.sasjs', 'sasjsbuild', 'db')
  )
  expect(sasjsConstants.buildDestinationDocsFolder).toEqual(
    path.join(prefixAppFolder, isLocal ? '' : '.sasjs', 'sasjsbuild', 'docs')
  )
  expect(sasjsConstants.buildDestinationResultsFolder).toEqual(
    path.join(prefixAppFolder, isLocal ? '' : '.sasjs', 'sasjsresults')
  )
  expect(sasjsConstants.buildDestinationResultsLogsFolder).toEqual(
    path.join(prefixAppFolder, isLocal ? '' : '.sasjs', 'sasjsresults', 'logs')
  )
  expect(sasjsConstants.buildDestinationTestFolder).toEqual(
    path.join(prefixAppFolder, isLocal ? '' : '.sasjs', 'sasjsbuild', 'tests')
  )

  const corePath = hasSasjsCore ? 'core' : ''

  if (hasSasjsCore) {
    if (appFolder) {
      expect(sasjsConstants.macroCorePath).toEqual(
        path.join(prefixAppFolder, 'node_modules', '@sasjs', corePath)
      )
    } else {
      expect(sasjsConstants.macroCorePath).toEqual(expect.toEndWith(corePath))
    }
  } else {
    expect(sasjsConstants.macroCorePath).toEqual(corePath)
  }
}

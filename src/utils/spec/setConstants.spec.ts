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
    const appFolder = ['some', 'app', 'folder'].join(path.sep)
    process.projectDir = appFolder

    jest
      .spyOn(configUtils, 'getLocalOrGlobalConfig')
      .mockImplementation(async () =>
        Promise.resolve({
          configuration: config,
          isLocal: true
        })
      )

    jest.spyOn(process, 'cwd').mockImplementation(() => appFolder)

    const hasSasjsCore = true

    jest
      .spyOn(fileModule, 'folderExists')
      .mockImplementation((path: string) => Promise.resolve(hasSasjsCore))

    await setConstants()

    verifySasjsConstants(process.projectDir, hasSasjsCore)
  })

  test('should set constants inside appFolder when @sasjs/core dependency is not present', async () => {
    const appFolder = ['some', 'app', 'folder'].join(path.sep)
    process.projectDir = appFolder

    jest
      .spyOn(configUtils, 'getLocalOrGlobalConfig')
      .mockImplementation(async () =>
        Promise.resolve({
          configuration: config,
          isLocal: true
        })
      )

    jest.spyOn(process, 'cwd').mockImplementation(() => appFolder)

    jest
      .spyOn(fileModule, 'folderExists')
      .mockImplementation((folderPath: string) =>
        Promise.resolve(
          folderPath !== path.join(appFolder, 'node_modules', '@sasjs', 'core')
        )
      )

    await setConstants()

    verifySasjsConstants(process.projectDir)
  })

  test('should set constants outside appFolder', async () => {
    jest
      .spyOn(configUtils, 'getLocalOrGlobalConfig')
      .mockImplementation(async () =>
        Promise.resolve({
          configuration: config,
          isLocal: false
        })
      )

    await setConstants(false)

    verifySasjsConstants(undefined, false, false)
  })

  test('should call getNodeModulePath once when environment variable macroCorePath is undefined', async () => {
    process.env.macroCorePath = undefined

    const getNodeModulePathSpy = jest
      .spyOn(utils, 'getNodeModulePath')
      .mockImplementation(async (packageName: string) =>
        Promise.resolve(
          path.join('some', 'app', 'folder', 'node_modules', packageName)
        )
      )

    await setConstants()

    expect(getNodeModulePathSpy).toHaveBeenCalledOnceWith('@sasjs/core')
  })

  test('should not call getNodeModulePath when environment variable macroCorePath is blank', async () => {
    process.env.macroCorePath = ''

    const getNodeModulePathSpy = jest
      .spyOn(utils, 'getNodeModulePath')
      .mockImplementation(async (packageName: string) =>
        Promise.resolve(
          path.join('some', 'app', 'folder', 'node_modules', packageName)
        )
      )

    await setConstants()

    expect(getNodeModulePathSpy).toHaveBeenCalledOnceWith('@sasjs/core')
  })

  test('should not call getNodeModulePath when environment variable macroCorePath is populated', async () => {
    process.env.macroCorePath = '../core'

    const getNodeModulePathSpy = jest
      .spyOn(utils, 'getNodeModulePath')
      .mockImplementation(async (packageName: string) =>
        Promise.resolve(
          path.join('some', 'app', 'folder', 'node_modules', packageName)
        )
      )

    await setConstants()

    expect(getNodeModulePathSpy).toBeCalledTimes(0)
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

  const corePath = hasSasjsCore
    ? 'core'
    : path.join('cli', 'node_modules', '@sasjs', 'core')

  if (appFolder) {
    expect(sasjsConstants.macroCorePath).toEqual(
      path.join(prefixAppFolder, 'node_modules', '@sasjs', corePath)
    )
  } else {
    expect(sasjsConstants.macroCorePath).toEqual(expect.toEndWith(corePath))
  }
}

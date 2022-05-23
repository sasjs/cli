import { Configuration } from '@sasjs/utils'
import path from 'path'
import * as configUtils from '../config'
import { setConstants } from '../setConstants'
import * as fileModule from '@sasjs/utils/file'

describe('setConstants', () => {
  let config: Configuration

  beforeAll(async () => {
    ;({ config } = JSON.parse(
      await fileModule.readFile(path.join(__dirname, '..', '..', 'config.json'))
    ))
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

    await setConstants()

    verifySasjsConstants()
  })
})

const verifySasjsConstants = (appFolder?: string, hasSasjsCore = false) => {
  const prefixAppFolder = appFolder ?? require('os').homedir()

  const { sasjsConstants } = process

  expect(sasjsConstants.buildSourceFolder).toEqual(prefixAppFolder)
  expect(sasjsConstants.buildSourceDbFolder).toEqual(
    [prefixAppFolder, 'sasjs', 'db'].join(path.sep)
  )
  expect(sasjsConstants.buildDestinationFolder).toEqual(
    [prefixAppFolder, 'sasjsbuild'].join(path.sep)
  )
  expect(sasjsConstants.buildDestinationServicesFolder).toEqual(
    [prefixAppFolder, 'sasjsbuild', 'services'].join(path.sep)
  )
  expect(sasjsConstants.buildDestinationJobsFolder).toEqual(
    [prefixAppFolder, 'sasjsbuild', 'jobs'].join(path.sep)
  )
  expect(sasjsConstants.buildDestinationDbFolder).toEqual(
    [prefixAppFolder, 'sasjsbuild', 'db'].join(path.sep)
  )
  expect(sasjsConstants.buildDestinationDocsFolder).toEqual(
    [prefixAppFolder, 'sasjsbuild', 'docs'].join(path.sep)
  )
  expect(sasjsConstants.buildDestinationResultsFolder).toEqual(
    [prefixAppFolder, 'sasjsresults'].join(path.sep)
  )
  expect(sasjsConstants.buildDestinationResultsLogsFolder).toEqual(
    [prefixAppFolder, 'sasjsresults', 'logs'].join(path.sep)
  )
  expect(sasjsConstants.buildDestinationTestFolder).toEqual(
    [prefixAppFolder, 'sasjsbuild', 'tests'].join(path.sep)
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

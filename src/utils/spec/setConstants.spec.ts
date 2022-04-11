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

  test('should set constants inside appFolder', async () => {
    jest
      .spyOn(configUtils, 'getLocalOrGlobalConfig')
      .mockImplementation(async () =>
        Promise.resolve({
          configuration: config,
          isLocal: true
        })
      )

    jest
      .spyOn(fileModule, 'folderExists')
      .mockImplementation(() => Promise.resolve(true))

    process.projectDir = ['some', 'app', 'folder'].join(path.sep)

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

const verifySasjsConstants = (appFolder?: string) => {
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
  if (appFolder) {
    expect(sasjsConstants.macroCorePath).toEqual(
      [prefixAppFolder, 'node_modules', '@sasjs', 'core'].join(path.sep)
    )
  } else {
    expect(sasjsConstants.macroCorePath).toEqual(
      expect.toEndWith(['cli', 'node_modules', '@sasjs', 'core'].join(path.sep))
    )
  }
}

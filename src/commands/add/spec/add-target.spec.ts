import { ServerType, Target } from '@sasjs/utils/types'
import dotenv from 'dotenv'
import path from 'path'
import * as inputModule from '../internal/input'
import { addTarget } from '../addTarget'
import {
  getConfiguration,
  getGlobalRcFile,
  removeFromGlobalConfig
} from '../../../utils/config'
import { deleteFolder } from '../../../utils/file'
import { generateTimestamp } from '../../../utils/utils'
import { getConstants } from '../../../constants'
import { TargetJson } from '../../../types/configuration'
import { TargetScope } from '../../../types/targetScope'
import { createTestMinimalApp, removeTestApp } from '../../../utils/test'

describe('addTarget', () => {
  const appName = `cli-tests-add-${generateTimestamp()}`
  const targetName = `test-viya-${generateTimestamp()}`

  beforeAll(async () => {
    dotenv.config()
    await createTestMinimalApp(__dirname, appName)
  })

  afterAll(async () => {
    await removeTestApp(__dirname, appName)
    await removeFromGlobalConfig(targetName)
  }, 60 * 1000)

  afterEach(async () => {
    const sasjsDirPath = path.join(process.projectDir, 'sasjs')
    await deleteFolder(sasjsDirPath)
  }, 60 * 1000)
  it(
    'should create a target in the local sasjsconfig.json file',
    async (done) => {
      const commonFields = {
        scope: TargetScope.Local,
        serverType: ServerType.SasViya,
        name: targetName,
        appLoc: '/Public/app',
        serverUrl: process.env.SERVER_URL as string
      }
      jest
        .spyOn(inputModule, 'getCommonFields')
        .mockImplementation(() => Promise.resolve(commonFields))
      jest
        .spyOn(inputModule, 'getAndValidateSasViyaFields')
        .mockImplementation(() =>
          Promise.resolve({ contextName: 'Test Context' })
        )

      await expect(addTarget()).resolves.toEqual(true)

      const { buildSourceFolder } = getConstants()
      const config = await getConfiguration(
        path.join(buildSourceFolder, 'sasjsconfig.json')
      )
      expect(config).toBeTruthy()
      expect(config!.targets).toBeTruthy()
      const target: TargetJson = (config!.targets || []).find(
        (t: TargetJson) => t.name === targetName
      ) as TargetJson
      expect(target.name).toEqual(targetName)
      expect(target.serverType).toEqual(ServerType.SasViya)
      expect(target.appLoc).toEqual('/Public/app')
      expect(target.serverUrl).toEqual(process.env.SERVER_URL)
      done()
    },
    10 * 1000
  )

  it('should create a target in the global .sasjsrc file', async (done) => {
    const commonFields = {
      scope: TargetScope.Global,
      serverType: ServerType.SasViya,
      name: targetName,
      appLoc: '/Public/app',
      serverUrl: process.env.SERVER_URL as string
    }
    jest
      .spyOn(inputModule, 'getCommonFields')
      .mockImplementation(() => Promise.resolve(commonFields))
    jest
      .spyOn(inputModule, 'getAndValidateSasViyaFields')
      .mockImplementation(() =>
        Promise.resolve({ contextName: 'Test Context' })
      )

    await expect(addTarget()).resolves.toEqual(true)

    const config = await getGlobalRcFile()
    expect(config).toBeTruthy()
    expect(config.targets).toBeTruthy()
    const matchingTargets: Target[] = config.targets.filter(
      (t: Target) => t.name === targetName
    )
    expect(matchingTargets.length).toEqual(1)
    const target = matchingTargets[0]
    expect(target.name).toEqual(targetName)
    expect(target.serverType).toEqual(ServerType.SasViya)
    expect(target.appLoc).toEqual('/Public/app')
    expect(target.serverUrl).toEqual(process.env.SERVER_URL)
    done()
  })
})

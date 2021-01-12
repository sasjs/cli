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
  const viyaTargetName = `test-viya-${generateTimestamp()}`
  const sas9TargetName = `test-sas9-${generateTimestamp()}`

  beforeAll(async () => {
    dotenv.config()
    await createTestMinimalApp(__dirname, appName)
  })

  afterAll(async (done) => {
    await removeTestApp(__dirname, appName)
    await removeFromGlobalConfig(viyaTargetName)

    done()
  })

  afterEach(async (done) => {
    jest.clearAllMocks()

    done()
  })

  it('should create a Viya target in the local sasjsconfig.json file', async (done) => {
    const commonFields = {
      scope: TargetScope.Local,
      serverType: ServerType.SasViya,
      name: viyaTargetName,
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
      (t: TargetJson) => t.name === viyaTargetName
    ) as TargetJson
    expect(target.name).toEqual(viyaTargetName)
    expect(target.serverType).toEqual(ServerType.SasViya)
    expect(target.appLoc).toEqual('/Public/app')
    expect(target.serverUrl).toEqual(process.env.SERVER_URL)

    done()
  })

  it('should create a SAS9 target in the local sasjsconfig.json file', async (done) => {
    const commonFields = {
      scope: TargetScope.Local,
      serverType: ServerType.Sas9,
      name: sas9TargetName,
      appLoc: '/Public/app',
      serverUrl: process.env.SERVER_URL as string
    }
    jest
      .spyOn(inputModule, 'getCommonFields')
      .mockImplementation(() => Promise.resolve(commonFields))
    jest.spyOn(inputModule, 'getAndValidateSas9Fields').mockImplementation(() =>
      Promise.resolve({
        serverName: 'testServer',
        repositoryName: 'testRepo'
      })
    )

    await expect(addTarget()).resolves.toEqual(true)

    const { buildSourceFolder } = getConstants()
    const config = await getConfiguration(
      path.join(buildSourceFolder, 'sasjsconfig.json')
    )

    expect(config).toBeTruthy()
    expect(config!.targets).toBeTruthy()

    const target: TargetJson = (config!.targets || []).find(
      (t: TargetJson) => t.name === sas9TargetName
    ) as TargetJson

    expect(target.name).toEqual(sas9TargetName)
    expect(target.serverType).toEqual(ServerType.Sas9)
    expect(target.appLoc).toEqual('/Public/app')
    expect(target.serverUrl).toEqual(process.env.SERVER_URL)

    const buildFileName = target.buildConfig
      ? target.buildConfig.buildOutputFileName
      : ''
    expect(buildFileName).toEqual(`${sas9TargetName}.sas`)

    done()
  })

  it('should create a target in the global .sasjsrc file', async (done) => {
    const commonFields = {
      scope: TargetScope.Global,
      serverType: ServerType.SasViya,
      name: viyaTargetName,
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
      (t: Target) => t.name === viyaTargetName
    )
    expect(matchingTargets.length).toEqual(1)
    const target = matchingTargets[0]
    expect(target.name).toEqual(viyaTargetName)
    expect(target.serverType).toEqual(ServerType.SasViya)
    expect(target.appLoc).toEqual('/Public/app')
    expect(target.serverUrl).toEqual(process.env.SERVER_URL)

    done()
  })
})

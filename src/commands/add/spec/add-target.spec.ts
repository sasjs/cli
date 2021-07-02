import { ServerType, Target, TargetJson, generateTimestamp } from '@sasjs/utils'
import dotenv from 'dotenv'
import path from 'path'
import * as inputModule from '../internal/input'
import { addTarget } from '../addTarget'
import {
  getConfiguration,
  getGlobalRcFile,
  removeFromGlobalConfig
} from '../../../utils/config'
import { getConstants } from '../../../constants'
import { TargetScope } from '../../../types/targetScope'
import { CommonFields } from '../../../types/commonFields'
import {
  createTestMinimalApp,
  removeTestApp,
  createTestGlobalTarget
} from '../../../utils/test'

describe('addTarget', () => {
  const appName = `cli-tests-add-${generateTimestamp()}`
  const viyaTargetName = `test-viya-${generateTimestamp()}`
  const sas9TargetName = `test-sas9-${generateTimestamp()}`
  let globalTestTarget: Target

  beforeAll(async () => {
    dotenv.config()
    await createTestMinimalApp(__dirname, appName)
  })

  afterAll(async () => {
    await removeTestApp(__dirname, appName)
    await removeFromGlobalConfig(viyaTargetName)
  })

  beforeEach(async () => {
    globalTestTarget = await createTestGlobalTarget(
      `test-target-global-${generateTimestamp()}`,
      `/Public/app/cli-tests/${appName}`
    )
  })

  afterEach(async () => {
    await removeFromGlobalConfig(globalTestTarget.name)
  })

  it('should create a Viya target in the local sasjsconfig.json file', async () => {
    const commonFields: CommonFields = {
      scope: TargetScope.Local,
      serverType: ServerType.SasViya,
      name: viyaTargetName,
      appLoc: '/Public/app',
      serverUrl: process.env.VIYA_SERVER_URL as string,
      existingTarget: {} as TargetJson
    }
    jest
      .spyOn(inputModule, 'getCommonFields')
      .mockImplementation(() => Promise.resolve(commonFields))
    jest
      .spyOn(inputModule, 'getIsDefault')
      .mockImplementation(() => Promise.resolve(false))
    jest
      .spyOn(inputModule, 'getAndValidateSasViyaFields')
      .mockImplementation(() =>
        Promise.resolve({ contextName: 'Test Context' })
      )

    await expect(addTarget()).resolves.toEqual(true)

    await verifyTarget(commonFields, true)
  })

  it('should create a SAS9 target in the local sasjsconfig.json file', async () => {
    const commonFields: CommonFields = {
      scope: TargetScope.Local,
      serverType: ServerType.Sas9,
      name: sas9TargetName,
      appLoc: '/Public/app',
      serverUrl: process.env.SAS9_SERVER_URL as string,
      existingTarget: {} as TargetJson
    }
    jest
      .spyOn(inputModule, 'getCommonFields')
      .mockImplementation(() => Promise.resolve(commonFields))
    jest
      .spyOn(inputModule, 'getIsDefault')
      .mockImplementation(() => Promise.resolve(false))
    jest.spyOn(inputModule, 'getAndValidateSas9Fields').mockImplementation(() =>
      Promise.resolve({
        serverName: 'testServer',
        repositoryName: 'testRepo',
        userName: 'tstusr',
        password: 'Some_Random_Password'
      })
    )

    await expect(addTarget()).resolves.toEqual(true)

    await verifyTarget(commonFields, true)
  })

  it('should create a target in the global .sasjsrc file', async () => {
    const commonFields: CommonFields = {
      scope: TargetScope.Global,
      serverType: ServerType.SasViya,
      name: viyaTargetName,
      appLoc: '/Public/app',
      serverUrl: process.env.VIYA_SERVER_URL as string,
      existingTarget: {} as TargetJson
    }
    jest
      .spyOn(inputModule, 'getCommonFields')
      .mockImplementation(() => Promise.resolve(commonFields))
    jest
      .spyOn(inputModule, 'getIsDefault')
      .mockImplementation(() => Promise.resolve(false))
    jest
      .spyOn(inputModule, 'getAndValidateSasViyaFields')
      .mockImplementation(() =>
        Promise.resolve({ contextName: 'Test Context' })
      )

    await expect(addTarget()).resolves.toEqual(true)

    await verifyTarget(commonFields, false)
  })

  it('should update a Viya target in the local sasjsconfig.json file', async () => {
    const { buildSourceFolder } = await getConstants()
    const config = await getConfiguration(
      path.join(buildSourceFolder, 'sasjs', 'sasjsconfig.json')
    )
    const target: TargetJson = (config!.targets || []).find(
      (t: TargetJson) => t.name === 'viya'
    ) as TargetJson

    const commonFields: CommonFields = {
      scope: TargetScope.Local,
      serverType: ServerType.SasViya,
      name: 'viya',
      appLoc: '/Public/app/new/location',
      serverUrl: process.env.VIYA_SERVER_URL as string,
      existingTarget: target
    }
    jest
      .spyOn(inputModule, 'getCommonFields')
      .mockImplementation(() => Promise.resolve(commonFields))
    jest
      .spyOn(inputModule, 'getIsDefault')
      .mockImplementation(() => Promise.resolve(false))
    jest
      .spyOn(inputModule, 'getAndValidateSasViyaFields')
      .mockImplementation(() =>
        Promise.resolve({ contextName: 'Test Context' })
      )

    await expect(addTarget()).resolves.toEqual(true)

    await verifyTarget(commonFields, true)
  })

  it('should update a SAS9 target in the local sasjsconfig.json file', async () => {
    const { buildSourceFolder } = await getConstants()
    const config = await getConfiguration(
      path.join(buildSourceFolder, 'sasjs', 'sasjsconfig.json')
    )
    const target: TargetJson = (config!.targets || []).find(
      (t: TargetJson) => t.name === 'sas9'
    ) as TargetJson

    const commonFields: CommonFields = {
      scope: TargetScope.Local,
      serverType: ServerType.Sas9,
      name: 'sas9',
      appLoc: '/Public/app/new/location/2',
      serverUrl: process.env.VIYA_SERVER_URL as string,
      existingTarget: target
    }
    jest
      .spyOn(inputModule, 'getCommonFields')
      .mockImplementation(() => Promise.resolve(commonFields))
    jest
      .spyOn(inputModule, 'getIsDefault')
      .mockImplementation(() => Promise.resolve(false))
    jest.spyOn(inputModule, 'getAndValidateSas9Fields').mockImplementation(() =>
      Promise.resolve({
        serverName: 'testServer',
        repositoryName: 'testRepo',
        userName: 'tstusr',
        password: 'Some_Random_Password'
      })
    )

    await expect(addTarget()).resolves.toEqual(true)

    await verifyTarget(commonFields, true)
  })

  it('should update a target in the global .sasjsrc file', async () => {
    const commonFields: CommonFields = {
      scope: TargetScope.Global,
      serverType: globalTestTarget.serverType,
      name: globalTestTarget.name,
      appLoc: '/Public/app/new/location/3',
      serverUrl: process.env.VIYA_SERVER_URL as string,
      existingTarget: globalTestTarget
    }
    jest
      .spyOn(inputModule, 'getCommonFields')
      .mockImplementation(() => Promise.resolve(commonFields))
    jest
      .spyOn(inputModule, 'getIsDefault')
      .mockImplementation(() => Promise.resolve(false))
    jest
      .spyOn(inputModule, 'getAndValidateSasViyaFields')
      .mockImplementation(() =>
        Promise.resolve({ contextName: 'Test Context' })
      )

    await expect(addTarget()).resolves.toEqual(true)

    await verifyTarget(commonFields, false)
  })
})

async function verifyTarget(commonFields: CommonFields, isLocal: boolean) {
  let config
  if (isLocal) {
    const { buildSourceFolder } = await getConstants()
    config = await getConfiguration(
      path.join(buildSourceFolder, 'sasjs', 'sasjsconfig.json')
    )
  } else {
    config = await getGlobalRcFile()
  }

  const matchingTargets: Target[] = config.targets.filter(
    (t: Target) => t.name === commonFields.name
  )
  expect(matchingTargets.length).toEqual(1)
  const target = matchingTargets[0]

  expect(target.name).toEqual(commonFields.name)
  expect(target.serverType).toEqual(commonFields.serverType)
  expect(target.appLoc).toEqual(commonFields.appLoc)
  expect(target.serverUrl).toEqual(commonFields.serverUrl)
}

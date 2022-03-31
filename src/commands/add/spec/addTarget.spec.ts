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
  const sasjsTargetName = `test-server-${generateTimestamp()}`
  const serverUrl = process.env.VIYA_SERVER_URL || ''
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
      serverUrl: serverUrl,
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
        Promise.resolve({
          contextName: 'Test Context',
          target: new Target(commonFields)
        })
      )

    await expect(addTarget(false)).resolves.toEqual(true)

    await verifyTarget(commonFields, true)
  })

  it('should create a SASJS target in the local sasjsconfig.json file', async () => {
    const commonFields: CommonFields = {
      scope: TargetScope.Local,
      serverType: ServerType.Sasjs,
      name: sasjsTargetName,
      appLoc: '/Public/app',
      serverUrl: serverUrl,
      existingTarget: {} as TargetJson
    }
    jest
      .spyOn(inputModule, 'getCommonFields')
      .mockImplementation(() => Promise.resolve(commonFields))
    jest
      .spyOn(inputModule, 'getIsDefault')
      .mockImplementation(() => Promise.resolve(false))
    jest
      .spyOn(inputModule, 'getAndValidateSasjsFields')
      .mockImplementation(() =>
        Promise.resolve({
          target: new Target(commonFields)
        })
      )

    await expect(addTarget(false)).resolves.toEqual(true)

    await verifyTarget(commonFields, true)
  })

  it('should create a SAS9 target in the local sasjsconfig.json file', async () => {
    const commonFields: CommonFields = {
      scope: TargetScope.Local,
      serverType: ServerType.Sas9,
      name: sas9TargetName,
      appLoc: '/Public/app',
      serverUrl: serverUrl,
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

    await expect(addTarget(false)).resolves.toEqual(true)

    await verifyTarget(commonFields, true)
  })

  it('should create a target in the global .sasjsrc file', async () => {
    const commonFields: CommonFields = {
      scope: TargetScope.Global,
      serverType: ServerType.SasViya,
      name: viyaTargetName,
      appLoc: '/Public/app',
      serverUrl: serverUrl,
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
        Promise.resolve({
          contextName: 'Test Context',
          target: new Target(commonFields)
        })
      )

    await expect(addTarget(false)).resolves.toEqual(true)

    await verifyTarget(commonFields, false)
  })

  it('should update a Viya target in the local sasjsconfig.json file', async () => {
    const { buildSourceFolder } = process.sasjsConstants
    const config = await getConfiguration(
      path.join(buildSourceFolder, 'sasjs', 'sasjsconfig.json')
    )
    const targetJson: TargetJson = (config!.targets || []).find(
      (t: TargetJson) => t.name === 'viya'
    ) as TargetJson

    targetJson.streamConfig!.streamWeb = false

    const commonFields: CommonFields = {
      scope: TargetScope.Local,
      serverType: ServerType.SasViya,
      name: 'viya',
      appLoc: '/Public/app/new/location',
      serverUrl: serverUrl,
      existingTarget: targetJson
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
        Promise.resolve({
          contextName: 'Test Context',
          target: new Target({ ...targetJson, ...commonFields })
        })
      )

    await expect(addTarget(false)).resolves.toEqual(true)

    await verifyTarget(commonFields, true)
  })

  it('should update a SAS9 target in the local sasjsconfig.json file', async () => {
    const { buildSourceFolder } = process.sasjsConstants
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
      serverUrl: serverUrl,
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

    await expect(addTarget(false)).resolves.toEqual(true)

    await verifyTarget(commonFields, true)
  })

  it('should update a SASJS target in the local sasjsconfig.json file', async () => {
    const { buildSourceFolder } = process.sasjsConstants
    const config = await getConfiguration(
      path.join(buildSourceFolder, 'sasjs', 'sasjsconfig.json')
    )
    const targetJson: TargetJson = (config!.targets || []).find(
      (t: TargetJson) => t.name === 'server'
    ) as TargetJson

    const commonFields: CommonFields = {
      scope: TargetScope.Local,
      serverType: ServerType.Sasjs,
      name: 'server',
      appLoc: '/Public/app/new/location/2',
      serverUrl: serverUrl,
      existingTarget: targetJson
    }
    jest
      .spyOn(inputModule, 'getCommonFields')
      .mockImplementation(() => Promise.resolve(commonFields))
    jest
      .spyOn(inputModule, 'getIsDefault')
      .mockImplementation(() => Promise.resolve(false))
    jest
      .spyOn(inputModule, 'getAndValidateSasjsFields')
      .mockImplementation(() =>
        Promise.resolve({
          target: new Target({ ...targetJson, ...commonFields })
        })
      )

    await expect(addTarget(false)).resolves.toEqual(true)

    await verifyTarget(commonFields, true)
  })

  it('should update a target in the global .sasjsrc file', async () => {
    const commonFields: CommonFields = {
      scope: TargetScope.Global,
      serverType: globalTestTarget.serverType,
      name: globalTestTarget.name,
      appLoc: '/Public/app/new/location/3',
      serverUrl: serverUrl,
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
        Promise.resolve({
          contextName: 'Test Context',
          target: new Target({ ...globalTestTarget, ...commonFields })
        })
      )

    await expect(addTarget(false)).resolves.toEqual(true)

    await verifyTarget(commonFields, false)
  })
})

async function verifyTarget(commonFields: CommonFields, isLocal: boolean) {
  let config
  if (isLocal) {
    const { buildSourceFolder } = process.sasjsConstants
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

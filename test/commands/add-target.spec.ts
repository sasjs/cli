import { ServerType, Target } from '@sasjs/utils/types'
import dotenv from 'dotenv'
import path from 'path'
import * as inputModule from '../../src/commands/add/input'
import { addTarget } from '../../src/commands/add/add-target'
import { TargetScope } from '../../src/types/TargetScope'
import {
  getConfiguration,
  getGlobalRcFile,
  saveGlobalRcFile
} from '../../src/utils/config-utils'
import { deleteFolder, createFolder } from '../../src/utils/file'
import { generateTimestamp } from '../../src/utils/utils'

describe('addTarget', () => {
  const testingAppFolder = `cli-tests-add-${generateTimestamp()}`
  const targetName = `test-viya-${generateTimestamp()}`

  beforeAll(async () => {
    dotenv.config()
    process.projectDir = path.join(process.cwd(), testingAppFolder)
    await createFolder(process.projectDir)
  })

  afterAll(async () => {
    const projectDirPath = path.join(process.projectDir)
    await deleteFolder(projectDirPath)

    const globalConfig = await getGlobalRcFile()
    if (globalConfig && globalConfig.targets) {
      globalConfig.targets = globalConfig.targets.filter(
        (t: Target) => t.name !== targetName
      )
      await saveGlobalRcFile(JSON.stringify(globalConfig, null, 2))
    }
  }, 60 * 1000)

  afterEach(async () => {
    const sasjsDirPath = path.join(process.projectDir, 'sasjs')
    await deleteFolder(sasjsDirPath)
  }, 60 * 1000)
  it('should create a target in the local sasjsconfig.json file', async (done) => {
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

    const buildSourceFolder = require('../../src/constants').get()
      .buildSourceFolder
    const config = await getConfiguration(
      path.join(buildSourceFolder, 'sasjsconfig.json')
    )
    expect(config).toBeTruthy()
    expect(config.targets).toBeTruthy()
    const target: Target = config.targets.find(
      (t: Target) => t.name === targetName
    )
    expect(target.name).toEqual(targetName)
    expect(target.serverType).toEqual(ServerType.SasViya)
    expect(target.appLoc).toEqual('/Public/app')
    expect(target.serverUrl).toEqual(process.env.SERVER_URL)
    done()
  })

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

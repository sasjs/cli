import {
  getAccessToken,
  sanitizeAppLoc,
  overrideEnvVariables,
  saveToGlobalConfig,
  getGlobalRcFile,
  removeFromGlobalConfig,
  saveToLocalConfig,
  getLocalConfig,
  removeFromLocalConfig
} from '../config'
import * as authUtils from '../auth'
import * as fileUtils from '../file'
import dotenv from 'dotenv'
import { createFile, deleteFile } from '../file'
import path from 'path'
import {
  Logger,
  LogLevel,
  SasAuthResponse,
  Configuration,
  Target,
  generateTimestamp
} from '@sasjs/utils'
import {
  createTestMinimalApp,
  generateTestTarget,
  removeTestApp
} from '../test'
jest.mock('@sasjs/adapter/node')

describe('getAccessToken', () => {
  beforeEach(() => {
    process.projectDir = process.cwd()
    dotenv.config()
    process.env.ACCESS_TOKEN = undefined
    process.env.CLIENT = undefined
    process.env.SECRET = undefined
  })

  afterEach(() => {
    process.env.ACCESS_TOKEN = undefined
    process.env.CLIENT = undefined
    process.env.SECRET = undefined
    jest.resetAllMocks()
  })

  it('should get access token from authInfo', async () => {
    const target = {
      authConfig: {
        access_token: 'T0K3N'
      }
    }

    const token = await getAccessToken(target as Target, false)

    expect(token).toEqual('T0K3N')
  })

  it('should prioritise the access token from matching env file if available', async (done) => {
    process.env.ACCESS_TOKEN = '3NVT0K3N'
    const target = {
      name: 'ConfigTest'
    }
    await createFile(
      path.join(__dirname, '.env.ConfigTest'),
      'ACCESS_TOKEN=T4RG3TT0K3N'
    )
    process.projectDir = __dirname

    const token = await getAccessToken(target as Target, false)

    expect(token).toEqual('T4RG3TT0K3N')
    await deleteFile(path.join(__dirname, '.env.ConfigTest'))
    done()
  })

  it('should throw an error when access token is unavailable', async () => {
    const target = {
      authConfig: {
        access_token: ''
      }
    }

    await expect(getAccessToken(target as Target, false)).rejects.toThrow()
  })

  it('should throw an error when auth config is unavailable', async () => {
    const target = null

    await expect(
      getAccessToken(target as any as Target, false)
    ).rejects.toThrow()
  })

  it('should get access token from environment', async () => {
    const target = null
    process.env.ACCESS_TOKEN = '3NVT0K3N'

    const token = await getAccessToken(target as any as Target, false)

    expect(token).toEqual('3NVT0K3N')
  })

  it('should refresh access token when it is expiring and refresh token is available', async () => {
    jest
      .spyOn(authUtils, 'isAccessTokenExpiring')
      .mockImplementation(() => true)
    jest.spyOn(authUtils, 'getNewAccessToken')
    jest.spyOn(authUtils, 'refreshTokens').mockImplementation(() =>
      Promise.resolve({
        access_token: 'N3WT0K3N'
      } as SasAuthResponse)
    )

    const target = {
      authConfig: {
        access_token: 'T0K3N',
        refresh_token: 'R3FR35H',
        client: 'CL13NT',
        secret: '53CR3T'
      }
    }

    const token = await getAccessToken(target as Target, true)

    expect(authUtils.isAccessTokenExpiring).toHaveBeenCalledTimes(1)
    expect(authUtils.refreshTokens).toHaveBeenCalledTimes(1)
    expect(authUtils.getNewAccessToken).not.toHaveBeenCalled()
    expect(token).toEqual('N3WT0K3N')
  })

  it('should get new access token when it is expiring and refresh token is not available', async () => {
    jest
      .spyOn(authUtils, 'isAccessTokenExpiring')
      .mockImplementation(() => true)
    jest.spyOn(authUtils, 'refreshTokens')
    jest.spyOn(authUtils, 'getNewAccessToken').mockImplementation(() =>
      Promise.resolve({
        access_token: 'N3WT0K3N'
      } as SasAuthResponse)
    )
    const target = {
      authConfig: {
        access_token: 'T0K3N',
        client: 'CL13NT',
        secret: '53CR3T'
      }
    }
    process.env.REFRESH_TOKEN = undefined

    const token = await getAccessToken(target as Target, true)

    expect(authUtils.isAccessTokenExpiring).toHaveBeenCalledTimes(1)
    expect(authUtils.refreshTokens).not.toHaveBeenCalled()
    expect(authUtils.getNewAccessToken).toHaveBeenCalledTimes(1)
    expect(token).toEqual('N3WT0K3N')
  })

  it('should throw an error if access token is expiring and client ID is not available', async () => {
    jest
      .spyOn(authUtils, 'isAccessTokenExpiring')
      .mockImplementation(() => true)
    const target = {
      authConfig: {
        access_token: 'T0K3N',
        secret: '53CR3T'
      }
    }
    process.env.CLIENT = undefined

    await expect(getAccessToken(target as Target)).rejects.toThrow()
  })

  it('should throw an error if access token is expiring and client secret is not available', async () => {
    jest
      .spyOn(authUtils, 'isAccessTokenExpiring')
      .mockImplementation(() => true)
    const target = {
      authConfig: {
        access_token: 'T0K3N',
        client: 'CL13NT'
      }
    }
    process.env.SECRET = undefined

    await expect(getAccessToken(target as Target)).rejects.toThrow()
  })
})

describe('sanitizeAppLoc', () => {
  let notValidAppLoc = '///Public/app///'
  const validAppLoc = '/Public/app'

  it('should remove trailing slash', () => {
    expect(sanitizeAppLoc(notValidAppLoc)).toEqual(validAppLoc)
  })

  it('should remove multiple leading slashes', () => {
    expect(sanitizeAppLoc(notValidAppLoc)).toEqual(validAppLoc)
  })

  notValidAppLoc = 'Public/app///'
  it('should add leading slash', () => {
    expect(sanitizeAppLoc(notValidAppLoc)).toEqual(validAppLoc)
  })
})

describe('overrideEnvVariables', () => {
  it('should do nothing when the target name is falsy', async (done) => {
    jest.spyOn(fileUtils, 'readFile')
    jest.spyOn(dotenv, 'parse')

    await overrideEnvVariables('')

    expect(fileUtils.readFile).not.toHaveBeenCalled()
    expect(dotenv.parse).not.toHaveBeenCalled()
    done()
  })

  it('should display a warning when the target env file is not found', async (done) => {
    process.logger = new Logger(LogLevel.Off)
    process.projectDir = __dirname
    jest
      .spyOn(fileUtils, 'readFile')
      .mockImplementationOnce(() => Promise.reject())
    jest.spyOn(process.logger, 'warn')
    jest.spyOn(dotenv, 'parse')

    await overrideEnvVariables('test')

    expect(process.logger?.warn).toHaveBeenCalledWith(
      'A .env.test file was not found in your project directory. Defaulting to variables from the main .env file.'
    )
    expect(dotenv.parse).not.toHaveBeenCalled()
    done()
  })

  it('should override env variables with values from the target-specific file', async (done) => {
    process.logger = new Logger(LogLevel.Off)
    process.projectDir = __dirname
    jest
      .spyOn(fileUtils, 'readFile')
      .mockImplementationOnce(() => Promise.resolve('ACCESS_TOKEN=T4RG3TT0K3N'))

    jest.spyOn(process.logger, 'warn')
    jest.spyOn(dotenv, 'parse')

    await overrideEnvVariables('OverrideTest')

    expect(process.logger?.warn).not.toHaveBeenCalled()
    expect(dotenv.parse).toHaveBeenCalledWith('ACCESS_TOKEN=T4RG3TT0K3N')
    expect(process.env.ACCESS_TOKEN).toEqual('T4RG3TT0K3N')
    done()
  })
})

describe('saveToGlobalConfig', () => {
  beforeEach(() => {
    process.projectDir = __dirname
  })

  it('should set the target as default when isDefault is true', async (done) => {
    const appName = 'cli-tests-config-' + generateTimestamp()
    const target = await generateTestTarget(
      appName,
      `/Public/app/cli-tests/${appName}`
    )

    await saveToGlobalConfig(target, true)

    const config = (await getGlobalRcFile()) as Configuration
    expect(config.defaultTarget).toEqual(target.name)
    const configTarget = config.targets?.find((t) => t.name === target.name)
    expect(configTarget).toBeTruthy()
    await removeFromGlobalConfig(target.name)

    done()
  })

  it('should not set the target as default when isDefault is false', async (done) => {
    const appName = 'cli-tests-config-' + generateTimestamp()
    const target = await generateTestTarget(
      appName,
      `/Public/app/cli-tests/${appName}`
    )

    await saveToGlobalConfig(target, false)

    const config = (await getGlobalRcFile()) as Configuration
    expect(config.defaultTarget).not.toEqual(target.name)
    const configTarget = config.targets?.find((t) => t.name === target.name)
    expect(configTarget).toBeTruthy()
    await removeFromGlobalConfig(target.name)

    done()
  })
})

describe('removeFromGlobalConfig', () => {
  beforeEach(() => {
    process.projectDir = __dirname
  })

  it('should reset the default target when that target is removed', async (done) => {
    const appName = 'cli-tests-config-' + generateTimestamp()
    const target = await generateTestTarget(
      appName,
      `/Public/app/cli-tests/${appName}`
    )

    await saveToGlobalConfig(target, true)

    let config = (await getGlobalRcFile()) as Configuration
    expect(config.defaultTarget).toEqual(target.name)
    await removeFromGlobalConfig(target.name)

    config = (await getGlobalRcFile()) as Configuration
    const configTarget = config.targets?.find((t) => t.name === target.name)
    expect(configTarget).toBeFalsy()
    expect(config.defaultTarget).toEqual('')

    done()
  })

  it('should not change the default target when another target is removed', async (done) => {
    const appName1 = 'cli-tests-config-1-' + generateTimestamp()
    const appName2 = 'cli-tests-config-2-' + generateTimestamp()
    const target1 = await generateTestTarget(
      appName1,
      `/Public/app/cli-tests/${appName1}`
    )
    const target2 = await generateTestTarget(
      appName2,
      `/Public/app/cli-tests/${appName2}`
    )

    await saveToGlobalConfig(target1, true)
    await saveToGlobalConfig(target2, false)

    let config = (await getGlobalRcFile()) as Configuration
    expect(config.defaultTarget).toEqual(target1.name)
    const configTarget1 = config.targets?.find((t) => t.name === target1.name)
    expect(configTarget1).toBeTruthy()
    let configTarget2 = config.targets?.find((t) => t.name === target2.name)
    expect(configTarget2).toBeTruthy()

    await removeFromGlobalConfig(target2.name)
    config = (await getGlobalRcFile()) as Configuration
    configTarget2 = config.targets?.find((t) => t.name === target2.name)
    expect(configTarget2).toBeFalsy()
    expect(config.defaultTarget).toEqual(target1.name)

    done()
  })
})

describe('saveToLocalConfig', () => {
  let appName: string

  beforeEach(async (done) => {
    appName = `cli-tests-config-${generateTimestamp()}`
    await createTestMinimalApp(__dirname, appName)
    done()
  })

  afterEach(async (done) => {
    await removeTestApp(__dirname, appName)
    done()
  })

  it('should set the target as default when isDefault is true', async (done) => {
    const appName = 'cli-tests-cb-' + generateTimestamp()
    const target = await generateTestTarget(
      appName,
      `/Public/app/cli-tests/${appName}`
    )

    await saveToLocalConfig(target, true)

    const config = (await getLocalConfig()) as Configuration
    expect(config.defaultTarget).toEqual(target.name)
    const configTarget = config.targets?.find((t) => t.name === target.name)
    expect(configTarget).toBeTruthy()
    await removeFromLocalConfig(target.name)

    done()
  })

  it('should not set the target as default when isDefault is false', async (done) => {
    const appName = 'cli-tests-cb-' + generateTimestamp()
    const target = await generateTestTarget(
      appName,
      `/Public/app/cli-tests/${appName}`
    )

    await saveToLocalConfig(target, false)

    const config = (await getLocalConfig()) as Configuration
    expect(config.defaultTarget).not.toEqual(target.name)
    const configTarget = config.targets?.find((t) => t.name === target.name)
    expect(configTarget).toBeTruthy()
    await removeFromLocalConfig(target.name)

    done()
  })
})

describe('removeFromLocalConfig', () => {
  let appName: string

  beforeEach(async (done) => {
    appName = `cli-tests-config-${generateTimestamp()}`
    await createTestMinimalApp(__dirname, appName)
    done()
  })

  afterEach(async (done) => {
    await removeTestApp(__dirname, appName)
    done()
  })

  it('should reset the default target when that target is removed', async (done) => {
    const appName = 'cli-tests-config-' + generateTimestamp()
    const target = await generateTestTarget(
      appName,
      `/Public/app/cli-tests/${appName}`
    )

    await saveToLocalConfig(target, true)

    let config = (await getLocalConfig()) as Configuration
    expect(config.defaultTarget).toEqual(target.name)
    await removeFromLocalConfig(target.name)

    config = (await getLocalConfig()) as Configuration
    const configTarget = config.targets?.find((t) => t.name === target.name)
    expect(configTarget).toBeFalsy()
    expect(config.defaultTarget).toEqual('')

    done()
  })

  it('should not change the default target when another target is removed', async (done) => {
    const appName1 = 'cli-tests-config-1-' + generateTimestamp()
    const appName2 = 'cli-tests-config-2-' + generateTimestamp()
    const target1 = await generateTestTarget(
      appName1,
      `/Public/app/cli-tests/${appName1}`
    )
    const target2 = await generateTestTarget(
      appName2,
      `/Public/app/cli-tests/${appName2}`
    )

    await saveToLocalConfig(target1, true)
    await saveToLocalConfig(target2, false)

    let config = (await getLocalConfig()) as Configuration
    expect(config.defaultTarget).toEqual(target1.name)
    const configTarget1 = config.targets?.find((t) => t.name === target1.name)
    expect(configTarget1).toBeTruthy()
    let configTarget2 = config.targets?.find((t) => t.name === target2.name)
    expect(configTarget2).toBeTruthy()

    await removeFromLocalConfig(target2.name)
    config = (await getLocalConfig()) as Configuration
    configTarget2 = config.targets?.find((t) => t.name === target2.name)
    expect(configTarget2).toBeFalsy()
    expect(config.defaultTarget).toEqual(target1.name)

    done()
  })
})

import {
  getAccessToken,
  getAuthConfig,
  persistTokensRefreshedByAdapter,
  sanitizeAppLoc,
  overrideEnvVariables,
  saveToGlobalConfig,
  getGlobalRcFile,
  removeFromGlobalConfig,
  saveToLocalConfig,
  getLocalConfig,
  removeFromLocalConfig,
  getSASjs
} from '../config'
import * as authUtils from '../auth'
import * as sasjsAuthUtils from '@sasjs/utils/auth'
import * as fileUtils from '@sasjs/utils/file'
import dotenv from 'dotenv'
import path from 'path'
import {
  createFile,
  deleteFile,
  Logger,
  LogLevel,
  SasAuthResponse,
  Configuration,
  Target,
  generateTimestamp,
  ServerType
} from '@sasjs/utils'
import { readFile } from '@sasjs/utils/file'
import {
  createTestMinimalApp,
  generateTestTarget,
  removeTestApp
} from '../test'
import { setConstants } from '../setConstants'

// The compiled @sasjs/utils/auth module exposes getters that jest.spyOn
// cannot redefine - mock the module with configurable jest.fn()s that
// default to the real implementations.
jest.mock('@sasjs/utils/auth', () => {
  const actual = jest.requireActual('@sasjs/utils/auth')
  return {
    ...actual,
    isAccessTokenExpiring: jest.fn(),
    isRefreshTokenExpiring: jest.fn()
  }
})
const actualAuthUtils = jest.requireActual('@sasjs/utils/auth')

beforeEach(() => {
  ;(sasjsAuthUtils.isAccessTokenExpiring as jest.Mock).mockImplementation(
    actualAuthUtils.isAccessTokenExpiring
  )
  ;(sasjsAuthUtils.isRefreshTokenExpiring as jest.Mock).mockImplementation(
    actualAuthUtils.isRefreshTokenExpiring
  )
})

describe('getAccessToken', () => {
  beforeEach(async () => {
    process.projectDir = process.cwd()
    await setConstants()
    dotenv.config()
    process.env.ACCESS_TOKEN = undefined
    process.env.CLIENT = undefined
    process.env.SECRET = undefined
  })

  afterEach(() => {
    process.env.ACCESS_TOKEN = undefined
    process.env.CLIENT = undefined
    process.env.SECRET = undefined
    process.env.REFRESH_TOKEN = undefined
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

  it('should prioritise the access token from matching env file if available', async () => {
    process.env.ACCESS_TOKEN = '3NVT0K3N'
    const target = {
      name: 'ConfigTest'
    }
    await createFile(
      path.join(__dirname, '.env.ConfigTest'),
      'ACCESS_TOKEN=T4RG3TT0K3N'
    )
    process.projectDir = __dirname
    await setConstants()

    const token = await getAccessToken(target as Target, false)

    expect(token).toEqual('T4RG3TT0K3N')
    await deleteFile(path.join(__dirname, '.env.ConfigTest'))
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

  it('should refresh access token when it is expiring and refresh token is available & not expired', async () => {
    ;(sasjsAuthUtils.isAccessTokenExpiring as jest.Mock).mockImplementation(
      () => true
    )
    ;(sasjsAuthUtils.isRefreshTokenExpiring as jest.Mock).mockImplementation(
      () => false
    )
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

    expect(sasjsAuthUtils.isAccessTokenExpiring).toHaveBeenCalledTimes(1)
    expect(sasjsAuthUtils.isRefreshTokenExpiring).toHaveBeenCalledTimes(1)
    expect(authUtils.refreshTokens).toHaveBeenCalledTimes(1)
    expect(authUtils.getNewAccessToken).not.toHaveBeenCalled()
    expect(token).toEqual('N3WT0K3N')
  })

  it('should get new access token when it is expiring and refresh token is available & expired', async () => {
    ;(sasjsAuthUtils.isAccessTokenExpiring as jest.Mock).mockImplementation(
      () => true
    )
    ;(sasjsAuthUtils.isRefreshTokenExpiring as jest.Mock).mockImplementation(
      () => true
    )
    jest.spyOn(authUtils, 'refreshTokens')
    jest.spyOn(authUtils, 'getNewAccessToken').mockImplementation(() =>
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
    process.env.REFRESH_TOKEN = undefined

    const token = await getAccessToken(target as Target, true)

    expect(sasjsAuthUtils.isAccessTokenExpiring).toHaveBeenCalledTimes(1)
    expect(sasjsAuthUtils.isRefreshTokenExpiring).toHaveBeenCalledTimes(1)
    expect(authUtils.refreshTokens).not.toHaveBeenCalled()
    expect(authUtils.getNewAccessToken).toHaveBeenCalledTimes(1)
    expect(token).toEqual('N3WT0K3N')
  })

  it('should get new access token when it is expiring and refresh token is not available', async () => {
    ;(sasjsAuthUtils.isAccessTokenExpiring as jest.Mock).mockImplementation(
      () => true
    )
    ;(sasjsAuthUtils.isRefreshTokenExpiring as jest.Mock).mockImplementation(
      () => true
    )
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

    expect(sasjsAuthUtils.isAccessTokenExpiring).toHaveBeenCalledTimes(1)
    expect(sasjsAuthUtils.isRefreshTokenExpiring).toHaveBeenCalledTimes(1)
    expect(authUtils.refreshTokens).not.toHaveBeenCalled()
    expect(authUtils.getNewAccessToken).toHaveBeenCalledTimes(1)
    expect(token).toEqual('N3WT0K3N')
  })

  it('should throw an error if access token is expiring and client ID is not available', async () => {
    ;(sasjsAuthUtils.isAccessTokenExpiring as jest.Mock).mockImplementation(
      () => true
    )
    const target = {
      name: 'viya',
      authConfig: {
        access_token: 'T0K3N',
        secret: '53CR3T'
      }
    }
    process.env.CLIENT = undefined

    await expect(getAccessToken(target as Target)).rejects.toThrow(
      /sasjs auth login -t viya/
    )
  })

  it('should throw an error if access token is expiring and client secret is not available', async () => {
    ;(sasjsAuthUtils.isAccessTokenExpiring as jest.Mock).mockImplementation(
      () => true
    )
    const target = {
      name: 'viya',
      authConfig: {
        access_token: 'T0K3N',
        client: 'CL13NT'
      }
    }
    process.env.SECRET = undefined

    await expect(getAccessToken(target as Target)).rejects.toThrow(
      /sasjs auth login -t viya/
    )
  })
})

describe('getAuthConfig', () => {
  beforeEach(async () => {
    process.projectDir = process.cwd()
    process.env.ACCESS_TOKEN = undefined
    process.env.CLIENT = undefined
    process.env.SECRET = undefined
    process.env.REFRESH_TOKEN = undefined
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('should return a fresh access token even when client and secret are not configured', async () => {
    ;(sasjsAuthUtils.isAccessTokenExpiring as jest.Mock).mockImplementation(
      () => false
    )
    const target = {
      name: 'viya',
      authConfig: {
        access_token: 'T0K3N'
      }
    }

    const authConfig = await getAuthConfig(target as Target)

    expect(authConfig.access_token).toEqual('T0K3N')
  })

  it('should return the configured secret on the fresh-token early return when client/secret are set', async () => {
    ;(sasjsAuthUtils.isAccessTokenExpiring as jest.Mock).mockImplementation(
      () => false
    )
    const target = {
      name: 'viya',
      authConfig: {
        access_token: 'T0K3N',
        client: 'CL13NT',
        secret: '53CR3T'
      }
    }

    const authConfig = await getAuthConfig(target as Target)

    expect(authConfig.access_token).toEqual('T0K3N')
    expect(authConfig.client).toEqual('CL13NT')
    expect(authConfig.secret).toEqual('53CR3T')
  })

  it('should throw an error mentioning sasjs auth login when the token is expiring and no client is available', async () => {
    ;(sasjsAuthUtils.isAccessTokenExpiring as jest.Mock).mockImplementation(
      () => true
    )
    const target = {
      name: 'viya',
      authConfig: {
        access_token: 'T0K3N'
      }
    }

    await expect(getAuthConfig(target as Target)).rejects.toThrow(
      /sasjs auth login/
    )
  })
})

describe('getAuthConfig - opaque refresh tokens', () => {
  const opaqueRefreshToken = '1f8da55057bd4f50a6577f0bc2b38b1a-r'
  let projectDir: string

  const setupLocalProjectWithTarget = async (target: Target) => {
    projectDir = path.join(
      process.env.TEMP || process.env.TMP || '/tmp',
      `sasjs-cli-test-${generateTimestamp()}`
    )
    process.projectDir = projectDir
    await setConstants()
    await createFile(
      path.join(projectDir, 'sasjs', 'sasjsconfig.json'),
      JSON.stringify({ targets: [target.toJson()] })
    )
  }

  beforeEach(() => {
    process.env.ACCESS_TOKEN = undefined
    process.env.CLIENT = undefined
    process.env.SECRET = undefined
    process.env.REFRESH_TOKEN = undefined
  })

  afterEach(async () => {
    jest.resetAllMocks()
    await deleteFile(projectDir).catch(() => {})
  })

  it('should refresh without crashing and persist the rotated pair in the client/secret branch', async () => {
    // The real isRefreshTokenExpiring must be used - it should treat the
    // opaque token as usable rather than throwing InvalidTokenError.
    ;(sasjsAuthUtils.isAccessTokenExpiring as jest.Mock).mockImplementation(
      () => true
    )
    jest.spyOn(authUtils, 'refreshTokens').mockImplementation(() =>
      Promise.resolve({
        access_token: 'N3WT0K3N',
        refresh_token: 'N3WR3FR35H'
      } as SasAuthResponse)
    )

    const target = new Target({
      name: 'opaq',
      serverType: ServerType.SasViya,
      serverUrl: 'https://example.com',
      appLoc: '/Public/app',
      contextName: 'test context',
      authConfig: {
        access_token: 'T0K3N',
        refresh_token: opaqueRefreshToken,
        client: 'CL13NT',
        secret: '53CR3T'
      }
    })
    await setupLocalProjectWithTarget(target)

    const authConfig = await getAuthConfig(target)

    expect(authUtils.refreshTokens).toHaveBeenCalledTimes(1)
    expect(authConfig.access_token).toEqual('N3WT0K3N')

    const envContent = await readFile(path.join(projectDir, '.env.opaq'))
    expect(envContent).toContain('ACCESS_TOKEN=N3WT0K3N')
    expect(envContent).toContain('REFRESH_TOKEN=N3WR3FR35H')
    expect(envContent).toContain('CLIENT=CL13NT')
  })

  it('should refresh via the sas.cli public client and persist the rotated pair when no client is configured', async () => {
    ;(sasjsAuthUtils.isAccessTokenExpiring as jest.Mock).mockImplementation(
      () => true
    )
    const refreshTokensSpy = jest
      .spyOn(authUtils, 'refreshTokens')
      .mockImplementation(() =>
        Promise.resolve({
          access_token: 'N3WT0K3N',
          refresh_token: 'N3WR3FR35H'
        } as SasAuthResponse)
      )

    const target = new Target({
      name: 'opaq',
      serverType: ServerType.SasViya,
      serverUrl: 'https://example.com',
      appLoc: '/Public/app',
      contextName: 'test context',
      authConfig: {
        access_token: 'T0K3N',
        refresh_token: opaqueRefreshToken
      }
    })
    await setupLocalProjectWithTarget(target)

    const authConfig = await getAuthConfig(target)

    expect(refreshTokensSpy).toHaveBeenCalledWith(
      expect.anything(),
      'sas.cli',
      '',
      opaqueRefreshToken
    )
    expect(authConfig.access_token).toEqual('N3WT0K3N')
    expect(authConfig.client).toBeUndefined()
    expect(authConfig.secret).toBeUndefined()

    const envContent = await readFile(path.join(projectDir, '.env.opaq'))
    expect(envContent).toContain('ACCESS_TOKEN=N3WT0K3N')
    expect(envContent).toContain('REFRESH_TOKEN=N3WR3FR35H')
    expect(envContent).not.toContain('CLIENT=')
  })

  it('should persist tokens refreshed internally by the adapter without dropping client/secret', async () => {
    const target = new Target({
      name: 'opaq',
      serverType: ServerType.SasViya,
      serverUrl: 'https://example.com',
      appLoc: '/Public/app',
      contextName: 'test context',
      authConfig: {
        access_token: 'T0K3N',
        refresh_token: opaqueRefreshToken,
        client: 'CL13NT',
        secret: '53CR3T'
      }
    })
    await setupLocalProjectWithTarget(target)

    await persistTokensRefreshedByAdapter(target)({
      access_token: '4D4PT3R',
      refresh_token: '4D4PT3RR3FR35H'
    })

    const envContent = await readFile(path.join(projectDir, '.env.opaq'))
    expect(envContent).toContain('ACCESS_TOKEN=4D4PT3R')
    expect(envContent).toContain('REFRESH_TOKEN=4D4PT3RR3FR35H')
    expect(envContent).toContain('CLIENT=CL13NT')
    expect(envContent).toContain('SECRET=53CR3T')
  })

  it('should persist tokens refreshed by the adapter without adding CLIENT=/SECRET= lines for a password-grant-only target', async () => {
    const target = new Target({
      name: 'opaq',
      serverType: ServerType.SasViya,
      serverUrl: 'https://example.com',
      appLoc: '/Public/app',
      contextName: 'test context',
      authConfig: {
        access_token: 'T0K3N',
        refresh_token: opaqueRefreshToken
      }
    })
    await setupLocalProjectWithTarget(target)

    await persistTokensRefreshedByAdapter(target)({
      access_token: '4D4PT3R',
      refresh_token: '4D4PT3RR3FR35H'
    })

    const envContent = await readFile(path.join(projectDir, '.env.opaq'))
    expect(envContent).toContain('ACCESS_TOKEN=4D4PT3R')
    expect(envContent).toContain('REFRESH_TOKEN=4D4PT3RR3FR35H')
    expect(envContent).not.toContain('CLIENT=')
    expect(envContent).not.toContain('SECRET=')
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
  it('should do nothing when the target name is falsy', async () => {
    jest.spyOn(fileUtils, 'readFile')
    jest.spyOn(dotenv, 'parse')

    await overrideEnvVariables('')

    expect(fileUtils.readFile).not.toHaveBeenCalled()
    expect(dotenv.parse).not.toHaveBeenCalled()
  })

  it('should display a warning when the target env file is not found', async () => {
    process.logger = new Logger(LogLevel.Off)
    process.projectDir = __dirname
    await setConstants()
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
  })

  it('should override env variables with values from the target-specific file', async () => {
    process.logger = new Logger(LogLevel.Off)
    process.projectDir = __dirname
    await setConstants()
    jest
      .spyOn(fileUtils, 'readFile')
      .mockImplementationOnce(() => Promise.resolve('ACCESS_TOKEN=T4RG3TT0K3N'))

    jest.spyOn(process.logger, 'warn')
    jest.spyOn(dotenv, 'parse')

    await overrideEnvVariables('OverrideTest')

    expect(process.logger?.warn).not.toHaveBeenCalled()
    expect(dotenv.parse).toHaveBeenCalledWith('ACCESS_TOKEN=T4RG3TT0K3N')
    expect(process.env.ACCESS_TOKEN).toEqual('T4RG3TT0K3N')
  })
})

describe('saveToGlobalConfig', () => {
  beforeEach(async () => {
    process.projectDir = __dirname
    await setConstants()
  })

  it('should set the target as default when isDefault is true', async () => {
    const appName = 'cli-tests-config-' + generateTimestamp()
    const target = generateTestTarget(
      appName,
      `/Public/app/cli-tests/${appName}`
    )

    await saveToGlobalConfig(target, true)

    const config = (await getGlobalRcFile()) as Configuration
    expect(config.defaultTarget).toEqual(target.name)
    const configTarget = config.targets?.find((t) => t.name === target.name)
    expect(configTarget).toBeTruthy()
    await removeFromGlobalConfig(target.name)
  })

  it('should not set the target as default when isDefault is false', async () => {
    const appName = 'cli-tests-config-' + generateTimestamp()
    const target = generateTestTarget(
      appName,
      `/Public/app/cli-tests/${appName}`
    )

    await saveToGlobalConfig(target, false)

    const config = (await getGlobalRcFile()) as Configuration
    expect(config.defaultTarget).not.toEqual(target.name)
    const configTarget = config.targets?.find((t) => t.name === target.name)
    expect(configTarget).toBeTruthy()
    await removeFromGlobalConfig(target.name)
  })
})

describe('removeFromGlobalConfig', () => {
  beforeEach(async () => {
    process.projectDir = __dirname
    await setConstants()
  })

  it('should reset the default target when that target is removed', async () => {
    const appName = 'cli-tests-config-' + generateTimestamp()
    const target = generateTestTarget(
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
  })

  it('should not change the default target when another target is removed', async () => {
    const appName1 = 'cli-tests-config-1-' + generateTimestamp()
    const appName2 = 'cli-tests-config-2-' + generateTimestamp()
    const target1 = generateTestTarget(
      appName1,
      `/Public/app/cli-tests/${appName1}`
    )
    const target2 = generateTestTarget(
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
  })
})

describe('saveToLocalConfig', () => {
  let appName: string

  beforeEach(async () => {
    appName = `cli-tests-config-${generateTimestamp()}`
    await createTestMinimalApp(__dirname, appName)
  })

  afterEach(async () => {
    await removeTestApp(__dirname, appName)
  })

  it('should set the target as default when isDefault is true', async () => {
    const appName = 'cli-tests-cb-' + generateTimestamp()
    const target = generateTestTarget(
      appName,
      `/Public/app/cli-tests/${appName}`
    )

    await saveToLocalConfig(target, true)

    const config = (await getLocalConfig()) as Configuration
    expect(config.defaultTarget).toEqual(target.name)
    const configTarget = config.targets?.find((t) => t.name === target.name)
    expect(configTarget).toBeTruthy()
    await removeFromLocalConfig(target.name)
  })

  it('should not set the target as default when isDefault is false', async () => {
    const appName = 'cli-tests-cb-' + generateTimestamp()
    const target = generateTestTarget(
      appName,
      `/Public/app/cli-tests/${appName}`
    )

    await saveToLocalConfig(target, false)

    const config = (await getLocalConfig()) as Configuration
    expect(config.defaultTarget).not.toEqual(target.name)
    const configTarget = config.targets?.find((t) => t.name === target.name)
    expect(configTarget).toBeTruthy()
    await removeFromLocalConfig(target.name)
  })
})

describe('removeFromLocalConfig', () => {
  let appName: string

  beforeEach(async () => {
    appName = `cli-tests-config-${generateTimestamp()}`
    await createTestMinimalApp(__dirname, appName)
  })

  afterEach(async () => {
    await removeTestApp(__dirname, appName)
  })

  it('should reset the default target when that target is removed', async () => {
    const appName = 'cli-tests-config-' + generateTimestamp()
    const target = generateTestTarget(
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
  })

  it('should not change the default target when another target is removed', async () => {
    const appName1 = 'cli-tests-config-1-' + generateTimestamp()
    const appName2 = 'cli-tests-config-2-' + generateTimestamp()
    const target1 = generateTestTarget(
      appName1,
      `/Public/app/cli-tests/${appName1}`
    )
    const target2 = generateTestTarget(
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
  })
})

describe('getSASjs', () => {
  it('should set sasjsConfig according to target', () => {
    const target = {
      serverUrl: 'test_serverUrl',
      appLoc: 'test_appLoc',
      serverType: ServerType.SasViya,
      contextName: 'test_contextName',
      httpsAgentOptions: {
        caPath: 'test_caPath',
        keyPath: 'test_keyPath',
        certPath: 'test_certPath',
        allowInsecureRequests: false
      }
    } as Target

    const sasjs = getSASjs(target)
    const sasjsConfig = sasjs.getSasjsConfig()
    const { serverUrl, appLoc, serverType, contextName, httpsAgentOptions } =
      sasjsConfig

    expect(serverUrl).toEqual(target.serverUrl)
    expect(appLoc).toEqual(target.appLoc)
    expect(serverType).toEqual(target.serverType)
    expect(contextName).toEqual(target.contextName)
    expect(httpsAgentOptions).toEqual(target.httpsAgentOptions)
  })

  it('should set debug to true by default', () => {
    const sasjs = getSASjs({} as Target)
    const sasjsConfig = sasjs.getSasjsConfig()
    const { debug } = sasjsConfig

    expect(debug).toEqual(true)
  })

  it('should set useComputeApi to true if server type is Viya', () => {
    const sasjs = getSASjs({ serverType: ServerType.SasViya } as Target)
    const sasjsConfig = sasjs.getSasjsConfig()
    const { useComputeApi } = sasjsConfig

    expect(useComputeApi).toEqual(true)
  })

  it('should set useComputeApi to false if server type is not Viya', () => {
    let sasjs = getSASjs({ serverType: ServerType.Sas9 } as Target)
    let sasjsConfig = sasjs.getSasjsConfig()
    let { useComputeApi } = sasjsConfig

    expect(useComputeApi).toEqual(false)

    sasjs = getSASjs({ serverType: ServerType.Sasjs } as Target)
    sasjsConfig = sasjs.getSasjsConfig()
    useComputeApi = sasjsConfig.useComputeApi

    expect(useComputeApi).toEqual(false)
  })

  it(`should enable verbose mode if VERBOSE env is present and is equal to 'on'(case insensitive)`, () => {
    process.env.VERBOSE = 'on'

    let sasjs = getSASjs({} as Target)
    let sasjsConfig = sasjs.getSasjsConfig()
    let { verbose } = sasjsConfig

    expect(verbose).toEqual(true)

    process.env.VERBOSE = 'ON'

    sasjs = getSASjs({} as Target)
    sasjsConfig = sasjs.getSasjsConfig()
    verbose = sasjsConfig.verbose

    expect(verbose).toEqual(true)
  })

  it(`should enable verbose mode if LOG_LEVEL env is present and is equal to 'trace'(case insensitive)`, () => {
    process.env.LOG_LEVEL = 'trace'

    let sasjs = getSASjs({} as Target)
    let sasjsConfig = sasjs.getSasjsConfig()
    let { verbose } = sasjsConfig

    expect(verbose).toEqual(true)

    process.env.LOG_LEVEL = 'TRACE'

    sasjs = getSASjs({} as Target)
    sasjsConfig = sasjs.getSasjsConfig()
    verbose = sasjsConfig.verbose

    expect(verbose).toEqual(true)
  })

  it('should disable verbose mode if VERBOSE and LOG_LEVEL env are not present', () => {
    process.env.VERBOSE = ''
    process.env.LOG_LEVEL = ''

    const sasjs = getSASjs({} as Target)
    const sasjsConfig = sasjs.getSasjsConfig()
    const { verbose } = sasjsConfig

    expect(verbose).toEqual(false)
  })

  it(`should disable verbose mode if VERBOSE env is present and is not equal to 'on'(case insensitive) and LOG_LEVEL env is present and is not equal to 'trace'(case insensitive)`, () => {
    process.env.VERBOSE = 'start'
    process.env.LOG_LEVEL = 'Info'

    const sasjs = getSASjs({} as Target)
    const sasjsConfig = sasjs.getSasjsConfig()
    const { verbose } = sasjsConfig

    expect(verbose).toEqual(false)
  })
})

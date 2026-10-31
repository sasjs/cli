import {
  validateTargetName,
  getTokens,
  createEnvFileForViya,
  addCredential
} from '../addCredential'
import { ServerType, Target, SasAuthResponse } from '@sasjs/utils'
import dotenv from 'dotenv'
import path from 'path'
import * as authUtils from '../../../utils/auth'
import * as fileUtils from '@sasjs/utils/file'
import * as configUtils from '../../../utils/config'
import * as inputModule from '../internal/input'
import { getDefaultValues } from '../internal/input'
import { TargetScope } from '../../../types'
import { contextName } from '../../../utils'

describe('addCredential', () => {
  it('prompts the user to enter the server URL if not found', async () => {
    process.projectDir = '.'

    setupMocks()
    const target = new Target({
      name: 'test-target',
      serverUrl: '',
      serverType: ServerType.SasViya,
      appLoc: '/test',
      contextName
    })

    await addCredential(target, false, TargetScope.Local)

    expect(inputModule.getAndValidateServerUrl).toHaveBeenCalled()
    expect(configUtils.saveToLocalConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'test-target',
        serverUrl: 'http://server.com',
        serverType: ServerType.SasViya,
        appLoc: '/test'
      }),
      false,
      false
    )

    await fileUtils.deleteFile(path.join('.', '.env.test-target'))
  })
})

describe('addCredential - insecure connections', () => {
  const viyaTarget = () =>
    new Target({
      name: 'test-insecure',
      serverUrl: 'https://sas.example.com',
      serverType: ServerType.SasViya,
      appLoc: '/test',
      contextName
    })

  beforeEach(() => {
    process.projectDir = '.'
    setupMocks()
  })

  afterEach(async () => {
    jest.restoreAllMocks()
    await fileUtils.deleteFile(path.join('.', '.env.test-insecure'))
  })

  it('uses an insecure agent for the token request when insecure is true', async () => {
    const getSASjsSpy = jest.spyOn(configUtils, 'getSASjs')

    await addCredential(viyaTarget(), true, TargetScope.Local)

    expect(getSASjsSpy).toHaveBeenCalled()

    const requestTarget = getSASjsSpy.mock.calls[0][0] as Target

    expect(requestTarget.httpsAgentOptions).toEqual(
      expect.objectContaining({
        allowInsecureRequests: true,
        rejectUnauthorized: false
      })
    )
  })

  it('does not write the insecure options to the saved target', async () => {
    jest.spyOn(configUtils, 'getSASjs')

    await addCredential(viyaTarget(), true, TargetScope.Local)

    const saveSpy = configUtils.saveToLocalConfig as jest.Mock

    expect(saveSpy).toHaveBeenCalled()

    for (const call of saveSpy.mock.calls) {
      expect((call[0] as Target).httpsAgentOptions).toBeUndefined()
    }
  })

  it('leaves the request target alone when insecure is false', async () => {
    const getSASjsSpy = jest.spyOn(configUtils, 'getSASjs')

    await addCredential(viyaTarget(), false, TargetScope.Local)

    const requestTarget = getSASjsSpy.mock.calls[0][0] as Target

    expect(requestTarget.httpsAgentOptions).toBeUndefined()
  })
})

describe('validateTargetName', () => {
  it('should return the target name if valid', () => {
    const targetName = 'validTarget'

    expect(validateTargetName(targetName)).toEqual(targetName)
  })

  it('should return the target name if valid', () => {
    const targetName = '123validTarget'

    expect(validateTargetName(targetName)).toEqual(targetName)
  })

  it('should return the target name if valid', () => {
    const targetName = 'valid123Target'

    expect(validateTargetName(targetName)).toEqual(targetName)
  })

  it('should return the target name if valid', () => {
    const targetName = 'valid-target-123'

    expect(validateTargetName(targetName)).toEqual(targetName)
  })

  it('should throw an error if the target name includes spaces', () => {
    const targetName = 'test target name'

    expect(() => validateTargetName(targetName)).toThrow(
      'Target names cannot include spaces. Please try again with a valid target name.'
    )
  })

  it('should throw an error if the target name contains invalid characters', () => {
    const targetName = 'target#name!'

    expect(() => validateTargetName(targetName)).toThrow(
      'Target names can only contain alphanumeric characters. Please try again with a valid target name.'
    )
  })
})

describe('getTokens', () => {
  let testTarget: Target

  beforeEach(() => {
    dotenv.config()
    testTarget = {
      serverType: ServerType.SasViya,
      serverUrl: process.env.VIYA_SERVER_URL
    } as Target
  })

  it('should throw an error when the supplied credentials are invalid', async () => {
    const client = 'invalidClient'
    const secret = 'invalidSecret'
    jest.spyOn(authUtils, 'getNewAccessToken').mockImplementation(() => {
      throw new Error('Invalid credentials')
    })

    await expect(
      getTokens(testTarget as Target, client, secret)
    ).rejects.toThrow()
  })

  it('should return the auth response when the supplied credentials are valid', async () => {
    const clientId = process.env.CLIENT as string
    const secret = process.env.SECRET as string
    jest.spyOn(authUtils, 'getNewAccessToken').mockImplementation(() =>
      Promise.resolve({
        access_token: 't0k3n',
        refresh_token: 'r3fr3sh'
      } as SasAuthResponse)
    )

    const authResponse = await getTokens(testTarget as Target, clientId, secret)

    expect(authResponse.access_token).toBeTruthy()
    expect(authResponse.refresh_token).toBeTruthy()
  }, 10000)
})

describe('createEnvFile', () => {
  it('should create a dotenv file with the supplied information', async () => {
    const targetName = 'testAddCredential'
    const clientId = 'cli3nt'
    const secret = 's3cr3t'
    const accessToken = 't0k3n'
    const refreshToken = 'r3fr35h'
    const expectedEnvFileContent = `CLIENT=${clientId}\nSECRET=${secret}\nACCESS_TOKEN=${accessToken}\nREFRESH_TOKEN=${refreshToken}\n`
    process.projectDir = '.'
    const expectedEnvFilePath = path.join('.', `.env.${targetName}`)
    const createSpy = jest
      .spyOn(fileUtils, 'createFile')
      .mockImplementation(() => Promise.resolve())

    await createEnvFileForViya(
      targetName,
      clientId,
      secret,
      accessToken,
      refreshToken
    )

    expect(createSpy).toHaveBeenCalledWith(
      expectedEnvFilePath,
      expectedEnvFileContent
    )
  })
})

describe('getDefaultValues', () => {
  afterEach(() => {
    dotenv.config()
  })

  it('should return values for client and secret if available', () => {
    process.env.CLIENT = 'cl13nt'
    process.env.SECRET = 's3cr3t'

    const defaultValues = getDefaultValues('test')

    expect(defaultValues.client).toEqual('cl13nt')
    expect(defaultValues.secret).toEqual('s3cr3t')
  })

  it('should return empty strings for client and secret if unavailable', () => {
    process.env.CLIENT = undefined
    process.env.SECRET = undefined

    const defaultValues = getDefaultValues('test')

    expect(defaultValues.client).toEqual('')
    expect(defaultValues.secret).toEqual('')
  })
})

const setupMocks = () => {
  jest
    .spyOn(inputModule, 'getAndValidateServerUrl')
    .mockImplementation(() => Promise.resolve('http://server.com'))
  jest
    .spyOn(inputModule, 'getCredentialsInputForViya')
    .mockImplementation(() =>
      Promise.resolve({ client: 'client', secret: 'secret' })
    )
  jest.spyOn(authUtils, 'getNewAccessToken').mockImplementation(() =>
    Promise.resolve({
      access_token: 'access',
      refresh_token: 'refresh'
    } as SasAuthResponse)
  )
  jest
    .spyOn(configUtils, 'saveToLocalConfig')
    .mockImplementation(() => Promise.resolve('.'))
  jest
    .spyOn(configUtils, 'findTargetInConfiguration')
    .mockImplementation(async () =>
      Promise.resolve({
        target: new Target({
          name: 'test-target',
          serverUrl: '',
          serverType: ServerType.SasViya,
          appLoc: '/test',
          contextName
        }),
        isLocal: true
      })
    )
}

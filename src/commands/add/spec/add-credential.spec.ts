import {
  validateTargetName,
  getTokens,
  createEnvFile,
  addCredential
} from '../addCredential'
import { ServerType, Target, SasAuthResponse } from '@sasjs/utils'
import dotenv from 'dotenv'
import path from 'path'
import * as authUtils from '../../../utils/auth'
import * as fileUtils from '../../../utils/file'
import * as configUtils from '../../../utils/config'
import * as inputModule from '../internal/input'
import { getDefaultValues } from '../internal/input'

describe('addCredential', () => {
  it('prompts the user to enter the server URL if not found', async (done) => {
    process.projectDir = '.'
    setupMocks()
    await addCredential('test-target')

    expect(inputModule.getAndValidateServerUrl).toHaveBeenCalled()
    expect(configUtils.saveToLocalConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'test-target',
        serverUrl: 'http://server.com',
        serverType: ServerType.SasViya,
        appLoc: '/test'
      }),
      false
    )

    await fileUtils.deleteFile(path.join('.', '.env.test-target'))
    jest.clearAllMocks()

    done()
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

  it('should throw an error if the target name is falsy', () => {
    const targetName = ''

    expect(() => validateTargetName(targetName)).toThrow(
      'Target name is required.\nPlease specify a valid target name using the `-t` or `--target` argument.'
    )
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
      serverUrl: process.env.SERVER_URL
    } as Target
  })

  it('should throw an error when the supplied credentials are invalid', async (done) => {
    const client = 'invalidClient'
    const secret = 'invalidSecret'
    jest.spyOn(authUtils, 'getNewAccessToken').mockImplementation(() => {
      throw new Error('Invalid credentials')
    })

    await expect(
      getTokens(testTarget as Target, client, secret)
    ).rejects.toThrow()
    done()
  })

  it('should return the auth response when the supplied credentials are valid', async (done) => {
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
    done()
  }, 10000)
})

describe('createEnvFile', () => {
  it('should create a dotenv file with the supplied information', async (done) => {
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

    await createEnvFile(targetName, clientId, secret, accessToken, refreshToken)

    expect(createSpy).toHaveBeenCalledWith(
      expectedEnvFilePath,
      expectedEnvFileContent
    )
    done()
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
    .spyOn(inputModule, 'getCredentialsInput')
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
  jest.spyOn(configUtils, 'findTargetInConfiguration').mockImplementation(() =>
    Promise.resolve({
      target: new Target({
        name: 'test-target',
        serverUrl: '',
        serverType: ServerType.SasViya,
        appLoc: '/test'
      }),
      isLocal: true
    })
  )
}

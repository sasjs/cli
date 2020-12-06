import {
  validateTargetName,
  getTokens,
  createEnvFile
} from '../../src/commands/add-credential'
import { ServerType, Logger, LogLevel, Target } from '@sasjs/utils'
import dotenv from 'dotenv'
import path from 'path'
import * as authUtils from '../../src/utils/auth-utils'
import * as fileUtils from '../../src/utils/file-utils'

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

  it('should throw an error if the target name is not alphanumeric', () => {
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

  const testLogger = new Logger(LogLevel.Off)

  it('should throw an error when the supplied credentials are invalid', async (done) => {
    const client = 'invalidClient'
    const secret = 'invalidSecret'
    jest.spyOn(authUtils, 'getNewAccessToken').mockImplementation(() => {
      throw new Error('Invalid credentials')
    })

    await expect(
      getTokens(testTarget as Target, testLogger, client, secret)
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
      })
    )

    const authResponse = await getTokens(
      testTarget as Target,
      testLogger,
      clientId,
      secret
    )

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

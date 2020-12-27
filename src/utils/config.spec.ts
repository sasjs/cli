import { getAccessToken, sanitizeAppLoc } from './config'
import * as authUtils from './auth-utils'
import {
  isAccessTokenExpiring,
  refreshTokens,
  getNewAccessToken
} from './auth-utils'
import dotenv from 'dotenv'
import { Target } from '@sasjs/utils/types'
jest.mock('@sasjs/adapter/node')

describe('Config Utils', () => {
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
    test('should get access token from authInfo', async () => {
      const target = {
        authConfig: {
          access_token: 'T0K3N'
        }
      }

      const token = await getAccessToken(target as Target, false)

      expect(token).toEqual('T0K3N')
    })

    test('should throw an error when access token is unavailable', async () => {
      const target = {
        authConfig: {
          access_token: ''
        }
      }

      await expect(getAccessToken(target as Target, false)).rejects.toThrow()
    })

    test('should throw an error when auth config is unavailable', async () => {
      const target = null

      await expect(
        getAccessToken((target as any) as Target, false)
      ).rejects.toThrow()
    })

    test('should get access token from environment', async () => {
      const target = null
      process.env.ACCESS_TOKEN = '3NVT0K3N'

      const token = await getAccessToken((target as any) as Target, false)

      expect(token).toEqual('3NVT0K3N')
    })

    test('should refresh access token when it is expiring and refresh token is available', async () => {
      jest
        .spyOn(authUtils, 'isAccessTokenExpiring')
        .mockImplementation(() => true)
      jest.spyOn(authUtils, 'getNewAccessToken')
      jest.spyOn(authUtils, 'refreshTokens').mockImplementation(() =>
        Promise.resolve({
          access_token: 'N3WT0K3N'
        })
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

    test('should get new access token when it is expiring and refresh token is not available', async () => {
      jest
        .spyOn(authUtils, 'isAccessTokenExpiring')
        .mockImplementation(() => true)
      jest.spyOn(authUtils, 'refreshTokens')
      jest.spyOn(authUtils, 'getNewAccessToken').mockImplementation(() =>
        Promise.resolve({
          access_token: 'N3WT0K3N'
        })
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

    test('should throw an error if access token is expiring and client ID is not available', async () => {
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

    test('should throw an error if access token is expiring and client secret is not available', async () => {
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

    test('should remove trailing slash', () => {
      expect(sanitizeAppLoc(notValidAppLoc)).toEqual(validAppLoc)
    })

    test('should remove multiple leading slashes', () => {
      expect(sanitizeAppLoc(notValidAppLoc)).toEqual(validAppLoc)
    })

    notValidAppLoc = 'Public/app///'
    test('should add leading slash', () => {
      expect(sanitizeAppLoc(notValidAppLoc)).toEqual(validAppLoc)
    })
  })
})

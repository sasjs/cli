import { getAccessToken, sanitizeAppLoc } from '../src/utils/config-utils'
import {
  isAccessTokenExpiring,
  refreshTokens,
  getNewAccessToken
} from '../src/utils/auth-utils'
jest.mock('@sasjs/adapter/node')

describe('Config Utils', () => {
  let authUtils
  beforeEach(() => {
    process.env.ACCESS_TOKEN = null

    jest.unmock('../src/utils/auth-utils')
    authUtils = require('../src/utils/auth-utils')
  })

  afterEach(() => {
    process.env.ACCESS_TOKEN = null
  })

  describe('getAccessToken', () => {
    test('should get access token from authInfo', async () => {
      const target = {
        authInfo: {
          access_token: 'T0K3N'
        }
      }

      const token = await getAccessToken(target, false)

      expect(token).toEqual('T0K3N')
    })

    test('should throw an error when access token is unavailable', async () => {
      const target = {
        authInfo: {
          access_token: ''
        }
      }

      await expect(getAccessToken(target, false)).rejects.toThrow()
    })

    test('should throw an error when auth info is unavailable', async () => {
      const target = null

      await expect(getAccessToken(target, false)).rejects.toThrow()
    })

    test('should get access token from environment', async () => {
      const target = null
      process.env.ACCESS_TOKEN = '3NVT0K3N'

      const token = await getAccessToken(target, false)

      expect(token).toEqual('3NVT0K3N')
    })

    test('should refresh access token when it is expiring and refresh token is available', async () => {
      authUtils.isAccessTokenExpiring = jest.fn(() => true)
      authUtils.getNewAccessToken = jest.fn()
      authUtils.refreshTokens = jest.fn(() =>
        Promise.resolve({
          access_token: 'N3WT0K3N'
        })
      )
      const target = {
        authInfo: {
          access_token: 'T0K3N',
          refresh_token: 'R3FR35H',
          client: 'CL13NT',
          secret: '53CR3T'
        }
      }

      const token = await getAccessToken(target, true)

      expect(isAccessTokenExpiring.mock.calls.length).toEqual(1)
      expect(refreshTokens.mock.calls.length).toEqual(1)
      expect(getNewAccessToken.mock.calls.length).toEqual(0)
      expect(token).toEqual('N3WT0K3N')
    })

    test('should get new access token when it is expiring and refresh token is not available', async () => {
      authUtils.isAccessTokenExpiring = jest.fn(() => true)
      authUtils.refreshTokens = jest.fn()
      authUtils.getNewAccessToken = jest.fn(() =>
        Promise.resolve({
          access_token: 'N3WT0K3N'
        })
      )
      const target = {
        authInfo: {
          access_token: 'T0K3N',
          client: 'CL13NT',
          secret: '53CR3T'
        }
      }

      const token = await getAccessToken(target, true)

      expect(isAccessTokenExpiring.mock.calls.length).toEqual(1)
      expect(refreshTokens.mock.calls.length).toEqual(0)
      expect(getNewAccessToken.mock.calls.length).toEqual(1)
      expect(token).toEqual('N3WT0K3N')
    })

    test('should throw an error if access token is expiring and client ID is not available', async () => {
      authUtils.isAccessTokenExpiring = jest.fn(() => true)
      const target = {
        authInfo: {
          access_token: 'T0K3N',
          secret: '53CR3T'
        }
      }

      await expect(getAccessToken(target)).rejects.toThrow()
    })

    test('should throw an error if access token is expiring and client secret is not available', async () => {
      authUtils.isAccessTokenExpiring = jest.fn(() => true)
      const target = {
        authInfo: {
          access_token: 'T0K3N',
          client: 'CL13NT'
        }
      }

      await expect(getAccessToken(target)).rejects.toThrow()
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

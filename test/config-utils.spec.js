import { getAccessToken } from '../src/utils/config-utils'

describe('Config Utils', () => {
  beforeEach(() => {
    process.env.access_token = null
  })

  afterEach(() => {
    process.env.access_token = null
  })

  describe('getAccessToken', () => {
    test('should get access token from authInfo', () => {
      const target = {
        authInfo: {
          access_token: 'T0K3N'
        }
      }

      const token = getAccessToken(target)

      expect(token).toEqual('T0K3N')
    })

    test('should throw an error when access token is unavailable', () => {
      const target = {
        authInfo: {
          access_token: ''
        }
      }

      expect(() => getAccessToken(target)).toThrow()
    })

    test('should throw an error when auth info is unavailable', () => {
      const target = null

      expect(() => getAccessToken(target)).toThrow()
    })

    test('should get access token from environment', () => {
      const target = null
      process.env.access_token = '3NVT0K3N'

      const token = getAccessToken(target)

      expect(token).toEqual('3NVT0K3N')
    })
  })
})

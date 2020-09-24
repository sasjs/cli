import { getAccessToken } from '../src/utils/config-utils'

describe('Config Utils', () => {
  beforeEach(() => {
    process.env.access_token = null

    jest.mock('@sasjs/adapter/node')
  })

  afterEach(() => {
    process.env.access_token = null
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
      process.env.access_token = '3NVT0K3N'

      const token = await getAccessToken(target, false)

      expect(token).toEqual('3NVT0K3N')
    })
  })
})

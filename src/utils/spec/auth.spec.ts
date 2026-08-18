import { ServerType, Target } from '@sasjs/utils'
import { fetchLoggedInUser } from '../auth'

// SasjsRequestClient is imported inside auth.ts from '@sasjs/adapter/node'.
// We mock the module so we can control the .get() response.
jest.mock('@sasjs/adapter/node', () => {
  const actual = jest.requireActual('@sasjs/adapter/node')
  return {
    ...actual,
    SasjsRequestClient: jest.fn().mockImplementation(() => ({
      get: jest.fn()
    }))
  }
})

// Re-import after mock setup so the module under test picks up the mock.
import { SasjsRequestClient } from '@sasjs/adapter/node'

describe('fetchLoggedInUser', () => {
  const target = new Target({
    name: 'test',
    serverType: ServerType.SasViya,
    serverUrl: 'https://viya.example.com',
    appLoc: '/Public/test',
    contextName: 'test context'
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should return the user id and name when the identity endpoint responds', async () => {
    const mockGet = jest.fn().mockResolvedValue({
      result: { id: 'sastest', name: 'SAS Test User' }
    })
    ;(SasjsRequestClient as jest.Mock).mockImplementation(() => ({
      get: mockGet
    }))

    const result = await fetchLoggedInUser(target, 'valid-token')

    expect(result).toEqual({ id: 'sastest', name: 'SAS Test User' })
  })

  it('should throw a friendly error when the identity endpoint returns an error', async () => {
    const mockGet = jest
      .fn()
      .mockRejectedValue(new Error('Request failed with status 401'))
    ;(SasjsRequestClient as jest.Mock).mockImplementation(() => ({
      get: mockGet
    }))

    await expect(fetchLoggedInUser(target, 'bad-token')).rejects.toThrow(
      `Unable to verify the access token against ${target.serverUrl}`
    )
  })

  it('should throw an error when the identity endpoint returns no user id', async () => {
    const mockGet = jest.fn().mockResolvedValue({ result: {} })
    ;(SasjsRequestClient as jest.Mock).mockImplementation(() => ({
      get: mockGet
    }))

    await expect(fetchLoggedInUser(target, 'token')).rejects.toThrow(
      'Login succeeded but the identity endpoint returned no user id.'
    )
  })
})

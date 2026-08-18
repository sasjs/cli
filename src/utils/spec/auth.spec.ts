import { ServerType, Target } from '@sasjs/utils'
import { CertificateError, SasjsRequestClient } from '@sasjs/adapter/node'
import {
  fetchLoggedInUser,
  getTokensWithPasswordGrant,
  SAS_CLI_CLIENT_ID
} from '../auth'

// SasjsRequestClient is imported inside auth.ts from '@sasjs/adapter/node'.
// We mock the module so we can control the .get() and .post() responses.
jest.mock('@sasjs/adapter/node', () => {
  const actual = jest.requireActual('@sasjs/adapter/node')
  return {
    ...actual,
    SasjsRequestClient: jest.fn().mockImplementation(() => ({
      get: jest.fn(),
      post: jest.fn()
    }))
  }
})

// Re-import after mock setup so the module under test picks up the mock.
// (Re-declared with the same name; TS allows this in spec files via the
//  `esModuleInterop` + `allowJs` combination the CLI's tsconfig enables.)
import { SasjsRequestClient as MockedSasjsRequestClient } from '@sasjs/adapter/node'

const target = new Target({
  name: 'test',
  serverType: ServerType.SasViya,
  serverUrl: 'https://viya.example.com',
  appLoc: '/Public/test',
  contextName: 'test context'
})

describe('fetchLoggedInUser', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should return the user id and name when the identity endpoint responds', async () => {
    const mockGet = jest.fn().mockResolvedValue({
      result: { id: 'sastest', name: 'SAS Test User' }
    })
    ;(MockedSasjsRequestClient as jest.Mock).mockImplementation(() => ({
      get: mockGet
    }))

    const result = await fetchLoggedInUser(target, 'valid-token')

    expect(result).toEqual({ id: 'sastest', name: 'SAS Test User' })
  })

  it('should throw a friendly error when the identity endpoint returns an error', async () => {
    const mockGet = jest
      .fn()
      .mockRejectedValue(new Error('Request failed with status 401'))
    ;(MockedSasjsRequestClient as jest.Mock).mockImplementation(() => ({
      get: mockGet
    }))

    await expect(fetchLoggedInUser(target, 'bad-token')).rejects.toThrow(
      `Unable to verify the access token against ${target.serverUrl}`
    )
  })

  it('should throw an error when the identity endpoint returns no user id', async () => {
    const mockGet = jest.fn().mockResolvedValue({ result: {} })
    ;(MockedSasjsRequestClient as jest.Mock).mockImplementation(() => ({
      get: mockGet
    }))

    await expect(fetchLoggedInUser(target, 'token')).rejects.toThrow(
      'Login succeeded but the identity endpoint returned no user id.'
    )
  })
})

describe('getTokensWithPasswordGrant', () => {
  const user = 'myuser'
  const pass = 'mypass'

  afterEach(() => {
    jest.clearAllMocks()
  })

  const mockPostSuccess = (tokens: {
    access_token?: string
    refresh_token?: string
  }) => {
    const mockPost = jest.fn().mockResolvedValue({ result: tokens })
    ;(MockedSasjsRequestClient as jest.Mock).mockImplementation(() => ({
      post: mockPost
    }))
    return mockPost
  }

  const mockPostFailure = (err: Error) => {
    const mockPost = jest.fn().mockRejectedValue(err)
    ;(MockedSasjsRequestClient as jest.Mock).mockImplementation(() => ({
      post: mockPost
    }))
    return mockPost
  }

  it('should send a password-grant request with the correct Basic auth header and grant_type', async () => {
    const mockPost = mockPostSuccess({
      access_token: 'access-123',
      refresh_token: 'refresh-456'
    })

    const result = await getTokensWithPasswordGrant(target, user, pass)

    expect(result).toEqual({
      access_token: 'access-123',
      refresh_token: 'refresh-456'
    })

    // Verify the post() call: endpoint, body, and headers.
    expect(mockPost).toHaveBeenCalledTimes(1)
    const [endpoint, body, , contentType, headers] = mockPost.mock.calls[0]
    expect(endpoint).toBe('/SASLogon/oauth/token')
    expect(contentType).toBe('application/x-www-form-urlencoded')

    // Basic auth header must be base64(sas.cli:) — secret-less public client.
    const expectedBasic = Buffer.from(`${SAS_CLI_CLIENT_ID}:`).toString(
      'base64'
    )
    expect(headers.Authorization).toBe(`Basic ${expectedBasic}`)

    // Body must carry grant_type=password plus the user credentials.
    expect(body).toBeInstanceOf(URLSearchParams)
    expect(body.get('grant_type')).toBe('password')
    expect(body.get('username')).toBe(user)
    expect(body.get('password')).toBe(pass)
  })

  it('should throw a friendly error when the token endpoint returns a non-200 response', async () => {
    mockPostFailure(new Error('Request failed with status 401'))

    await expect(
      getTokensWithPasswordGrant(target, user, pass)
    ).rejects.toThrow(`Login failed for user '${user}' on ${target.serverUrl}`)
  })

  it('should pass through CertificateError without wrapping it', async () => {
    const certErr = new CertificateError('https://viya.example.com')
    mockPostFailure(certErr)

    await expect(getTokensWithPasswordGrant(target, user, pass)).rejects.toBe(
      certErr
    )
  })

  it('should throw when the token endpoint response has no access_token', async () => {
    mockPostSuccess({ refresh_token: 'refresh-only' })

    await expect(
      getTokensWithPasswordGrant(target, user, pass)
    ).rejects.toThrow(
      'Login failed: the token endpoint did not return an access token.'
    )
  })

  it('should default refresh_token to empty string when the server omits it', async () => {
    mockPostSuccess({ access_token: 'access-only' })

    const result = await getTokensWithPasswordGrant(target, user, pass)

    expect(result.access_token).toBe('access-only')
    // Some Viya deployments omit refresh_token for the password grant; we
    // normalize to '' so downstream code (saveTokens, config) can treat it
    // as a plain string.
    expect(result.refresh_token).toBe('')
  })
})

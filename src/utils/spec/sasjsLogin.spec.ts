import axios from 'axios'
import { ServerType, Target } from '@sasjs/utils'
import { getTokensWithSasjsLogin } from '../auth'

jest.mock('axios')

const request = jest.fn()

const target = (client?: string) =>
  new Target({
    name: 'sasjs-test',
    serverType: ServerType.Sasjs,
    serverUrl: 'https://sasjs.example.com/',
    appLoc: '/Public/app',
    ...(client ? { authConfig: { client } as any } : {})
  })

const ok = (data: any, headers: Record<string, any> = {}) => ({
  status: 200,
  headers,
  data
})

const xsrfCookie = {
  'set-cookie': ['XSRF-TOKEN=abc%3D%3D; Path=/; HttpOnly']
}

const happyPath = (overrides: any[] = []) => {
  const responses = [
    ok('', xsrfCookie),
    ok({ loggedIn: true, user: { displayName: 'Test User' } }),
    ok([{ clientId: 'client-1' }]),
    ok({ code: 'the-code' }),
    ok({ accessToken: 'access-token', refreshToken: 'refresh-token' }),
    ...overrides
  ]
  responses.forEach((response) => request.mockResolvedValueOnce(response))
}

describe('getTokensWithSasjsLogin', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(axios.create as jest.Mock).mockReturnValue({ request })
  })

  it('should mint a token pair from the four-step local login', async () => {
    happyPath()

    const result = await getTokensWithSasjsLogin(target(), 'user1', 'pass1')

    expect(result).toEqual({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      client: 'client-1',
      displayName: 'Test User'
    })

    const calls = request.mock.calls.map((call) => call[0])
    expect(calls.map((c) => c.url)).toEqual([
      '/',
      '/SASLogon/login',
      '/SASjsApi/client',
      '/SASLogon/authorize',
      '/SASjsApi/auth/token'
    ])
    expect(calls[1].data).toEqual({ username: 'user1', password: 'pass1' })
    expect(calls[3].data).toEqual({ clientId: 'client-1' })
    expect(calls[4].data).toEqual({ clientId: 'client-1', code: 'the-code' })
  })

  it('should send the session cookie and the decoded XSRF token', async () => {
    happyPath()

    await getTokensWithSasjsLogin(target(), 'user1', 'pass1')

    const loginCall = request.mock.calls[1][0]
    expect(loginCall.headers.Cookie).toBe('XSRF-TOKEN=abc%3D%3D')
    expect(loginCall.headers['X-XSRF-TOKEN']).toBe('abc==')

    // The first call has nothing to send yet.
    expect(request.mock.calls[0][0].headers.Cookie).toBeUndefined()
  })

  it('should not list clients when an id is supplied', async () => {
    ;[
      ok('', xsrfCookie),
      ok({ loggedIn: true }),
      ok({ code: 'the-code' }),
      ok({ accessToken: 'access-token' })
    ].forEach((response) => request.mockResolvedValueOnce(response))

    const result = await getTokensWithSasjsLogin(
      target(),
      'user1',
      'pass1',
      'pinned-client'
    )

    expect(request).toHaveBeenCalledTimes(4)
    expect(result.client).toBe('pinned-client')
    expect(result.refresh_token).toBe('')
    expect(result.displayName).toBeUndefined()
  })

  it('should prefer the target client over the admin client listing', async () => {
    ;[
      ok('', xsrfCookie),
      ok({ loggedIn: true }),
      ok({ code: 'the-code' }),
      ok({ accessToken: 'access-token' })
    ].forEach((response) => request.mockResolvedValueOnce(response))

    const result = await getTokensWithSasjsLogin(
      target('from-config'),
      'user1',
      'pass1'
    )

    expect(result.client).toBe('from-config')
    expect(request).toHaveBeenCalledTimes(4)
  })

  it('should fail when the credentials are rejected', async () => {
    ;[
      ok('', xsrfCookie),
      ok({ loggedIn: false, error: 'invalid credentials' })
    ].forEach((response) => request.mockResolvedValueOnce(response))

    await expect(
      getTokensWithSasjsLogin(target(), 'user1', 'wrong')
    ).rejects.toThrow(
      "Login failed for user 'user1' on https://sasjs.example.com/"
    )
  })

  it('should fail, naming SASJS_CLIENT, when no client is available', async () => {
    ;[
      ok('', xsrfCookie),
      ok({ loggedIn: true }),
      { status: 403, headers: {}, data: 'Forbidden' }
    ].forEach((response) => request.mockResolvedValueOnce(response))

    await expect(
      getTokensWithSasjsLogin(target(), 'user1', 'pass1')
    ).rejects.toThrow(/No client id is available to authorize/)
  })

  it('should fail when the token endpoint returns nothing usable', async () => {
    ;[
      ok('', xsrfCookie),
      ok({ loggedIn: true }),
      ok([{ clientId: 'client-1' }]),
      ok({ code: 'the-code' }),
      ok({})
    ].forEach((response) => request.mockResolvedValueOnce(response))

    await expect(
      getTokensWithSasjsLogin(target(), 'user1', 'pass1')
    ).rejects.toThrow(/returned no access token/)
  })

  it('should refuse to follow a redirect that would replay the password', async () => {
    ;[
      ok('', xsrfCookie),
      {
        status: 307,
        headers: { location: 'https://elsewhere.example.com/login' },
        data: {}
      }
    ].forEach((response) => request.mockResolvedValueOnce(response))

    await expect(
      getTokensWithSasjsLogin(target(), 'user1', 'pass1')
    ).rejects.toThrow(/answered with a 307 redirect/)
  })

  it('should fall back to the raw XSRF value when it is not valid encoding', async () => {
    ;[
      ok('', { 'set-cookie': ['XSRF-TOKEN=abc%ZZ; Path=/'] }),
      ok({ loggedIn: true }),
      ok([{ clientId: 'client-1' }]),
      ok({ code: 'the-code' }),
      ok({ accessToken: 'access-token' })
    ].forEach((response) => request.mockResolvedValueOnce(response))

    await getTokensWithSasjsLogin(target(), 'user1', 'pass1')

    expect(request.mock.calls[1][0].headers['X-XSRF-TOKEN']).toBe('abc%ZZ')
  })
})

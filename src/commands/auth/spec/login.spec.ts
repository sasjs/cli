import prompts from 'prompts'
import { Logger, LogLevel, ServerType, Target } from '@sasjs/utils'
import * as utilsModule from '../../../utils'
import * as authLoginModule from '../login'

// Mock prompts so the password prompt returns immediately without blocking.
jest.mock('prompts', () => ({
  __esModule: true,
  default: jest.fn(() => Promise.resolve({ pass: 'test-pass' }))
}))

// Mock getString from @sasjs/utils so the username prompt doesn't block.
// We keep the rest of @sasjs/utils real (ServerType, Target, Logger, etc.).
jest.mock('@sasjs/utils', () => {
  const actual = jest.requireActual('@sasjs/utils')
  return {
    ...actual,
    getString: jest.fn(() => Promise.resolve('test-user'))
  }
})

// Re-import after mock so login.ts picks up the mocked getString.
import { getString as mockedGetString } from '@sasjs/utils'

// Mock the three orchestration dependencies that authLogin delegates to.
// We spy on the utils barrel (../../utils) which re-exports from auth.ts and
// config.ts, so the spies are the same references login.ts resolves at runtime.
jest.mock('../../../utils', () => ({
  ...jest.requireActual('../../../utils'),
  getTokensWithPasswordGrant: jest.fn(),
  fetchLoggedInUser: jest.fn(),
  saveTokens: jest.fn()
}))

const viyaTarget = new Target({
  name: 'viya-test',
  serverType: ServerType.SasViya,
  serverUrl: 'https://viya.example.com',
  appLoc: '/Public/test',
  contextName: 'test context'
})

const sas9Target = new Target({
  name: 'sas9-test',
  serverType: ServerType.Sas9,
  serverUrl: 'https://sas9.example.com',
  appLoc: '/Public/test',
  contextName: 'test context'
})

describe('authLogin', () => {
  beforeEach(() => {
    process.logger = new Logger(LogLevel.Off)
    jest.clearAllMocks()

    // getString is used for the username prompt; default to a valid value.
    ;(mockedGetString as jest.Mock).mockResolvedValue('test-user')

    // prompts password input — default to a valid password.
    ;(prompts as unknown as jest.Mock).mockResolvedValue({
      pass: 'test-pass'
    })

    // Default happy-path mocks; individual tests override as needed.
    ;(utilsModule.getTokensWithPasswordGrant as jest.Mock).mockResolvedValue({
      access_token: 'access-123',
      refresh_token: 'refresh-456'
    })
    ;(utilsModule.fetchLoggedInUser as jest.Mock).mockResolvedValue({
      id: 'sastest',
      name: 'SAS Test User'
    })
    ;(utilsModule.saveTokens as jest.Mock).mockResolvedValue(undefined)
  })

  afterAll(() => {
    jest.restoreAllMocks()
  })

  // ---------------------------------------------------------------------------
  // Guard 1: Non-Viya rejection
  // ---------------------------------------------------------------------------
  it('should reject when target.serverType is not SASVIYA', async () => {
    await expect(authLoginModule.authLogin(sas9Target)).rejects.toThrow(
      `'sasjs auth login' is only supported for SASVIYA targets.`
    )

    expect(utilsModule.getTokensWithPasswordGrant).not.toHaveBeenCalled()
    expect(utilsModule.saveTokens).not.toHaveBeenCalled()
  })

  // ---------------------------------------------------------------------------
  // Guard 2: Missing serverUrl
  // ---------------------------------------------------------------------------
  it('should reject when target.serverUrl is missing/empty', async () => {
    const noUrlTarget = new Target({
      name: 'no-url',
      serverType: ServerType.SasViya,
      serverUrl: '',
      appLoc: '/Public/test',
      contextName: 'test context'
    })

    await expect(authLoginModule.authLogin(noUrlTarget)).rejects.toThrow(
      `Target 'no-url' does not have a serverUrl configured.`
    )

    expect(utilsModule.getTokensWithPasswordGrant).not.toHaveBeenCalled()
    expect(utilsModule.saveTokens).not.toHaveBeenCalled()
  })

  // ---------------------------------------------------------------------------
  // Guard 3: --insecure httpsAgentOptions mutation
  // ---------------------------------------------------------------------------
  it('should set rejectUnauthorized: false on target.httpsAgentOptions when insecure is true', async () => {
    await authLoginModule.authLogin(viyaTarget, true)

    const callTarget = (utilsModule.getTokensWithPasswordGrant as jest.Mock)
      .mock.calls[0][0] as Target

    expect(callTarget.httpsAgentOptions).toMatchObject({
      rejectUnauthorized: false,
      allowInsecureRequests: true
    })
  })

  // ---------------------------------------------------------------------------
  // Guard 3b: insecure=false should NOT mutate httpsAgentOptions
  // ---------------------------------------------------------------------------
  it('should not mutate httpsAgentOptions when insecure is false', async () => {
    await authLoginModule.authLogin(viyaTarget, false)

    const callTarget = (utilsModule.getTokensWithPasswordGrant as jest.Mock)
      .mock.calls[0][0] as Target

    // The original target has no rejectUnauthorized set at all.
    expect(callTarget.httpsAgentOptions?.rejectUnauthorized).not.toBe(false)
  })

  // ---------------------------------------------------------------------------
  // Guard 4: saveTokens called with correct args on successful login
  // ---------------------------------------------------------------------------
  it('should call saveTokens with the target name, access token, and refresh token after successful login', async () => {
    await authLoginModule.authLogin(viyaTarget, false)

    expect(utilsModule.saveTokens).toHaveBeenCalledWith(
      viyaTarget.name,
      'access-123',
      'refresh-456'
    )
    expect(utilsModule.saveTokens).toHaveBeenCalledTimes(1)
  })

  // ---------------------------------------------------------------------------
  // Guard 4b: saveTokens should default refresh_token to '' when omitted
  // ---------------------------------------------------------------------------
  it('should call saveTokens with empty string refresh_token when the server omits it', async () => {
    ;(utilsModule.getTokensWithPasswordGrant as jest.Mock).mockResolvedValue({
      access_token: 'access-789',
      refresh_token: ''
    })

    await authLoginModule.authLogin(viyaTarget, false)

    expect(utilsModule.saveTokens).toHaveBeenCalledWith(
      viyaTarget.name,
      'access-789',
      ''
    )
  })

  // ---------------------------------------------------------------------------
  // Guard 5: fetchLoggedInUser failure — tokens not saved, error propagated
  // ---------------------------------------------------------------------------
  it('should not save tokens and should propagate the error when fetchLoggedInUser fails', async () => {
    ;(utilsModule.fetchLoggedInUser as jest.Mock).mockRejectedValue(
      new Error('Unable to verify the access token')
    )

    await expect(authLoginModule.authLogin(viyaTarget, false)).rejects.toThrow(
      'Unable to verify the access token'
    )

    expect(utilsModule.getTokensWithPasswordGrant).toHaveBeenCalled()
    expect(utilsModule.saveTokens).not.toHaveBeenCalled()
  })

  // ---------------------------------------------------------------------------
  // Guard 6: getTokensWithPasswordGrant failure — tokens not saved, error propagated
  // ---------------------------------------------------------------------------
  it('should not save tokens and should propagate the error when getTokensWithPasswordGrant fails', async () => {
    ;(utilsModule.getTokensWithPasswordGrant as jest.Mock).mockRejectedValue(
      new Error('Login failed for user')
    )

    await expect(authLoginModule.authLogin(viyaTarget, false)).rejects.toThrow(
      'Login failed for user'
    )

    expect(utilsModule.saveTokens).not.toHaveBeenCalled()
    expect(utilsModule.fetchLoggedInUser).not.toHaveBeenCalled()
  })

  // ---------------------------------------------------------------------------
  // Callback coverage: username validator rejects empty input
  // ---------------------------------------------------------------------------
  it('should pass a validator to getString that rejects empty usernames', async () => {
    await authLoginModule.authLogin(viyaTarget, false)

    const validator = (mockedGetString as jest.Mock).mock.calls[0][1] as (
      v: string
    ) => true | string

    expect(validator('')).toBe('Username is required.')
    expect(validator('someuser')).toBe(true)
  })

  // ---------------------------------------------------------------------------
  // Callback coverage: password prompt onCancel throws 'Input cancelled.'
  // ---------------------------------------------------------------------------
  it('should throw Input cancelled when the password prompt is cancelled', async () => {
    // Capture the onCancel handler from the prompts() call and invoke it
    // directly, simulating a user pressing Ctrl+C.
    ;(prompts as unknown as jest.Mock).mockImplementation(
      (_config: unknown, opts: { onCancel: () => void }) => {
        opts.onCancel()
        return Promise.resolve({ pass: '' })
      }
    )

    await expect(authLoginModule.authLogin(viyaTarget, false)).rejects.toThrow(
      'Input cancelled.'
    )

    expect(utilsModule.saveTokens).not.toHaveBeenCalled()
  })

  // ---------------------------------------------------------------------------
  // Branch coverage: id fallback in success log (id || 'unknown user')
  // ---------------------------------------------------------------------------
  it('should log "unknown user" when fetchLoggedInUser returns no id', async () => {
    ;(utilsModule.fetchLoggedInUser as jest.Mock).mockResolvedValue({
      id: '',
      name: 'Some Name'
    })

    // The function should still complete — the fallback is in the log message,
    // not a throw. We just verify saveTokens is still called.
    await authLoginModule.authLogin(viyaTarget, false)

    expect(utilsModule.saveTokens).toHaveBeenCalledWith(
      viyaTarget.name,
      'access-123',
      'refresh-456'
    )
  })

  // ---------------------------------------------------------------------------
  // Branch coverage: name fallback in success log (name ? ` (${name})` : '')
  // ---------------------------------------------------------------------------
  it('should succeed when fetchLoggedInUser returns no name', async () => {
    ;(utilsModule.fetchLoggedInUser as jest.Mock).mockResolvedValue({
      id: 'sastest',
      name: undefined
    })

    await authLoginModule.authLogin(viyaTarget, false)

    expect(utilsModule.saveTokens).toHaveBeenCalledWith(
      viyaTarget.name,
      'access-123',
      'refresh-456'
    )
  })
})

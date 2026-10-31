import { ServerType, Target } from '@sasjs/utils'
import { targetWithInsecureHttps } from '../target'

describe('targetWithInsecureHttps', () => {
  const target = new Target({
    name: 'test-target',
    serverUrl: 'https://sas.example.com',
    serverType: ServerType.SasViya,
    appLoc: '/Public/app'
  })

  it('returns the target itself when insecure is false', () => {
    expect(targetWithInsecureHttps(target, false)).toBe(target)
  })

  it('returns a copy that accepts unverifiable certificates when insecure is true', () => {
    const insecureTarget = targetWithInsecureHttps(target, true)

    expect(insecureTarget).not.toBe(target)
    expect(insecureTarget.serverUrl).toEqual(target.serverUrl)
    expect(insecureTarget.appLoc).toEqual(target.appLoc)
    expect(insecureTarget.httpsAgentOptions).toEqual(
      expect.objectContaining({
        allowInsecureRequests: true,
        rejectUnauthorized: false
      })
    )
  })

  it('leaves the original target unchanged', () => {
    targetWithInsecureHttps(target, true)

    expect(target.httpsAgentOptions).toBeUndefined()
  })

  it('keeps the httpsAgentOptions the target already carries', () => {
    const withCaPath = new Target({
      ...target.toJson(false),
      httpsAgentOptions: { caPath: '/etc/ssl/private/intermediate.pem' }
    })

    const insecureTarget = targetWithInsecureHttps(withCaPath, true)

    expect(insecureTarget.httpsAgentOptions).toEqual(
      expect.objectContaining({
        caPath: '/etc/ssl/private/intermediate.pem',
        allowInsecureRequests: true,
        rejectUnauthorized: false
      })
    )
    expect(withCaPath.httpsAgentOptions).toEqual(
      expect.not.objectContaining({ allowInsecureRequests: true })
    )
  })
})

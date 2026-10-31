import { ServerType, Target } from '@sasjs/utils'
import { TargetScope } from '../../../types/targetScope'
import * as configUtils from '../../../utils/config'
import { getComputeContexts } from '../internal/input'

describe('getComputeContexts', () => {
  const contexts = [{ name: 'SAS Job Execution compute context' }]

  const target = new Target({
    name: 'test-target',
    serverUrl: 'https://sas.example.com',
    serverType: ServerType.SasViya,
    appLoc: '/Public/app',
    authConfig: {
      client: 'client',
      secret: 'secret',
      access_token: 't0k3n',
      refresh_token: 'r3fr3sh'
    }
  })

  const setup = () => {
    const contextsSpy = jest.fn().mockResolvedValue(contexts)

    const getSASjsSpy = jest
      .spyOn(configUtils, 'getSASjs')
      .mockReturnValue({ getComputeContexts: contextsSpy } as any)

    return { contextsSpy, getSASjsSpy }
  }

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('sends the insecure options with the request when insecure is true', async () => {
    const { contextsSpy, getSASjsSpy } = setup()

    await expect(
      getComputeContexts(target, TargetScope.Global, true)
    ).resolves.toEqual(contexts)

    const usedTarget = getSASjsSpy.mock.calls[0][0] as Target

    expect(usedTarget.httpsAgentOptions).toEqual(
      expect.objectContaining({
        allowInsecureRequests: true,
        rejectUnauthorized: false
      })
    )
    expect(contextsSpy).toHaveBeenCalledWith('t0k3n')
  })

  it('sends the target as it is when insecure is false', async () => {
    const { getSASjsSpy } = setup()

    await getComputeContexts(target, TargetScope.Global, false)

    expect(getSASjsSpy.mock.calls[0][0]).toBe(target)
    expect(target.httpsAgentOptions).toBeUndefined()
  })

  it('throws when a global target has no access token', async () => {
    setup()

    const targetWithoutToken = new Target({
      ...target.toJson(false),
      authConfig: { client: 'client', secret: 'secret' } as any
    })

    await expect(
      getComputeContexts(targetWithoutToken, TargetScope.Global, false)
    ).rejects.toThrow(/No access token available/)
  })
})

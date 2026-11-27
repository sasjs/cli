import path from 'path'
import os from 'os'
import {
  AuthConfig,
  ServerType,
  Target,
  createFile,
  deleteFile
} from '@sasjs/utils'
import * as configUtils from '../../../utils/config'
import { deployToSasViyaWithServicePack } from '../deployToSasViyaWithServicePack'

const target = new Target({
  name: 'test',
  appLoc: '/Public/test/',
  serverType: ServerType.SasViya,
  serverUrl: 'https://server.com',
  contextName: 'test context'
})

const mockAuthConfig: AuthConfig = {
  client: 'cl13nt',
  secret: '53cr3t',
  access_token: 'acc355',
  refresh_token: 'r3fr35h'
}

describe('deployToSasViyaWithServicePack', () => {
  let jsonFilePath: string
  let deployServicePack: jest.Mock

  beforeEach(async () => {
    jsonFilePath = path.join(os.tmpdir(), `servicepack-${Date.now()}.json`)
    await createFile(jsonFilePath, JSON.stringify({ members: [] }))

    deployServicePack = jest.fn().mockResolvedValue({})
    jest
      .spyOn(configUtils, 'getSASjs')
      .mockImplementation(() => ({ deployServicePack }) as any)
  })

  afterEach(async () => {
    await deleteFile(jsonFilePath)
    jest.restoreAllMocks()
  })

  it('refreshes and persists the access token via getAuthConfig instead of the non-persisting getAccessToken', async () => {
    const getAuthConfigSpy = jest
      .spyOn(configUtils, 'getAuthConfig')
      .mockImplementation(() => Promise.resolve(mockAuthConfig))

    await expect(
      deployToSasViyaWithServicePack(jsonFilePath, target, true, false)
    ).toResolve()

    expect(getAuthConfigSpy).toHaveBeenCalledWith(target)
    expect(deployServicePack).toHaveBeenCalledWith(
      { members: [] },
      undefined,
      undefined,
      mockAuthConfig.access_token,
      false,
      expect.any(Function)
    )
  })

  it('logs each member as the deploy writes it', async () => {
    // the deploy is silent between "Deploying service pack..." and its success
    // line unless the adapter's per-member reports are printed
    const info = jest.fn()
    ;(process as any).logger = { info }

    jest
      .spyOn(configUtils, 'getAuthConfig')
      .mockImplementation(() => Promise.resolve(mockAuthConfig))

    await deployToSasViyaWithServicePack(jsonFilePath, target, true, false)

    const report = deployServicePack.mock.calls[0][5]
    report({
      type: 'service',
      name: 'getdata',
      parentFolder: '/Public/test/services',
      index: 2,
      total: 5
    })

    expect(info).toHaveBeenCalledWith(
      'Creating service 2/5: getdata in /Public/test/services'
    )
  })

  it('surfaces the real auth/refresh error instead of a generic "add these variables" message when credentials already exist', async () => {
    const realError = new Error(
      'invalid_grant: refresh token has already been used'
    )
    jest.spyOn(configUtils, 'getAuthConfig').mockImplementation(() => {
      return Promise.reject(realError)
    })

    await expect(
      deployToSasViyaWithServicePack(jsonFilePath, target, true, false)
    ).rejects.toThrow(/invalid_grant: refresh token has already been used/)
  })
})

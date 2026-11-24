import path from 'path'
import { ServerType, Target, createFile, deleteFolder } from '@sasjs/utils'

import * as utilsModule from '../../../../utils/utils'
import { deployToSasjsWithServicePack } from '../deployToSASJSWithServicePack'

jest.mock('@sasjs/adapter/node', () => ({
  SASjsApiClient: jest.fn(),
  SasjsRequestClient: jest.fn()
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SASjsApiClient } = require('@sasjs/adapter/node')

/**
 * What a SASjs deploy reports.
 *
 * Two addresses are two facts: the entry page is the artefact the build wrote,
 * and the app the server published is the folder it indexed under `apps/`. The
 * second is read off the deploy ANSWER, so a publish the CLI did not ask for is
 * still named - which is the case a target with `mockWeb` (and anything else
 * that ships its own `sasjs.app.json`) lands in.
 */
describe('deployToSasjsWithServicePack output', () => {
  const folder = path.join(__dirname, 'sasjsbuild', 'deploy-published')
  const jsonFilePath = path.join(folder, 'target.json')

  const target = new Target({
    name: 'target',
    serverUrl: 'https://server.example',
    appLoc: '/Public/app/macrodash',
    serverType: ServerType.Sasjs
  })

  let deploy: jest.Mock
  let deployZipFile: jest.Mock

  const logged = () =>
    (process.logger?.info as jest.Mock).mock.calls.map(([message]) => message)

  beforeEach(async () => {
    process.logger = {
      info: jest.fn(),
      error: jest.fn(),
      success: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    } as any

    jest
      .spyOn(utilsModule, 'isSasJsServerInServerMode')
      .mockResolvedValue(false)

    deploy = jest.fn()
    deployZipFile = jest.fn()

    SASjsApiClient.mockImplementation(() => ({ deploy, deployZipFile }))

    await deleteFolder(folder)
    await createFile(jsonFilePath, JSON.stringify({ appLoc: target.appLoc }))
  })

  afterEach(async () => {
    await deleteFolder(folder)
  })

  it('names the published app after the entry page, for a streamed target', async () => {
    deploy.mockResolvedValue({
      status: 'success',
      message: 'Services deployed',
      app: { id: '0e6f1d2c', name: 'MacroDash', url: '/app/0e6f1d2c/' }
    })

    await deployToSasjsWithServicePack(jsonFilePath, target, {
      streamWeb: true,
      streamServiceName: 'MacroDash'
    } as any)

    expect(logged()).toEqual([
      `Web app is available at ${target.serverUrl}/StoredProgram?_FILE=${encodeURI(
        target.appLoc
      )}/MacroDash.html` +
        ' (needs sasjs/server v7.23.0 or later, the release that serves the /StoredProgram tier)',
      `App stream: ${target.serverUrl}/app/0e6f1d2c/`
    ])
  })

  it('names the published app even where the target did not ask for a stream', async () => {
    // a deploy publishes whatever its bundle says it is, so the address cannot
    // be decided by the target's own `streamWeb`
    deploy.mockResolvedValue({
      status: 'success',
      message: 'Services deployed',
      app: { id: '0e6f1d2c', name: 'MacroDash', url: '/app/0e6f1d2c/' }
    })

    await deployToSasjsWithServicePack(jsonFilePath, target, {
      mockWeb: true
    } as any)

    expect(logged()).toEqual([`App stream: ${target.serverUrl}/app/0e6f1d2c/`])
  })

  it('says nothing extra where the server published no app', async () => {
    deploy.mockResolvedValue({
      status: 'success',
      message: 'Services deployed'
    })

    await deployToSasjsWithServicePack(jsonFilePath, target, {
      mockWeb: true,
      streamServiceName: 'MacroDash'
    } as any)

    expect(logged()).toEqual([])
  })

  it('names the published app from a deploy that took the archive route', async () => {
    // the deploy sends `<target>.json.zip` whenever the build left one beside the
    // JSON, which every real build does - a spec that only writes the JSON never
    // reaches that branch
    await createFile(
      jsonFilePath + '.zip',
      JSON.stringify({ appLoc: target.appLoc })
    )

    deployZipFile.mockResolvedValue({
      status: 'success',
      message: 'Services deployed',
      app: { id: '0e6f1d2c', name: 'MacroDash', url: '/app/0e6f1d2c/' }
    })

    await deployToSasjsWithServicePack(jsonFilePath, target, {
      streamWeb: true,
      streamServiceName: 'MacroDash'
    } as any)

    expect(deployZipFile).toHaveBeenCalledTimes(1)
    expect(deploy).not.toHaveBeenCalled()
    expect(logged()).toContain(`App stream: ${target.serverUrl}/app/0e6f1d2c/`)
  })
})

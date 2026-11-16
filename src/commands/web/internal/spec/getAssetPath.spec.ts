import { ServerType } from '@sasjs/utils'
import { getAssetPath } from '../getAssetPath'

/**
 * The address one streamed asset is fetched from, per server type.
 *
 * Viya and SASjs server answer the same idea under different routes, and the
 * build bakes the address into the page - so a wrong route here is an app that
 * renders nothing, which is exactly the failure this pins.
 */
describe('getAssetPath', () => {
  beforeAll(() => {
    process.sasjsConstants = {
      ...process.sasjsConstants,
      sas9GUID: 'abc123'
    } as any
  })

  it('names the file at the build appLoc for SAS Viya', () => {
    expect(
      getAssetPath('/Public/app', ServerType.SasViya, 'web', 'main.js')
    ).toEqual('/SASJobExecution?_FILE=/Public/app/services/web/main.js')
  })

  it(`names the same file on SASjs server's own Drive API`, () => {
    expect(
      getAssetPath('/Public/app', ServerType.Sasjs, 'web', 'main.js')
    ).toEqual('/SASjsApi/drive/file?_FILE=/Public/app/services/web/main.js')
  })

  it('names the stored process for SAS 9, with the appLoc inserted at run time', () => {
    expect(
      getAssetPath('/Public/app', ServerType.Sas9, 'web', 'main-js')
    ).toEqual('/SASStoredProcess/?_PROGRAM=abc123/web/main-js')
  })
})

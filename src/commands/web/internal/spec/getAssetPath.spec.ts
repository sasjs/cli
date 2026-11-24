import { ServerType } from '@sasjs/utils'
import { getAssetPath, getAssetPrefix } from '../getAssetPath'

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
    ).toEqual('/SASJobExecution?_FILE=/Public/app/web/main.js')
  })

  it(`names the same file on SASjs server's own web tier`, () => {
    expect(
      getAssetPath('/Public/app', ServerType.Sasjs, 'web', 'main.js')
    ).toEqual('/StoredProgram?_FILE=/Public/app/web/main.js')
  })

  it('names the stored process for SAS 9, with the appLoc inserted at run time', () => {
    expect(
      getAssetPath('/Public/app', ServerType.Sas9, 'web', 'main-js')
    ).toEqual('/SASStoredProcess/?_PROGRAM=abc123/web/main-js')
  })

  it('answers the same prefix with a trailing slash for each server type', () => {
    // a runtime appends a chunk name it composes itself, so the prefix has to
    // end where a file name begins
    expect(getAssetPrefix('/Public/app', ServerType.SasViya, 'web')).toEqual(
      '/SASJobExecution?_FILE=/Public/app/web/'
    )
    expect(getAssetPrefix('/Public/app', ServerType.Sasjs, 'web')).toEqual(
      '/StoredProgram?_FILE=/Public/app/web/'
    )
    expect(getAssetPrefix('/Public/app', ServerType.Sas9, 'web')).toEqual(
      '/SASStoredProcess/?_PROGRAM=abc123/web/'
    )
  })
})

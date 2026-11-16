import { ServerType } from '@sasjs/utils'
import { getLaunchPageCode } from '../getLaunchPageCode'

/**
 * The address a streamed app reports when it is deployed.
 *
 * The code is SAS printed to the deploy log, and it is built from `&appLoc` at
 * run time - so what is pinned here is the route it names, which is what a
 * person copies into a browser.
 */
describe('getLaunchPageCode', () => {
  it('reports the job execution route for SAS Viya', () => {
    const code = getLaunchPageCode(ServerType.SasViya, 'clickme')

    expect(code).toContain('/SASJobExecution?_FILE=&appLoc/services/')
    expect(code).toContain("'clickme.html'")
  })

  it('reports the drive file route for SASjs server', () => {
    const code = getLaunchPageCode(ServerType.Sasjs, 'clickme')

    expect(code).toContain('/SASjsApi/drive/file?_FILE=&appLoc/services/')
    expect(code).toContain("'clickme.html'")
  })

  it('reports the stored process route for SAS 9', () => {
    const code = getLaunchPageCode(ServerType.Sas9, 'clickme')

    expect(code).toContain('?_program=&appLoc/services/clickme')
  })
})

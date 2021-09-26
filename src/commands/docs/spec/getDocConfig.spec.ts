import { Configuration, Target } from '@sasjs/utils'
import { Constants } from '../../../constants'
import { setConstants } from '../../../utils'
import { getDocConfig } from '../internal/getDocConfig'

const UNCErrorMessage = `UNC paths are not supported.
Please map to a network drive, or migrate the project to an existing path (with a drive letter).`

describe('getDocConfig', () => {
  let sasjsConstants: Constants

  beforeAll(() => {
    ;({ sasjsConstants } = process)
    process.sasjsConstants = {} as Constants
  })

  afterAll(() => {
    process.sasjsConstants = sasjsConstants
  })

  it('should throw for having UNC path picked up from target', () => {
    const target = {
      docConfig: { doxyContent: { path: '//server1/unc/path' } }
    } as unknown as Target

    expect(() => getDocConfig(target)).toThrowError(UNCErrorMessage)
  })

  it('should throw for having UNC path picked up from config', () => {
    const config = {
      docConfig: { doxyContent: { path: '//server1/unc/path' } }
    } as unknown as Configuration

    expect(() => getDocConfig(undefined, config)).toThrowError(UNCErrorMessage)
  })
})

import { Target } from '@sasjs/utils'
import { getContextName } from '../execute'

describe('getContextName', () => {
  it('should return the context name if specified in the target', () => {
    const target = { contextName: 'Test Context' }

    expect(getContextName(target as Target)).toEqual('Test Context')
  })

  it('should return the default context if context name is not specified', () => {
    const target = { contextName: undefined }

    expect(getContextName(target as unknown as Target)).toEqual(
      'SAS Job Execution compute context'
    )
  })
})

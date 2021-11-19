import { Target } from '@sasjs/utils'
import { contextName } from '../../../utils'
import { getContextName } from '../internal/execute'

describe('getContextName', () => {
  it('should return the context name if specified in the target', async () => {
    const target = { contextName: 'Test Context' }

    expect(getContextName(target as Target)).toEqual('Test Context')
  })

  it('should return the default context if context name is not specified', async () => {
    const target = { contextName: undefined }

    expect(getContextName(target as unknown as Target)).toEqual(contextName)
  })
})

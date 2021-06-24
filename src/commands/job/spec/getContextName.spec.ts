import { Target } from '@sasjs/utils'
import { getContextName } from '../execute'
import { getConstants } from '../../../constants'

describe('getContextName', () => {
  it('should return the context name if specified in the target', () => {
    const target = { contextName: 'Test Context' }

    expect(getContextName(target as Target)).toEqual('Test Context')
  })

  it('should return the default context if context name is not specified', async () => {
    const target = { contextName: undefined }

    expect(getContextName(target as unknown as Target)).toEqual(
      (await getConstants()).contextName
    )
  })
})

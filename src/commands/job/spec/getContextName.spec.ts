import { Target } from '@sasjs/utils'
import { setConstants } from '../../../utils'
import { getContextName } from '../internal/execute'

describe('getContextName', () => {
  beforeAll(async () => {
    await setConstants()
  })
  it('should return the context name if specified in the target', async () => {
    const target = { contextName: 'Test Context' }

    expect(await getContextName(target as Target)).toEqual('Test Context')
  })

  it('should return the default context if context name is not specified', async () => {
    const target = { contextName: undefined }

    expect(await getContextName(target as unknown as Target)).toEqual(
      process.sasjsConstants.contextName
    )
  })
})

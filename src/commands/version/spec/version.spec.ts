import { printVersion } from '../version'

describe('printVersion', () => {
  it('should return sasjs version', async () => {
    await expect(printVersion()).toResolve()
  })
})

import { printVersion } from '../version'

describe('printVersion', () => {
  it('should return sasjs version', async () => {
    await expect(printVersion()).resolves.toMatch(
      /^You are using a linked version of SASjs CLI running from sources at 1\.0\.0/
    )
  })
})

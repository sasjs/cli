import { buildServices, compileServices } from '../../../main'
import { createTestApp, removeTestApp } from '../../../utils/test'
import { generateTimestamp } from '../../../utils/utils'

describe('sasjs build', () => {
  let appName: string

  afterEach(async () => {
    await removeTestApp(__dirname, appName)
  })

  it(
    `should build with minimal template`,
    async () => {
      appName = `test-app-build-minimal-${generateTimestamp()}`
      await createTestApp(__dirname, appName)

      await expect(buildServices(`build`)).resolves.toEqual(true)
    },
    2 * 60 * 1000
  )

  it(
    `should compile and build(skipping compile)`,
    async () => {
      appName = `test-app-build-${generateTimestamp()}`

      await createTestApp(__dirname, appName)

      await compileServices(`compile`)
      await expect(buildServices(`build`)).resolves.toEqual(true)
    },
    2 * 60 * 1000
  )
})

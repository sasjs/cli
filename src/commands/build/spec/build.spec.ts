import { createTestApp, removeTestApp } from '../../../utils/test'
import { Logger, LogLevel, generateTimestamp } from '@sasjs/utils'
import { findTargetInConfiguration } from '../../../utils'
import { build } from '../build'
import { compile } from '../..'

describe('sasjs build', () => {
  let appName: string

  beforeAll(() => {
    process.logger = new Logger(LogLevel.Off)
  })

  afterEach(async () => {
    await removeTestApp(__dirname, appName)
  })

  it(
    `should build with minimal template`,
    async () => {
      appName = `test-app-build-minimal-${generateTimestamp()}`
      await createTestApp(__dirname, appName)
      const target = (await findTargetInConfiguration('viya')).target

      await expect(build(target)).toResolve()
    },
    2 * 60 * 1000
  )

  it(
    `should compile and build(skipping compile)`,
    async () => {
      appName = `test-app-build-${generateTimestamp()}`

      await createTestApp(__dirname, appName)
      const target = (await findTargetInConfiguration('viya')).target

      await compile(target)
      await expect(build(target)).toResolve()
    },
    2 * 60 * 1000
  )
})

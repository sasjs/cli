import { buildServices, compileServices } from '../../../main'
import { Command } from '../../../utils/command'
import { createTestApp, removeTestApp } from '../../../utils/test'
import { generateTimestamp } from '../../../utils/utils'
import { Logger, LogLevel } from '@sasjs/utils/logger'

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

      await expect(buildServices(new Command(`build`))).toResolve()
    },
    2 * 60 * 1000
  )

  it(
    `should compile and build(skipping compile)`,
    async () => {
      appName = `test-app-build-${generateTimestamp()}`

      await createTestApp(__dirname, appName)

      await compileServices(new Command(`compile`))
      await expect(buildServices(new Command(`build`))).toResolve()
    },
    2 * 60 * 1000
  )
})

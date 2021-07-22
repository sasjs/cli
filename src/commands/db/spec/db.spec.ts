import path from 'path'
import { createTestApp, removeTestApp, verifyStep } from '../../../utils/test'
import { generateTimestamp } from '@sasjs/utils'
import { buildDB } from '../db'

describe(`sasjs db`, () => {
  const timestamp = generateTimestamp()
  const appName = `test-app-DB-${timestamp}`

  beforeAll(async () => {
    await createTestApp(__dirname, appName)
  })

  afterAll(async () => {
    await removeTestApp(__dirname, appName)
  })

  it(`should create db folder`, async () => {
    await expect(buildDB()).toResolve()

    await verifyStep('db')
  })
})

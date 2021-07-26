import path from 'path'
import { createTestApp, removeTestApp, verifyStep } from '../../../utils/test'
import { deleteFolder, generateTimestamp } from '@sasjs/utils'
import { buildDB } from '../db'

describe(`sasjs db`, () => {
  let appName: string

  beforeEach(async () => {
    const timestamp = generateTimestamp()
    appName = `test-app-DB-${timestamp}`
    await createTestApp(__dirname, appName)
  })

  afterEach(async () => {
    await removeTestApp(__dirname, appName)
  })

  it(`should create db folder`, async () => {
    await expect(buildDB()).toResolve()

    await verifyStep('db')
  })

  it(`should throw an error when the db folder does not exist`, async () => {
    await deleteFolder(path.join(__dirname, appName, 'sasjs', 'db'))

    await expect(buildDB()).rejects.toThrow('no such file or directory')
  })
})

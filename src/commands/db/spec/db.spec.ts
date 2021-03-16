import path from 'path'
import { createTestApp, removeTestApp, verifyStep } from '../../../utils/test'
import { generateTimestamp } from '../../../utils/utils'
import { buildDB } from '../db'

describe(`sasjs db`, () => {
  const timestamp = generateTimestamp()
  const appName = `test-app-DB-${timestamp}`

  beforeAll(async (done) => {
    await createTestApp(__dirname, appName)
    done()
  })

  afterAll(async (done) => {
    await removeTestApp(__dirname, appName)
    done()
  })

  it(`should create db folder`, async (done) => {
    await expect(buildDB()).toResolve()

    await verifyStep('db')

    done()
  })

  it(`should throw an error when the db folder does not exist`, async (done) => {
    const timestamp = generateTimestamp()
    const parentFolderNameTimeStamped = `test-app-DB-${timestamp}`

    process.projectDir = path.join(__dirname, parentFolderNameTimeStamped)

    await expect(buildDB()).rejects.toThrow('no such file or directory')

    await removeTestApp(__dirname, parentFolderNameTimeStamped)

    done()
  })
})

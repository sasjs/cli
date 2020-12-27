import dotenv from 'dotenv'
import path from 'path'
import { createFolder, deleteFolder } from '../../../utils/file'
import { verifyStep } from '../../../utils/test'
import { generateTimestamp } from '../../../utils/utils'
import { create } from '../../create/create'
import { buildDB } from '../db'

describe('sasjs db', () => {
  beforeAll(async () => {
    dotenv.config()
  }, 60 * 1000)

  describe(`sasjs db`, () => {
    it(`should create db folder`, async (done) => {
      const timestamp = generateTimestamp()
      const appName = `test-app-DB-${timestamp}`

      process.projectDir = path.join(__dirname, appName)

      await createFolder(process.projectDir)

      await expect(create('.', '')).toResolve()
      await expect(buildDB()).toResolve()

      await verifyStep({ parentFolderName: '.', step: 'db', targetName: '' })

      done()
    })

    it(`should throw an error when the db folder does not exist`, async (done) => {
      const timestamp = generateTimestamp()
      const parentFolderNameTimeStamped = `test-app-DB-${timestamp}`

      process.projectDir = path.join(__dirname, parentFolderNameTimeStamped)

      await expect(buildDB()).rejects.toThrow('no such file or directory')

      done()
    })
  })

  afterAll(async () => {
    await deleteFolder(path.join(__dirname, './test-app-DB-*'))
  }, 60 * 1000)
})

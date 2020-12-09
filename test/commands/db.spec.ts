import dotenv from 'dotenv'
import path from 'path'
import { createFileStructure, buildDBs } from '../../src/main'
import { createFolder, deleteFolder } from '../../src/utils/file-utils'
import { generateTimestamp } from '../../src/utils/utils'

describe('sasjs db', () => {
  beforeAll(async () => {
    dotenv.config()
  }, 60 * 1000)

  describe(`Create new app in test-app-DB-timestamps`, () => {
    it(
      `should create db folder`,
      async () => {
        const timestamp = generateTimestamp()
        const parentFolderNameTimeStamped = `test-app-DB-${timestamp}`

        process.projectDir = path.join(
          process.cwd(),
          parentFolderNameTimeStamped
        )

        await createFolder(process.projectDir)

        await expect(createFileStructure('.')).resolves.toEqual(true)
        await expect(buildDBs()).resolves.toEqual(true)

        await verifyStep({ parentFolderName: '.', step: 'db' })
      },
      60 * 1000
    )

    it(
      `should not populate db folder was not already setup`,
      async () => {
        const timestamp = generateTimestamp()
        const parentFolderNameTimeStamped = `test-app-DB-${timestamp}`

        process.projectDir = path.join(
          process.cwd(),
          parentFolderNameTimeStamped
        )
        await expect(buildDBs()).resolves.not.toEqual(true)
      },
      60 * 1000
    )
  })

  afterAll(async () => {
    await deleteFolder('./test-app-DB-*')
  }, 60 * 1000)
})

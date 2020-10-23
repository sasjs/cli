import dotenv from 'dotenv'
import path from 'path'

import { createFileStructure, buildDBs } from '../../../src/main'
import { createFolder, deleteFolder } from '../../../src/utils/file-utils'

describe('sasjs db', () => {
  const testingAppFolder = 'testing-apps'
  beforeAll(() => {
    process.projectDir = path.join(process.cwd(), testingAppFolder)
    dotenv.config()
  })

  beforeEach(async () => {
    const projectDirPath = path.join(process.projectDir)
    await deleteFolder(projectDirPath)
    await createFolder(projectDirPath)
  }, 60 * 1000)

  describe(`Create new app in ${testingAppFolder}`, () => {
    it(
      `should create db folder`,
      async () => {
        await expect(createFileStructure('.', undefined)).resolves.toEqual(true)
        await expect(buildDBs()).resolves.toEqual(true)

        await verifyDB({ parentFolderName: '.' })
      },
      60 * 1000
    )
    it(
      `fails to populate if app is not setup already db folder`,
      async () => {
        await expect(buildDBs()).resolves.not.toEqual(true)
      },
      60 * 1000
    )
  })
})

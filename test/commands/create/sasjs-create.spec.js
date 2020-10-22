import dotenv from 'dotenv'
import path from 'path'

import { createFileStructure } from '../../../src/main'
import { createFolder, deleteFolder } from '../../../src/utils/file-utils'
import { generateTimestamp } from '../../../src/utils/utils'

describe('sasjs create', () => {
  const timestamp = generateTimestamp()
  const testingAppFolder = 'testing-apps'
  const parentFolderNameTimeStamped = `test-app-${timestamp}`
  beforeAll(() => {
    process.projectDir = path.join(process.cwd(), testingAppFolder)
    dotenv.config()
  })

  beforeEach(async (done) => {
    const projectDirPath = path.join(process.projectDir)
    await deleteFolder(projectDirPath)
    await createFolder(projectDirPath)
    done()
  })

  describe(`.`, () => {
    it(
      `should setup in ${testingAppFolder}/ .`,
      async () => {
        await expect(
          createFileStructure(undefined, undefined)
        ).resolves.toEqual(true)
        await verifyCreate({ parentFolderName: '.' })
      },
      60 * 1000
    )
    it(
      `should setup in ${testingAppFolder}/ .`,
      async () => {
        await expect(createFileStructure('.', undefined)).resolves.toEqual(true)
        await verifyCreate({ parentFolderName: '.' })
      },
      60 * 1000
    )
    it(
      `should setup in . (${testingAppFolder}) having apptype 'sasonly'`,
      async () => {
        await expect(createFileStructure('.', 'sasonly')).resolves.toEqual(true)
        await verifyCreate({ parentFolderName: '.', sasonly: true })
      },
      60 * 1000
    )
    it(
      `should setup in . (${testingAppFolder}) having apptype 'react'`,
      async () => {
        await expect(createFileStructure(undefined, 'react')).resolves.toEqual(
          true
        )
        await verifyCreateWeb({ parentFolderName: '.', appType: 'react' })
      },
      60 * 1000
    )
  })
  describe(`${parentFolderNameTimeStamped}`, () => {
    it(
      `should create new folder ${testingAppFolder}/${parentFolderNameTimeStamped}/`,
      async () => {
        await expect(
          createFileStructure(`${parentFolderNameTimeStamped}`, undefined)
        ).resolves.toEqual(true)
        await verifyCreate({ parentFolderName: parentFolderNameTimeStamped })
      },
      60 * 1000
    )
    it(
      `should create new folder ${testingAppFolder}/${parentFolderNameTimeStamped}/ having apptype 'minimal'`,
      async () => {
        await expect(
          createFileStructure(`${parentFolderNameTimeStamped}`, 'minimal')
        ).resolves.toEqual(true)
        await verifyCreateWeb({
          parentFolderName: parentFolderNameTimeStamped,
          appType: 'minimal'
        })
      },
      60 * 1000
    )
    it(
      `should create new folder ${testingAppFolder}/${parentFolderNameTimeStamped}/ having apptype 'angular'`,
      async () => {
        await expect(
          createFileStructure(`${parentFolderNameTimeStamped}`, 'angular')
        ).resolves.toEqual(true)
        await verifyCreateWeb({
          parentFolderName: parentFolderNameTimeStamped,
          appType: 'angular'
        })
      },
      60 * 1000
    )
  })
})

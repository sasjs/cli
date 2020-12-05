import dotenv from 'dotenv'
import path from 'path'
import rimraf from 'rimraf'
import { createFileStructure } from '../../src/main'
import { createFolder } from '../../src/utils/file-utils'
import { generateTimestamp } from '../../src/utils/utils'

describe('sasjs create', () => {
  beforeAll(() => {
    dotenv.config()
  })

  describe(`.`, () => {
    it(
      'should setup in .',
      async () => {
        const timestamp = generateTimestamp()
        const parentFolderNameTimeStamped = `test-app-create-.-${timestamp}-undefined`

        process.projectDir = path.join(
          process.cwd(),
          parentFolderNameTimeStamped
        )

        await createFolder(process.projectDir)

        await expect(createFileStructure('sasjs create')).resolves.toEqual(true)

        await verifyCreate({ parentFolderName: '.' })
      },
      60 * 1000
    )

    it(
      'should setup in current folder',
      async () => {
        const timestamp = generateTimestamp()
        const parentFolderNameTimeStamped = `test-app-create-.-${timestamp}-.`

        process.projectDir = path.join(
          process.cwd(),
          parentFolderNameTimeStamped
        )

        await createFolder(process.projectDir)

        await expect(createFileStructure('sasjs create .')).resolves.toEqual(
          true
        )

        await verifyCreate({ parentFolderName: '.' })
      },
      60 * 1000
    )

    it(
      `should setup in current folder having apptype 'sasonly'`,
      async () => {
        const timestamp = generateTimestamp()
        const parentFolderNameTimeStamped = `test-app-create-.-${timestamp}-sasonly`

        process.projectDir = path.join(
          process.cwd(),
          parentFolderNameTimeStamped
        )

        await createFolder(process.projectDir)

        await expect(
          createFileStructure('sasjs create . -t sasonly')
        ).resolves.toEqual(true)

        await verifyCreate({ parentFolderName: '.', sasonly: true })
      },
      60 * 1000
    )

    it(
      `should setup in current folder having apptype 'react'`,
      async () => {
        const timestamp = generateTimestamp()
        const parentFolderNameTimeStamped = `test-app-create-.-${timestamp}-react`

        process.projectDir = path.join(
          process.cwd(),
          parentFolderNameTimeStamped
        )

        await createFolder(process.projectDir)

        await expect(createFileStructure('create -t react')).resolves.toEqual(
          true
        )

        await verifyCreateWeb({ parentFolderName: '.', appType: 'react' })
      },
      120 * 1000
    )
  })

  describe('test-app-timestamp', () => {
    it(
      `should create new folder 'test-app-.-timestamp'`,
      async () => {
        const timestamp = generateTimestamp()
        const parentFolderNameTimeStamped = `test-app-create-${timestamp}`

        process.projectDir = path.join(
          process.cwd(),
          parentFolderNameTimeStamped
        )

        await createFolder(process.projectDir)

        await expect(
          createFileStructure(`create ${parentFolderNameTimeStamped}`)
        ).resolves.toEqual(true)

        await verifyCreate({ parentFolderName: parentFolderNameTimeStamped })
      },
      60 * 1000
    )

    it(
      `should create new folder 'test-app-timestamp-minimal' having apptype 'minimal'`,
      async () => {
        const timestamp = generateTimestamp()
        const parentFolderNameTimeStamped = `test-app-create-${timestamp}-minimal`

        process.projectDir = path.join(
          process.cwd(),
          parentFolderNameTimeStamped
        )

        await createFolder(process.projectDir)

        await expect(
          createFileStructure(
            `create ${parentFolderNameTimeStamped} --template minimal`
          )
        ).resolves.toEqual(true)

        await verifyCreateWeb({
          parentFolderName: parentFolderNameTimeStamped,
          appType: 'minimal'
        })
      },
      2 * 60 * 1000
    )

    it(
      `should create new folder 'test-app-timestamp-angular' having apptype 'angular'`,
      async () => {
        const timestamp = generateTimestamp()
        const parentFolderNameTimeStamped = `test-app-create-${timestamp}-angular`

        process.projectDir = path.join(
          process.cwd(),
          parentFolderNameTimeStamped
        )

        await createFolder(process.projectDir)

        await expect(
          createFileStructure(
            `create ${parentFolderNameTimeStamped} -t angular`
          )
        ).resolves.toEqual(true)

        await verifyCreateWeb({
          parentFolderName: parentFolderNameTimeStamped,
          appType: 'angular'
        })
      },
      4 * 60 * 1000
    )
  })

  afterAll(async () => {
    rimraf.sync('./test-app-create-*')
  }, 60 * 1000)
})

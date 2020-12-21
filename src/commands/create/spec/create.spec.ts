import dotenv from 'dotenv'
import path from 'path'
import { createFileStructure } from '../../../main'
import { verifyFolderStructure } from '../../../utils/test'
import { createFolder, deleteFolder, fileExists } from '../../../utils/file'
import { asyncForEach, generateTimestamp } from '../../../utils/utils'
import { getFolders } from '../../../utils/config-utils'
import fileStructureMinimalObj from './files-minimal-app.json'
import fileStructureReactObj from './files-react-app.json'
import fileStructureAngularrObj from './files-angular-app.json'

describe('sasjs create', () => {
  beforeAll(() => {
    dotenv.config()
  })

  describe(`.`, () => {
    it(
      'should setup in .',
      async () => {
        const timestamp = generateTimestamp()
        const appName = `test-app-create-.-${timestamp}-undefined`

        process.projectDir = path.join(__dirname, appName)

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
        const appName = `test-app-create-.-${timestamp}-.`

        process.projectDir = path.join(__dirname, appName)

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
        const appName = `test-app-create-.-${timestamp}-sasonly`

        process.projectDir = path.join(__dirname, appName)

        await createFolder(process.projectDir)

        await expect(
          createFileStructure('sasjs create . -t sasonly')
        ).resolves.toEqual(true)

        await verifyCreate({ parentFolderName: '.' })
      },
      60 * 1000
    )

    it(
      `should setup in current folder having apptype 'react'`,
      async () => {
        const timestamp = generateTimestamp()
        const appName = `test-app-create-.-${timestamp}-react`

        process.projectDir = path.join(__dirname, appName)

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
        const appName = `test-app-create-${timestamp}`

        process.projectDir = path.join(__dirname, appName)

        await createFolder(process.projectDir)

        await expect(createFileStructure(`create ${appName}`)).resolves.toEqual(
          true
        )

        await verifyCreate({ parentFolderName: appName })
      },
      60 * 1000
    )

    it(
      `should create new folder 'test-app-timestamp-minimal' having apptype 'minimal'`,
      async () => {
        const timestamp = generateTimestamp()
        const appName = `test-app-create-${timestamp}-minimal`

        process.projectDir = path.join(__dirname, appName)

        await createFolder(process.projectDir)

        await expect(
          createFileStructure(`create ${appName} --template minimal`)
        ).resolves.toEqual(true)

        await verifyCreateWeb({
          parentFolderName: appName,
          appType: 'minimal'
        })
      },
      2 * 60 * 1000
    )

    it(
      `should create new folder 'test-app-timestamp-angular' having apptype 'angular'`,
      async () => {
        const timestamp = generateTimestamp()
        const appName = `test-app-create-${timestamp}-angular`

        process.projectDir = path.join(__dirname, appName)

        await createFolder(process.projectDir)

        await expect(
          createFileStructure(`create ${appName} -t angular`)
        ).resolves.toEqual(true)

        await verifyCreateWeb({
          parentFolderName: appName,
          appType: 'angular'
        })
      },
      4 * 60 * 1000
    )

    it(
      `should fail having unknown apptype 'xyz'`,
      async () => {
        const timestamp = generateTimestamp()
        const appName = `test-app-create-${timestamp}-xyz`

        process.projectDir = path.join(__dirname, appName)

        await createFolder(process.projectDir)

        await expect(
          createFileStructure(`create ${appName} --template xyz`)
        ).resolves.toEqual('Template "xyz" is not sasjs template')
      },
      2 * 60 * 1000
    )
  })

  afterAll(async () => {
    await deleteFolder(path.join(__dirname, 'test-app-create-*'))
  }, 60 * 1000)
})

const verifyCreateWeb = async (params: {
  parentFolderName: string
  appType: string
}) => {
  const { parentFolderName, appType } = params
  let everythingPresent = true
  const fileStructure =
    appType === 'minimal'
      ? fileStructureMinimalObj
      : appType === 'react'
      ? fileStructureReactObj
      : appType === 'angular'
      ? fileStructureAngularrObj
      : null

  const fileStructureClone = JSON.parse(JSON.stringify(fileStructure))

  await asyncForEach(fileStructureClone.files, async (file) => {
    const filePath = path.join(
      process.projectDir,
      parentFolderName,
      file.fileName
    )
    everythingPresent = everythingPresent && (await fileExists(filePath))
  })
  if (everythingPresent) {
    await asyncForEach(fileStructureClone.subFolders, async (folder) => {
      everythingPresent =
        everythingPresent &&
        (await verifyFolderStructure(folder, parentFolderName))
    })
  }
  expect(everythingPresent).toEqual(true)
}

const verifyCreate = async (params: { parentFolderName: string }) => {
  const { parentFolderName } = params
  const fileStructure = await getFolders()
  let everythingPresent = false
  await asyncForEach(fileStructure, async (folder, index) => {
    everythingPresent = await verifyFolderStructure(folder, parentFolderName)
    if (everythingPresent && index === 0) {
      const configDestinationPath = path.join(
        process.projectDir,
        parentFolderName,
        folder.folderName,
        'sasjsconfig.json'
      )
      const configPresent = await fileExists(configDestinationPath)
      expect(configPresent).toEqual(true)
    }
  })
  expect(everythingPresent).toEqual(true)
}

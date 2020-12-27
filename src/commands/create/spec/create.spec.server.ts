import dotenv from 'dotenv'
import path from 'path'
import { verifyFolderStructure } from '../../../utils/test'
import { createFolder, deleteFolder, fileExists } from '../../../utils/file'
import { asyncForEach, generateTimestamp } from '../../../utils/utils'
import { getFolders } from '../../../utils/config'
import fileStructureMinimalObj from './files-minimal-app.json'
import fileStructureReactObj from './files-react-app.json'
import fileStructureAngularrObj from './files-angular-app.json'
import { create } from '../create'

describe('sasjs create', () => {
  beforeAll(() => {
    dotenv.config()
  })

  afterEach(async (done) => {
    await deleteFolder(path.join(__dirname, 'test-app-create-*'))
    done()
  })

  it('should set up a default app in the current folder', async (done) => {
    const appName = `test-app-create-.-${generateTimestamp()}`

    process.projectDir = path.join(__dirname, appName)

    await createFolder(process.projectDir)

    await expect(create('.', '')).toResolve()

    await verifyCreate('.', '')
    done()
  })

  it(`should set up a 'sasonly' app in the current folder`, async (done) => {
    const appName = `test-app-create-.-${generateTimestamp()}-sasonly`

    process.projectDir = path.join(__dirname, appName)

    await createFolder(process.projectDir)

    await expect(create('.', 'sasonly')).toResolve()

    await verifyCreate('.', 'sasonly')
    done()
  })

  it(`should set up a react app in the current folder`, async (done) => {
    const timestamp = generateTimestamp()
    const appName = `test-app-create-.-${timestamp}-react`

    process.projectDir = path.join(__dirname, appName)

    await createFolder(process.projectDir)

    await expect(create('.', 'react')).toResolve()

    await verifyCreateWeb('.', 'react')
    done()
  })

  it(`should set up a react app in a given folder`, async (done) => {
    const timestamp = generateTimestamp()
    const appName = `test-app-create-.-${timestamp}-react`

    process.projectDir = path.join(__dirname, appName)

    await createFolder(process.projectDir)

    await expect(create('test-react-app', 'react')).toResolve()

    await verifyCreateWeb('test-react-app', 'react')
    done()
  })

  it(`should set up a minimal app in a given folder`, async (done) => {
    const timestamp = generateTimestamp()
    const appName = `test-app-create-${timestamp}-minimal`

    process.projectDir = path.join(__dirname, appName)

    await createFolder(process.projectDir)

    await expect(create('test-minimal-app', 'minimal')).toResolve()

    await verifyCreateWeb('test-minimal-app', 'minimal')
    done()
  })

  it(`should set up an angular app in a given folder`, async (done) => {
    const timestamp = generateTimestamp()
    const appName = `test-app-create-${timestamp}-angular`

    process.projectDir = path.join(__dirname, appName)

    await createFolder(process.projectDir)

    await expect(create('test-angular-app', 'angular')).toResolve()

    await verifyCreateWeb('test-angular-app', 'angular')
    done()
  })

  it(`should fail with an unknown app type 'xyz'`, async (done) => {
    const timestamp = generateTimestamp()
    const appName = `test-app-create-${timestamp}-xyz`

    process.projectDir = path.join(__dirname, appName)

    await createFolder(process.projectDir)

    await expect(create('test-unknown-app', 'xyz')).rejects.toThrow(
      'Template "xyz" is not a SASjs template'
    )

    done()
  })
})

const verifyCreateWeb = async (parentFolderName: string, appType: string) => {
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

const verifyCreate = async (parentFolderName: string, appType: string) => {
  let fileStructure
  if (appType === 'sasonly') {
    fileStructure = [
      {
        folderName: 'sasjs',
        files: [],
        subFolders: []
      }
    ]
  } else {
    fileStructure = await getFolders()
  }
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
    } else {
      console.log(`No present`, folder, parentFolderName)
    }
  })
  expect(everythingPresent).toEqual(true)
}

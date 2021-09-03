import dotenv from 'dotenv'
import path from 'path'
import { verifyFolder, verifyPackageJsonContent } from '../../../utils/test'
import { createFolder, deleteFolder, generateTimestamp } from '@sasjs/utils'
import { getFolders } from '../../../utils/config'
import { minimalAppFiles } from './minimalAppFiles'
import { reactAppFiles } from './reactAppFiles'
import { angularAppFiles } from './angularAppFiles'
import { create } from '../create'
import { Folder } from '../../../types'
import { setConstants } from '../../../utils'

describe('sasjs create', () => {
  beforeAll(() => {
    dotenv.config()
  })

  afterEach(async () => {
    await deleteFolder(path.join(__dirname, 'test-app-create-*'))
  })

  it('should set up a default app in the current folder', async () => {
    const appName = `test-app-create-.-${generateTimestamp()}`

    process.projectDir = path.join(__dirname, appName)
    await setConstants()

    await createFolder(process.projectDir)

    await expect(create('.', '')).toResolve()

    await verifyCreate('.', '')
  })

  it(`should set up a 'sasonly' app in the current folder`, async () => {
    const appName = `test-app-create-.-${generateTimestamp()}-sasonly`

    process.projectDir = path.join(__dirname, appName)
    await setConstants()

    await createFolder(process.projectDir)

    await expect(create('.', 'sasonly')).toResolve()

    await verifyCreate('.', 'sasonly')
  })

  it(`should set up a react app in the current folder`, async () => {
    const timestamp = generateTimestamp()
    const appName = `test-app-create-.-${timestamp}-react`

    process.projectDir = path.join(__dirname, appName)
    await setConstants()

    await createFolder(process.projectDir)

    await expect(create('.', 'react')).toResolve()

    await verifyCreateWeb('.', 'react')
  })

  it(`should set up a react app in a given folder`, async () => {
    const timestamp = generateTimestamp()
    const appName = `test-app-create-.-${timestamp}-react`

    process.projectDir = path.join(__dirname, appName)
    await setConstants()

    await createFolder(process.projectDir)

    await expect(create('test-react-app', 'react')).toResolve()

    await verifyCreateWeb('test-react-app', 'react')
  })

  it(`should set up a minimal app in a given folder`, async () => {
    const timestamp = generateTimestamp()
    const appName = `test-app-create-${timestamp}-minimal`

    process.projectDir = path.join(__dirname, appName)
    await setConstants()

    await createFolder(process.projectDir)

    await expect(create('test-minimal-app', 'minimal')).toResolve()

    await verifyCreateWeb('test-minimal-app', 'minimal')
  })

  it(`should set up an angular app in a given folder`, async () => {
    const timestamp = generateTimestamp()
    const appName = `test-app-create-${timestamp}-angular`

    process.projectDir = path.join(__dirname, appName)
    await setConstants()

    await createFolder(process.projectDir)

    await expect(create('test-angular-app', 'angular')).toResolve()

    await verifyCreateWeb('test-angular-app', 'angular')
  })

  it(`should fail with an unknown app type 'xyz'`, async () => {
    const timestamp = generateTimestamp()
    const appName = `test-app-create-${timestamp}-xyz`

    process.projectDir = path.join(__dirname, appName)
    await setConstants()

    await createFolder(process.projectDir)

    await expect(create('test-unknown-app', 'xyz')).rejects.toThrow(
      'Template "xyz" is not a SASjs template'
    )
  })
})

const verifyCreateWeb = async (appName: string, appType: string) => {
  const fileStructure: Folder =
    appType === 'minimal'
      ? minimalAppFiles
      : appType === 'react'
      ? reactAppFiles
      : appType === 'angular'
      ? angularAppFiles
      : minimalAppFiles
  fileStructure.folderName = appName

  await verifyFolder(fileStructure)
  await verifyPackageJsonContent(appName)
}

const verifyCreate = async (parentFolderName: string, appType: string) => {
  let fileStructure
  if (appType === 'sasonly') {
    fileStructure = {
      folderName: parentFolderName,
      files: [{ fileName: 'README.md' }],
      subFolders: [
        {
          folderName: 'sasjs',
          files: [],
          subFolders: []
        }
      ]
    }
  } else {
    fileStructure = (await getFolders())[0]
    fileStructure = {
      folderName: parentFolderName,
      subFolders: fileStructure,
      files: [{ fileName: 'README.md' }]
    }
  }
  await verifyFolder(fileStructure)
  await verifyPackageJsonContent(parentFolderName)
}

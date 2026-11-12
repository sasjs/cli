import dotenv from 'dotenv'
import path from 'path'
import {
  generateUniqueTimestamp,
  getTemplateFileTree,
  verifyFolder,
  verifyPackageJsonContent,
  verifyGitNotPresent,
  stubNpm,
  npmCommands
} from '../../../utils/test'
import { createFolder, deleteFolder, fileExists } from '@sasjs/utils'
import { getFolders } from '../../../utils/config'
import { create } from '../create'
import { Folder } from '../../../types'
import { setConstants } from '../../../utils'
import { seedAppUrls } from '../../../utils/utils'

describe('sasjs create', () => {
  beforeAll(() => {
    dotenv.config()
  })

  beforeEach(() => {
    stubNpm()
  })

  afterEach(async () => {
    // deleteFolder() takes a literal path, not a glob - 'test-app-create-*' never
    // matches anything on disk, silently leaving every test's real (timestamped)
    // folder behind. Delete the actual folder each test just created instead.
    if (process.projectDir) await deleteFolder(process.projectDir)
  })

  it('should set up a default app in the current folder', async () => {
    const appName = `test-app-create-.-${generateUniqueTimestamp()}`

    process.projectDir = path.join(__dirname, appName)
    await setConstants()

    await createFolder(process.projectDir)

    await expect(create('.', '')).toResolve()

    await verifyCreate('.', '')

    // verifyCreate's package.json assertion is only meaningful if create asked
    // npm to add the dependency - the stub writes what that command writes.
    expect(npmCommands).toContain('npm i @sasjs/core --save')
  })

  it(`should set up a 'sasonly' app in the current folder`, async () => {
    const appName = `test-app-create-.-${generateUniqueTimestamp()}-sasonly`

    process.projectDir = path.join(__dirname, appName)
    await setConstants()

    await createFolder(process.projectDir)

    await expect(create('.', 'sasonly')).toResolve()

    await verifyCreate('.', 'sasonly')
  })

  it(`should set up a react app in the current folder`, async () => {
    const timestamp = generateUniqueTimestamp()
    const appName = `test-app-create-.-${timestamp}-react`

    process.projectDir = path.join(__dirname, appName)
    await setConstants()

    await createFolder(process.projectDir)

    await expect(create('.', 'react')).toResolve()

    await verifyCreateWeb('.', 'react')
    await verifyGitNotPresent(process.projectDir)
  })

  it(`should set up a react app in a given folder`, async () => {
    const timestamp = generateUniqueTimestamp()
    const appName = `test-app-create-.-${timestamp}-react`

    process.projectDir = path.join(__dirname, appName)
    await setConstants()

    await createFolder(process.projectDir)

    await expect(create('test-react-app', 'react')).toResolve()

    await verifyCreateWeb('test-react-app', 'react')
    await verifyGitNotPresent(process.projectDir)
  })

  it(`should set up a minimal app in a given folder`, async () => {
    const timestamp = generateUniqueTimestamp()
    const appName = `test-app-create-${timestamp}-minimal`

    process.projectDir = path.join(__dirname, appName)
    await setConstants()

    await createFolder(process.projectDir)

    await expect(create('test-minimal-app', 'minimal')).toResolve()

    await verifyCreateWeb('test-minimal-app', 'minimal')
  })

  it(`should set up an angular app in a given folder`, async () => {
    const timestamp = generateUniqueTimestamp()
    const appName = `test-app-create-${timestamp}-angular`

    process.projectDir = path.join(__dirname, appName)
    await setConstants()

    await createFolder(process.projectDir)

    await expect(create('test-angular-app', 'angular')).toResolve()

    await verifyCreateWeb('test-angular-app', 'angular')
    await verifyGitNotPresent(process.projectDir)
  })

  it(`should fail with an unknown app type 'xyz'`, async () => {
    const timestamp = generateUniqueTimestamp()
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
  // The reference is the template itself, fetched the way the command fetched
  // it. A hand-kept list of what each seed ships goes stale on the seed's next
  // release and turns this suite red with no change to the CLI.
  const template: Folder = await getTemplateFileTree(seedAppUrls[appType])
  template.folderName = appName

  await verifyFolder(template)
  await verifyPackageJsonContent(appName)

  // The docs are a submodule fetched after the archive, and the archive carries
  // the folder empty - so the derived tree can only assert that the folder is
  // there. A create whose docs download silently failed used to pass; assert
  // the site itself arrived. Every template gets the docs (create routes all
  // three through a create*App that passes the docs URL), and the path differs:
  // react keeps them under `public`, the others at the root.
  const docsCandidates = [
    path.join(process.projectDir, appName, 'public', 'docs', 'index.html'),
    path.join(process.projectDir, appName, 'docs', 'index.html')
  ]

  const present = await Promise.all(
    docsCandidates.map((candidate) => fileExists(candidate))
  )

  expect(present.some(Boolean)).toEqual(true)

  // A seed app carries its dependencies in the template's package.json, so the
  // command create issues for it is a plain install - the same trade as above:
  // the stub writes what npm would, and this asserts the CLI asked for it.
  expect(npmCommands).toContain('npm install')
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

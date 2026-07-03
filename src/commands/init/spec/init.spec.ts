import dotenv from 'dotenv'
import path from 'path'
import { verifyFolder } from '../../../utils/test'
import {
  createFolder,
  deleteFolder,
  readFile,
  generateTimestamp
} from '@sasjs/utils'
import { initFiles } from './initFiles'
import { create } from '../../create/create'
import { init } from '../init'
import { setConstants } from '../../../utils'

describe('sasjs init', () => {
  beforeAll(() => {
    dotenv.config()
  })

  afterEach(async () => {
    // deleteFolder() takes a literal path, not a glob - 'test-app-init-*' never
    // matches anything on disk, silently leaving every test's real (timestamped)
    // folder behind. Delete the actual folder each test just created instead.
    if (process.projectDir) await deleteFolder(process.projectDir)
  })

  it('should initialise with default app in the current folder', async () => {
    const appName = `test-app-init-${generateTimestamp()}`

    process.projectDir = path.join(__dirname, appName)
    await setConstants()

    await createFolder(process.projectDir)

    await expect(create('.', '')).toResolve()

    await expect(init()).toResolve()

    await verifyInit()
  })

  it(`should initialise with 'sasonly' app in the current folder`, async () => {
    const appName = `test-app-init-sasonly-${generateTimestamp()}`

    process.projectDir = path.join(__dirname, appName)
    await setConstants()

    await createFolder(process.projectDir)

    await expect(create('.', 'sasonly')).toResolve()

    await expect(init()).toResolve()

    await verifyInit()
  })
  it('should initialise in an empty current folder', async () => {
    const appName = `test-app-init-.-${generateTimestamp()}`

    process.projectDir = path.join(__dirname, appName)
    await setConstants()

    await createFolder(process.projectDir)

    await expect(init()).toResolve()

    await verifyInit()
  })
})

const verifyInit = async () => {
  await verifyFolder(initFiles)

  const gitIgnoreFilePath = path.join(process.projectDir, '.gitignore')
  const gitIgnoreContent = await readFile(gitIgnoreFilePath)
  expect(gitIgnoreContent.match(/^sasjsbuild/gm)!.length).toEqual(1)
  expect(gitIgnoreContent.match(/^node_modules/gm)!.length).toEqual(1)
}

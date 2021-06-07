import dotenv from 'dotenv'
import path from 'path'
import { verifyFolder } from '../../../utils/test'
import { createFolder, deleteFolder, readFile } from '../../../utils/file'
import { generateTimestamp } from '@sasjs/utils'
import { initFiles } from './initFiles'
import { create } from '../../create/create'
import { init } from '../init'

describe('sasjs init', () => {
  beforeAll(() => {
    dotenv.config()
  })

  afterEach(async (done) => {
    await deleteFolder(path.join(__dirname, 'test-app-init-*'))
    done()
  })

  it('should initialise with default app in the current folder', async (done) => {
    const appName = `test-app-init-${generateTimestamp()}`

    process.projectDir = path.join(__dirname, appName)

    await createFolder(process.projectDir)

    await expect(create('.', '')).toResolve()

    await expect(init()).toResolve()

    await verifyInit()

    done()
  })

  it(`should initialise with 'sasonly' app in the current folder`, async (done) => {
    const appName = `test-app-init-sasonly-${generateTimestamp()}`

    process.projectDir = path.join(__dirname, appName)

    await createFolder(process.projectDir)

    await expect(create('.', 'sasonly')).toResolve()

    await expect(init()).toResolve()

    await verifyInit()

    done()
  })
  it('should initialise in an empty current folder', async (done) => {
    const appName = `test-app-init-.-${generateTimestamp()}`

    process.projectDir = path.join(__dirname, appName)

    await createFolder(process.projectDir)

    await expect(init()).toResolve()

    await verifyInit()

    done()
  })
})

const verifyInit = async () => {
  await verifyFolder(initFiles)

  const gitIgnoreFilePath = path.join(process.projectDir, '.gitignore')
  const gitIgnoreContent = await readFile(gitIgnoreFilePath)
  expect(gitIgnoreContent.match(/^sasjsbuild\//gm).length).toEqual(1)
  expect(gitIgnoreContent.match(/^node_modules\//gm).length).toEqual(1)
}

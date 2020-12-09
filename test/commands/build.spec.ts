import dotenv from 'dotenv'
import path from 'path'
import {
  createFileStructure,
  buildServices,
  compileServices
} from '../../src/main'
import { createFolder, deleteFolder } from '../../src/utils/file'
import { generateTimestamp } from '../../src/utils/utils'

describe('sasjs build', () => {
  beforeAll(() => {
    dotenv.config()
  })

  it(
    `should build with minimal template`,
    async () => {
      const timestamp = generateTimestamp()
      const parentFolderNameTimeStamped = `test-app-build-minimal${timestamp}`

      process.projectDir = path.join(process.cwd(), parentFolderNameTimeStamped)

      await createFolder(process.projectDir)

      await createFileStructure(`create --template minimal`)

      await expect(buildServices(`build`)).resolves.toEqual(true)
    },
    2 * 60 * 1000
  )

  it(
    `should compile and build(skipping compile)`,
    async () => {
      const timestamp = generateTimestamp()
      const parentFolderNameTimeStamped = `test-app-build-${timestamp}`

      process.projectDir = path.join(process.cwd(), parentFolderNameTimeStamped)

      await createFolder(process.projectDir)

      await createFileStructure(`create`)

      await compileServices(`compile`)
      await expect(buildServices(`build`)).resolves.toEqual(true)
    },
    2 * 60 * 1000
  )

  afterAll(async () => {
    await deleteFolder('./test-app-build-*')
  }, 60 * 1000)
})

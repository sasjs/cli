import dotenv from 'dotenv'
import path from 'path'
import {
  createFileStructure,
  buildServices,
  compileServices,
  compileBuildServices
} from '../../../main'
import { deleteFolder, createFolder } from '../../../utils/file'
import { verifyStep } from '../../../utils/test'
import { generateTimestamp } from '../../../utils/utils'

describe('sasjs compile', () => {
  beforeAll(() => {
    dotenv.config()
  })

  it(
    `should compile newly created app`,
    async () => {
      const timestamp = generateTimestamp()
      const parentFolderNameTimeStamped = `test-app-cb-${timestamp}`

      process.projectDir = path.join(process.cwd(), parentFolderNameTimeStamped)

      await createFolder(process.projectDir)

      await createFileStructure(`create`)

      await expect(compileServices(`compile`)).resolves.toEqual(true)

      await verifyStep({ parentFolderName: '.', step: 'compile' })
    },
    2 * 60 * 1000
  )

  it(
    `should compile and build`,
    async () => {
      const timestamp = generateTimestamp()
      const parentFolderNameTimeStamped = `test-app-cb-${timestamp}`

      process.projectDir = path.join(process.cwd(), parentFolderNameTimeStamped)

      await createFolder(process.projectDir)

      await createFileStructure(`create`)

      await expect(buildServices(`build`)).resolves.toEqual(true)

      await verifyStep({ parentFolderName: '.', step: 'compile' })
      await verifyStep({ parentFolderName: '.', step: 'build' })
    },
    2 * 60 * 1000
  )

  it(
    `should compile and build(skipping compile)`,
    async () => {
      const timestamp = generateTimestamp()
      const parentFolderNameTimeStamped = `test-app-cb-${timestamp}`

      process.projectDir = path.join(process.cwd(), parentFolderNameTimeStamped)
      const projectDir = process.projectDir

      await createFolder(process.projectDir)

      await createFileStructure(`create`)

      await expect(compileServices(`compile`)).resolves.toEqual(true)

      await verifyStep({ parentFolderName: '.', step: 'compile' })

      await expect(buildServices(`build`)).resolves.toEqual(true)

      await verifyStep({ parentFolderName: '.', step: 'build' })
    },
    2 * 60 * 1000
  )

  it(
    `should compile and build(with recompile)`,
    async () => {
      const timestamp = generateTimestamp()
      const parentFolderNameTimeStamped = `test-app-cb-${timestamp}`

      process.projectDir = path.join(process.cwd(), parentFolderNameTimeStamped)
      const projectDir = process.projectDir

      await createFolder(process.projectDir)

      await createFileStructure(`create`)

      await expect(compileServices(`compile`)).resolves.toEqual(true)

      await verifyStep({ parentFolderName: '.', step: 'compile' })

      await expect(compileBuildServices(`compilebuild`)).resolves.toEqual(true)

      await verifyStep({ parentFolderName: '.', step: 'build' })
    },
    2 * 60 * 1000
  )

  afterAll(async () => {
    await deleteFolder('./test-app-cb-*')
  }, 60 * 1000)
})

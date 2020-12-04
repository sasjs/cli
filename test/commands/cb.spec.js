import dotenv from 'dotenv'
import path from 'path'
import rimraf from 'rimraf'
import {
  createFileStructure,
  buildServices,
  compileServices,
  compileBuildServices
} from '../../src/main'
import { createFolder } from '../../src/utils/file-utils'
import { generateTimestamp } from '../../src/utils/utils'

describe('sasjs compile', () => {
  beforeAll(() => {
    dotenv.config()
  })

  describe('test-app-timestamp', () => {
    it(
      `should compile newly created app`,
      async () => {
        const timestamp = generateTimestamp()
        const parentFolderNameTimeStamped = `test-app-cb-${timestamp}`

        process.projectDir = path.join(
          process.cwd(),
          parentFolderNameTimeStamped
        )

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

        process.projectDir = path.join(
          process.cwd(),
          parentFolderNameTimeStamped
        )

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

        process.projectDir = path.join(
          process.cwd(),
          parentFolderNameTimeStamped
        )
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

        process.projectDir = path.join(
          process.cwd(),
          parentFolderNameTimeStamped
        )
        const projectDir = process.projectDir

        await createFolder(process.projectDir)

        await createFileStructure(`create`)

        await expect(compileServices(`compile`)).resolves.toEqual(true)

        await verifyStep({ parentFolderName: '.', step: 'compile' })

        await expect(compileBuildServices(`compilebuild`)).resolves.toEqual(
          true
        )

        await verifyStep({ parentFolderName: '.', step: 'build' })
      },
      2 * 60 * 1000
    )
  })

  afterAll(async () => {
    rimraf.sync('./test-app-cb-*')
  }, 60 * 1000)
})

import path from 'path'
import {
  createTestApp,
  removeTestApp,
  updateConfig,
  updateTarget,
  verifyDocs,
  verifyDotFiles,
  verifyDotFilesNotGenerated
} from '../../../utils/test'
import {
  folderExists,
  copy,
  deleteFolder,
  deleteFile,
  DocConfig,
  generateTimestamp,
  Target
} from '@sasjs/utils'
import { generateDocs } from '../generateDocs'
import { findTargetInConfiguration } from '../../../utils'
import { TargetScope } from '../../../types'

describe('sasjs doc', () => {
  let appName: string

  afterEach(async () => {
    await removeTestApp(__dirname, appName)
  })

  it(
    `should generate docs for (default Target from config)`,
    async () => {
      appName = `test-app-doc-${generateTimestamp()}`
      const docOutputDefault = path.join(
        __dirname,
        appName,
        'sasjsbuild',
        'docs'
      )

      await createTestApp(__dirname, appName)
      await updateConfig({
        defaultTarget: 'viya'
      })

      const { target } = await findTargetInConfiguration(
        undefined as any as string,
        TargetScope.Local
      )

      await expect(
        generateDocs(target, undefined as any as string)
      ).resolves.toEqual({ outDirectory: docOutputDefault })

      await verifyDocs(docOutputDefault, 'viya')
    },
    60 * 1000
  )

  it(
    `should generate docs for (default Target from config) having doxy folder at relative path`,
    async () => {
      appName = `test-app-doc-${generateTimestamp()}`
      const docOutputDefault = path.join(
        __dirname,
        appName,
        'sasjsbuild',
        'docs'
      )
      const doxyContentPath = path.join(__dirname, appName, 'sasjs', 'doxy')
      const doxyContentPathNew = path.join(
        __dirname,
        appName,
        'doxy-custom-folder'
      )

      await createTestApp(__dirname, appName)

      await copy(doxyContentPath, doxyContentPathNew)
      await deleteFolder(doxyContentPath)

      await updateConfig({
        defaultTarget: 'viya',
        docConfig: {
          doxyContent: {
            readMe: '../README.md',
            path: './doxy-custom-folder'
          }
        }
      })

      const { target } = await findTargetInConfiguration(
        undefined as any as string,
        TargetScope.Local
      )

      await expect(
        generateDocs(target, undefined as any as string)
      ).resolves.toEqual({ outDirectory: docOutputDefault })

      await verifyDocs(docOutputDefault, 'viya')
    },
    60 * 1000
  )

  it(
    `should generate docs for (default Target from config) having doxy folder at absolute path`,
    async () => {
      appName = `test-app-doc-${generateTimestamp()}`
      const docOutputDefault = path.join(
        __dirname,
        appName,
        'sasjsbuild',
        'docs'
      )
      const doxyContentPath = path.join(__dirname, appName, 'sasjs', 'doxy')
      const doxyContentPathNew = path.join(
        __dirname,
        appName,
        'doxy-custom-folder'
      )

      await createTestApp(__dirname, appName)

      await copy(doxyContentPath, doxyContentPathNew)
      await deleteFolder(doxyContentPath)

      await updateConfig({
        defaultTarget: 'viya',
        docConfig: {
          doxyContent: {
            readMe: '../README.md',
            path: doxyContentPathNew
          }
        }
      })

      const { target } = await findTargetInConfiguration(
        undefined as any as string,
        TargetScope.Local
      )

      await expect(
        generateDocs(target, undefined as any as string)
      ).resolves.toEqual({ outDirectory: docOutputDefault })

      await verifyDocs(docOutputDefault, 'viya')
    },
    60 * 1000
  )

  it(
    `should generate docs for (default Target from config) having space in folderPath(parent Folder)`,
    async () => {
      appName = `test app  doc-${generateTimestamp()}`
      const docOutputDefault = path.join(
        __dirname,
        appName,
        'sasjsbuild',
        'docs'
      )

      await createTestApp(__dirname, appName)
      await updateConfig({
        docConfig: { displayMacroCore: false },
        defaultTarget: 'viya'
      })

      const { target } = await findTargetInConfiguration(
        undefined as any as string,
        TargetScope.Local
      )

      await expect(
        generateDocs(target, undefined as any as string)
      ).resolves.toEqual({ outDirectory: docOutputDefault })

      await verifyDocs(docOutputDefault, 'viya', false)
    },
    60 * 1000
  )

  it(
    `should generate docs for supplied target`,
    async () => {
      appName = `test-app-doc-${generateTimestamp()}`
      const docOutputDefault = path.join(
        __dirname,
        appName,
        'sasjsbuild',
        'docs'
      )

      await createTestApp(__dirname, appName)

      const { target } = await findTargetInConfiguration(
        'sas9',
        TargetScope.Local
      )

      await expect(
        generateDocs(target, undefined as any as string)
      ).resolves.toEqual({ outDirectory: docOutputDefault })

      await verifyDocs(docOutputDefault, 'sas9')
    },
    60 * 1000
  )

  it(
    `should generate docs to ./my-docs`,
    async () => {
      appName = `test-app-doc-${generateTimestamp()}`

      const docOutputProvided = path.join(__dirname, appName, 'my-docs')

      await createTestApp(__dirname, appName)

      await expect(folderExists(docOutputProvided)).resolves.toEqual(false)

      const { target } = await findTargetInConfiguration(
        'viya',
        TargetScope.Local
      )

      await expect(generateDocs(target, docOutputProvided)).resolves.toEqual({
        outDirectory: docOutputProvided
      })

      await verifyDocs(docOutputProvided, 'viya')
    },
    60 * 1000
  )

  it(
    `should generate docs without sasjs/core`,
    async () => {
      appName = `test-app-doc-${generateTimestamp()}`

      const docOutputDefault = path.join(
        __dirname,
        appName,
        'sasjsbuild',
        'docs'
      )

      await createTestApp(__dirname, appName)
      await updateConfig({
        docConfig: { displayMacroCore: false }
      })

      await expect(folderExists(docOutputDefault)).resolves.toEqual(false)

      const { target } = await findTargetInConfiguration(
        'viya',
        TargetScope.Local
      )

      await expect(
        generateDocs(target, undefined as any as string)
      ).resolves.toEqual({ outDirectory: docOutputDefault })

      await verifyDocs(docOutputDefault, 'viya', false)
    },
    60 * 1000
  )

  it(
    `should generate docs to sasjsconfig.json's outDirectory`,
    async () => {
      appName = `test-app-doc-${generateTimestamp()}`

      const docOutputProvided = path.join(__dirname, appName, 'xyz')

      await createTestApp(__dirname, appName)
      await updateConfig({
        docConfig: { outDirectory: docOutputProvided }
      })

      await expect(folderExists(docOutputProvided)).resolves.toEqual(false)

      const { target } = await findTargetInConfiguration(
        'viya',
        TargetScope.Local
      )

      await expect(
        generateDocs(target, undefined as any as string)
      ).resolves.toEqual({ outDirectory: docOutputProvided })

      await verifyDocs(docOutputProvided, 'viya')
    },
    60 * 1000
  )

  it(
    `should generate docs to default location having docConfig.outDirectory is empty`,
    async () => {
      appName = `test-app-doc-${generateTimestamp()}`
      const docOutputDefault = path.join(
        __dirname,
        appName,
        'sasjsbuild',
        'docs'
      )

      await createTestApp(__dirname, appName)
      await updateConfig({ docConfig: { outDirectory: '' } })

      await expect(folderExists(docOutputDefault)).resolves.toEqual(false)

      const { target } = await findTargetInConfiguration(
        'viya',
        TargetScope.Local
      )

      await expect(
        generateDocs(target, undefined as any as string)
      ).resolves.toEqual({ outDirectory: docOutputDefault })

      await verifyDocs(docOutputDefault, 'viya')
    },
    60 * 1000
  )

  it(
    `should fail to generate docs for not having Doxyfile configuration`,
    async () => {
      appName = `test-app-doc-${generateTimestamp()}`

      await createTestApp(__dirname, appName)

      await deleteFile(path.join(__dirname, appName, 'sasjs/doxy/Doxyfile'))

      const { target } = await findTargetInConfiguration(
        'viya',
        TargetScope.Local
      )

      await expect(
        generateDocs(target, undefined as any as string)
      ).rejects.toEqual(
        expect.stringMatching(/^Doxygen Configuration File is not found!/)
      )
    },
    60 * 1000
  )

  it(
    `should generate docs if no target is present`,
    async () => {
      appName = `test-app-doc-${generateTimestamp()}`
      const docOutputDefault = path.join(
        __dirname,
        appName,
        'sasjsbuild',
        'docs'
      )

      await createTestApp(__dirname, appName)

      await expect(
        generateDocs(undefined as any as Target, undefined as any as string)
      ).resolves.toEqual({ outDirectory: docOutputDefault })

      await verifyDocs(docOutputDefault, 'no-target')
    },
    60 * 1000
  )

  it(
    `should generate docs having target precedence over root level`,
    async () => {
      appName = `test-app-doc-${generateTimestamp()}`

      const docOutputProvided = path.join(__dirname, appName, 'xyz')

      await createTestApp(__dirname, appName)
      await updateTarget(
        {
          docConfig: {
            displayMacroCore: false,
            enableLineage: false,
            outDirectory: docOutputProvided
          }
        },
        'viya'
      )

      await expect(folderExists(docOutputProvided)).resolves.toEqual(false)

      const { target } = await findTargetInConfiguration(
        'viya',
        TargetScope.Local
      )

      await expect(
        generateDocs(target, undefined as any as string)
      ).resolves.toEqual({ outDirectory: docOutputProvided })

      await verifyDocs(docOutputProvided, 'viya', false)
      await verifyDotFilesNotGenerated(docOutputProvided)
    },
    60 * 1000
  )

  it(
    `should generate docs having target precedence over root level(no docConfig)`,
    async () => {
      appName = `test-app-doc-${generateTimestamp()}`

      const docOutputProvided = path.join(__dirname, appName, 'xyz')

      await createTestApp(__dirname, appName)
      await updateConfig({ docConfig: null as unknown as DocConfig })
      await updateTarget(
        {
          docConfig: {
            displayMacroCore: false,
            enableLineage: false,
            outDirectory: docOutputProvided
          }
        },
        'viya'
      )

      await expect(folderExists(docOutputProvided)).resolves.toEqual(false)

      const { target } = await findTargetInConfiguration(
        'viya',
        TargetScope.Local
      )

      await expect(
        generateDocs(target, undefined as any as string)
      ).resolves.toEqual({ outDirectory: docOutputProvided })

      await verifyDocs(docOutputProvided, 'viya', false)
      await verifyDotFilesNotGenerated(docOutputProvided)
    },
    60 * 1000
  )

  it(
    `should generate docs having no docConfig at root level`,
    async () => {
      appName = `test-app-doc-${generateTimestamp()}`

      const docOutputDefault = path.join(
        __dirname,
        appName,
        'sasjsbuild',
        'docs'
      )

      await createTestApp(__dirname, appName)
      await updateConfig({ docConfig: null as unknown as DocConfig })

      await expect(folderExists(docOutputDefault)).resolves.toEqual(false)

      const { target } = await findTargetInConfiguration(
        'viya',
        TargetScope.Local
      )

      await expect(
        generateDocs(target, undefined as any as string)
      ).resolves.toEqual({ outDirectory: docOutputDefault })

      await verifyDocs(docOutputDefault, 'viya')
      await verifyDotFiles(docOutputDefault)
    },
    60 * 1000
  )

  it(
    `should generate docs having empty docConfig at root level`,
    async () => {
      appName = `test-app-doc-${generateTimestamp()}`

      const docOutputDefault = path.join(
        __dirname,
        appName,
        'sasjsbuild',
        'docs'
      )

      await createTestApp(__dirname, appName)
      await updateConfig({ docConfig: {} })

      await expect(folderExists(docOutputDefault)).resolves.toEqual(false)

      const { target } = await findTargetInConfiguration(
        'viya',
        TargetScope.Local
      )

      await expect(
        generateDocs(target, undefined as any as string)
      ).resolves.toEqual({ outDirectory: docOutputDefault })

      await verifyDocs(docOutputDefault, 'viya')
      await verifyDotFiles(docOutputDefault)
    },
    60 * 1000
  )

  it(
    `should generate docs having no docConfig at root level and no targets`,
    async () => {
      appName = `test-app-doc-${generateTimestamp()}`

      const docOutputDefault = path.join(
        __dirname,
        appName,
        'sasjsbuild',
        'docs'
      )

      await createTestApp(__dirname, appName)
      await updateConfig({ docConfig: null as unknown as DocConfig })

      await expect(folderExists(docOutputDefault)).resolves.toEqual(false)

      await expect(
        generateDocs(undefined as any as Target, undefined as any as string)
      ).resolves.toEqual({ outDirectory: docOutputDefault })

      await verifyDocs(docOutputDefault, 'no-target')
      await verifyDotFiles(docOutputDefault)
    },
    60 * 1000
  )

  it(
    `should generate docs having empty docConfig at root level and no targets`,
    async () => {
      appName = `test-app-doc-${generateTimestamp()}`

      const docOutputDefault = path.join(
        __dirname,
        appName,
        'sasjsbuild',
        'docs'
      )

      await createTestApp(__dirname, appName)
      await updateConfig({ docConfig: {} })

      await expect(folderExists(docOutputDefault)).resolves.toEqual(false)

      await expect(
        generateDocs(undefined as any as Target, undefined as any as string)
      ).resolves.toEqual({ outDirectory: docOutputDefault })

      await verifyDocs(docOutputDefault, 'no-target')
      await verifyDotFiles(docOutputDefault)
    },
    60 * 1000
  )
})

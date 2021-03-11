import path from 'path'

import { doc } from '../../../main'
import { Command } from '../../../utils/command'
import {
  createTestApp,
  removeTestApp,
  removeAllTargetsFromConfigs,
  updateConfig,
  updateTarget,
  verifyDocs,
  verifyDotFiles,
  verifyDotFilesNotGenerated
} from '../../../utils/test'
import { generateTimestamp } from '../../../utils/utils'
import {
  folderExists,
  fileExists,
  createFile,
  readFile,
  deleteFile
} from '../../../utils/file'
import { getConstants } from '../../../constants'
import { DocConfig } from '@sasjs/utils/types/config'

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

      await expect(doc(new Command(`doc`))).resolves.toEqual(0)

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

      await expect(doc(new Command(`doc`))).resolves.toEqual(0)

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

      await expect(doc(new Command(`doc -t sas9`))).resolves.toEqual(0)

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

      await expect(
        doc(new Command(`doc -t viya --outDirectory ${docOutputProvided}`))
      ).resolves.toEqual(0)

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

      await expect(doc(new Command(`doc -t viya`))).resolves.toEqual(0)

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

      await expect(doc(new Command(`doc -t viya`))).resolves.toEqual(0)

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

      await expect(doc(new Command(`doc -t viya`))).resolves.toEqual(0)

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

      await expect(doc(new Command(`doc`))).resolves.toEqual(2)
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

      await removeAllTargetsFromConfigs()

      await expect(doc(new Command(`doc`))).resolves.toEqual(0)

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

      await expect(doc(new Command(`doc -t viya`))).resolves.toEqual(0)

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
      await updateConfig({ docConfig: (null as unknown) as DocConfig })
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

      await expect(doc(new Command(`doc -t viya`))).resolves.toEqual(0)

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
      await updateConfig({ docConfig: (null as unknown) as DocConfig })

      await expect(folderExists(docOutputDefault)).resolves.toEqual(false)

      await expect(doc(new Command(`doc -t viya`))).resolves.toEqual(0)

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

      await expect(doc(new Command(`doc -t viya`))).resolves.toEqual(0)

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
      await updateConfig({ docConfig: (null as unknown) as DocConfig })
      await removeAllTargetsFromConfigs()

      await expect(folderExists(docOutputDefault)).resolves.toEqual(false)

      await expect(doc(new Command(`doc`))).resolves.toEqual(0)

      await verifyDocs(docOutputDefault, 'no-target')
      await verifyDotFiles(docOutputDefault)
    },
    60 * 1000
  )

  it(
    `should generate docs having empty docConfig at root level and not targets`,
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
      await removeAllTargetsFromConfigs()

      await expect(folderExists(docOutputDefault)).resolves.toEqual(false)

      await expect(doc(new Command(`doc`))).resolves.toEqual(0)

      await verifyDocs(docOutputDefault, 'no-target')
      await verifyDotFiles(docOutputDefault)
    },
    60 * 1000
  )
})

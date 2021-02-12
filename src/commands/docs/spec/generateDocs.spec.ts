import path from 'path'

import { doc } from '../../../main'
import { Command } from '../../../utils/command'
import {
  createTestApp,
  removeTestApp,
  removeAllTargetsFromConfigs,
  updateDocConfig,
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
    `should generate docs for (fallback first Target from config)`,
    async () => {
      appName = `test-app-doc-${generateTimestamp()}`
      const docOutputDefault = path.join(
        __dirname,
        appName,
        'sasjsbuild',
        'docs'
      )

      await createTestApp(__dirname, appName)

      await expect(doc(new Command(`doc`))).resolves.toEqual(0)

      await verifyDocs(docOutputDefault)
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
        doc(new Command(`doc --outDirectory ${docOutputProvided}`))
      ).resolves.toEqual(0)

      await verifyDocs(docOutputProvided)
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
      await updateDocConfig({ displayMacroCore: false } as DocConfig)

      await expect(folderExists(docOutputDefault)).resolves.toEqual(false)

      await expect(doc(new Command(`doc`))).resolves.toEqual(0)

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
      await updateDocConfig({ outDirectory: docOutputProvided } as DocConfig)

      await expect(folderExists(docOutputProvided)).resolves.toEqual(false)

      await expect(doc(new Command(`doc`))).resolves.toEqual(0)

      await verifyDocs(docOutputProvided)
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
      await updateDocConfig({ outDirectory: '' } as DocConfig)

      await expect(folderExists(docOutputDefault)).resolves.toEqual(false)

      await expect(doc(new Command(`doc`))).resolves.toEqual(0)

      await verifyDocs(docOutputDefault)
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
      await updateDocConfig(
        {
          displayMacroCore: false,
          disableLineage: true,
          outDirectory: docOutputProvided
        } as DocConfig,
        'viya'
      )

      await expect(folderExists(docOutputProvided)).resolves.toEqual(false)

      await expect(doc(new Command(`doc`))).resolves.toEqual(0)

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
      await updateDocConfig((null as unknown) as DocConfig)
      await updateDocConfig(
        {
          displayMacroCore: false,
          disableLineage: true,
          outDirectory: docOutputProvided
        } as DocConfig,
        'viya'
      )

      await expect(folderExists(docOutputProvided)).resolves.toEqual(false)

      await expect(doc(new Command(`doc`))).resolves.toEqual(0)

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
      await updateDocConfig((null as unknown) as DocConfig)

      await expect(folderExists(docOutputDefault)).resolves.toEqual(false)

      await expect(doc(new Command(`doc`))).resolves.toEqual(0)

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
      await updateDocConfig({} as DocConfig)

      await expect(folderExists(docOutputDefault)).resolves.toEqual(false)

      await expect(doc(new Command(`doc`))).resolves.toEqual(0)

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
      await updateDocConfig((null as unknown) as DocConfig)
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
      await updateDocConfig({} as DocConfig)
      await removeAllTargetsFromConfigs()

      await expect(folderExists(docOutputDefault)).resolves.toEqual(false)

      await expect(doc(new Command(`doc`))).resolves.toEqual(0)

      await verifyDocs(docOutputDefault, 'no-target')
      await verifyDotFiles(docOutputDefault)
    },
    60 * 1000
  )
})

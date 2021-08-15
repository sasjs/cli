import path from 'path'
import {
  createTestApp,
  removeTestApp,
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
  Target,
  Configuration
} from '@sasjs/utils'
import { generateDocs } from '../generateDocs'
import { findTargetInConfiguration, getLocalConfig } from '../../../utils'
import { TargetScope } from '../../../types'

describe('sasjs doc', () => {
  const appName = `test-app-doc-${generateTimestamp()}`
  const docOutputDefault = path.join(__dirname, appName, 'sasjsbuild', 'docs')
  const doxyContentPath = path.join(__dirname, appName, 'sasjs', 'doxy')
  let defaultTarget: Target
  let defaultConfig: Configuration

  beforeAll(async () => {
    await createTestApp(__dirname, appName)
    ;({ target: defaultTarget } = await findTargetInConfiguration(
      'viya',
      TargetScope.Local
    ))
    defaultConfig = await getLocalConfig()
  })

  afterEach(async () => {
    await deleteFolder(docOutputDefault)
  })

  afterAll(async () => {
    await removeTestApp(__dirname, appName)
  })

  it(`should generate docs`, async () => {
    await expect(generateDocs(defaultTarget, defaultConfig)).resolves.toEqual({
      outDirectory: docOutputDefault
    })

    await verifyDocs(docOutputDefault, defaultTarget.name)
  })

  it(`should generate docs having doxy folder at relative path`, async () => {
    const doxyContentPathNew = path.join(
      __dirname,
      appName,
      'doxy-custom-folder'
    )

    await copy(doxyContentPath, doxyContentPathNew)
    await deleteFolder(doxyContentPath)

    const config = {
      ...defaultConfig,
      docConfig: {
        doxyContent: {
          readMe: '../README.md',
          path: './doxy-custom-folder'
        }
      }
    }

    await expect(generateDocs(defaultTarget, config)).resolves.toEqual({
      outDirectory: docOutputDefault
    })

    await verifyDocs(docOutputDefault, defaultTarget.name)

    await copy(doxyContentPathNew, doxyContentPath)
    await deleteFolder(doxyContentPathNew)
  })

  it(`should generate docs for having doxy folder at absolute path`, async () => {
    const doxyContentPathNew = path.join(
      __dirname,
      appName,
      'doxy-custom-folder'
    )

    await copy(doxyContentPath, doxyContentPathNew)
    await deleteFolder(doxyContentPath)

    const config = {
      ...defaultConfig,
      docConfig: {
        doxyContent: {
          readMe: '../README.md',
          path: doxyContentPathNew
        }
      }
    }

    await expect(generateDocs(defaultTarget, config)).resolves.toEqual({
      outDirectory: docOutputDefault
    })

    await verifyDocs(docOutputDefault, defaultTarget.name)

    await copy(doxyContentPathNew, doxyContentPath)
    await deleteFolder(doxyContentPathNew)
  })

  it(`should generate docs for having space in folderPath(parent Folder)`, async () => {
    const config = {
      ...defaultConfig,
      docConfig: { displayMacroCore: false }
    }

    await expect(generateDocs(defaultTarget, config)).resolves.toEqual({
      outDirectory: docOutputDefault
    })

    await verifyDocs(docOutputDefault, defaultTarget.name, false)
  })

  it(`should generate docs to ./my-docs-<timestamp>`, async () => {
    const docOutputProvided = path.join(
      __dirname,
      appName,
      `my-docs-${generateTimestamp()}`
    )

    await expect(
      generateDocs(defaultTarget, defaultConfig, docOutputProvided)
    ).resolves.toEqual({
      outDirectory: docOutputProvided
    })

    await verifyDocs(docOutputProvided, defaultTarget.name)
  })

  it(`should generate docs without sasjs/core`, async () => {
    await expect(folderExists(docOutputDefault)).resolves.toEqual(false)

    const config = {
      ...defaultConfig,
      docConfig: { displayMacroCore: false }
    }

    await expect(generateDocs(defaultTarget, config)).resolves.toEqual({
      outDirectory: docOutputDefault
    })

    await verifyDocs(docOutputDefault, defaultTarget.name, false)
  })

  it(`should generate docs to sasjsconfig.json's outDirectory`, async () => {
    const docOutputProvided = path.join(
      __dirname,
      appName,
      `xyz-${generateTimestamp()}`
    )

    const config = {
      ...defaultConfig,
      docConfig: { outDirectory: docOutputProvided }
    }

    await expect(generateDocs(defaultTarget, config)).resolves.toEqual({
      outDirectory: docOutputProvided
    })

    await verifyDocs(docOutputProvided, defaultTarget.name)
  })

  it(`should generate docs to default location having docConfig.outDirectory is empty`, async () => {
    const config = { ...defaultConfig, docConfig: { outDirectory: '' } }

    await expect(generateDocs(defaultTarget, config)).resolves.toEqual({
      outDirectory: docOutputDefault
    })

    await verifyDocs(docOutputDefault, defaultTarget.name)
  })

  it(`should fail to generate docs for not having Doxyfile configuration`, async () => {
    const doxyFile = path.join(__dirname, appName, 'sasjs/doxy/Doxyfile')
    const doxyFileNew = path.join(__dirname, appName, 'sasjs/doxy/Doxytemp')

    await copy(doxyFile, doxyFileNew)
    await deleteFile(doxyFile)

    await expect(generateDocs(defaultTarget, defaultConfig)).rejects.toEqual(
      expect.stringMatching(/^Doxygen Configuration File is not found!/)
    )

    await copy(doxyFileNew, doxyFile)
    await deleteFile(doxyFileNew)
  })

  it(`should generate docs if no target is present`, async () => {
    await expect(generateDocs(undefined, defaultConfig)).resolves.toEqual({
      outDirectory: docOutputDefault
    })

    await verifyDocs(docOutputDefault, 'no-target')
  })

  it(`should generate docs having target precedence over root level`, async () => {
    const docOutputProvided = path.join(
      __dirname,
      appName,
      `xyz-${generateTimestamp()}`
    )

    const target = new Target({
      ...defaultTarget.toJson(),
      docConfig: {
        displayMacroCore: false,
        enableLineage: false,
        outDirectory: docOutputProvided
      }
    })

    await expect(generateDocs(target, defaultConfig)).resolves.toEqual({
      outDirectory: docOutputProvided
    })

    await verifyDocs(docOutputProvided, defaultTarget.name, false)
    await verifyDotFilesNotGenerated(docOutputProvided)
  })

  it(`should generate docs having target precedence over root level(no docConfig)`, async () => {
    const docOutputProvided = path.join(
      __dirname,
      appName,
      `xyz-${generateTimestamp()}`
    )

    const config = {
      ...defaultConfig,
      docConfig: null as unknown as DocConfig
    }
    const target = new Target({
      ...defaultTarget.toJson(),
      docConfig: {
        displayMacroCore: false,
        enableLineage: false,
        outDirectory: docOutputProvided
      }
    })

    await expect(generateDocs(target, config)).resolves.toEqual({
      outDirectory: docOutputProvided
    })

    await verifyDocs(docOutputProvided, defaultTarget.name, false)
    await verifyDotFilesNotGenerated(docOutputProvided)
  })

  it(`should generate docs having no docConfig at root level`, async () => {
    const config = { ...defaultConfig, docConfig: null as unknown as DocConfig }

    await expect(
      generateDocs(defaultTarget, config, undefined)
    ).resolves.toEqual({ outDirectory: docOutputDefault })

    await verifyDocs(docOutputDefault, defaultTarget.name)
    await verifyDotFiles(docOutputDefault)
  })

  it(`should generate docs having empty docConfig at root level`, async () => {
    const config = { ...defaultConfig, docConfig: {} }

    await expect(generateDocs(defaultTarget, config)).resolves.toEqual({
      outDirectory: docOutputDefault
    })

    await verifyDocs(docOutputDefault, defaultTarget.name)
    await verifyDotFiles(docOutputDefault)
  })

  it(`should generate docs having no docConfig at root level and no targets`, async () => {
    const config = {
      ...defaultConfig,
      docConfig: null as unknown as DocConfig
    }

    await expect(generateDocs(undefined, config)).resolves.toEqual({
      outDirectory: docOutputDefault
    })

    await verifyDocs(docOutputDefault, 'no-target')
    await verifyDotFiles(docOutputDefault)
  })

  it(`should generate docs having empty docConfig at root level and no targets`, async () => {
    const config = {
      ...defaultConfig,
      docConfig: {}
    }

    await expect(generateDocs(undefined, config)).resolves.toEqual({
      outDirectory: docOutputDefault
    })

    await verifyDocs(docOutputDefault, 'no-target')
    await verifyDotFiles(docOutputDefault)
  })
})

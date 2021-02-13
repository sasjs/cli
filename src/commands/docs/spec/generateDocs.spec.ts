import path from 'path'

import { doc } from '../../../main'
import { Command } from '../../../utils/command'
import {
  createTestApp,
  removeTestApp,
  removeAllTargetsFromConfigs
} from '../../../utils/test'
import { generateTimestamp } from '../../../utils/utils'
import {
  folderExists,
  fileExists,
  createFile,
  readFile,
  deleteFile
} from '../../../utils/file'
import { getConfiguration, getGlobalRcFile } from '../../../utils/config'
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
      await updateConfig({ displayMacroCore: false } as DocConfig)

      await expect(folderExists(docOutputDefault)).resolves.toEqual(false)

      await expect(doc(new Command(`doc`))).resolves.toEqual(0)

      await verifyDocs(docOutputDefault, undefined, false)
    },
    60 * 1000
  )

  it(
    `should generate docs to sasjsconfig.json's outDirectory`,
    async () => {
      appName = `test-app-doc-${generateTimestamp()}`

      const docOutputProvided = path.join(__dirname, appName, 'xyz')

      await createTestApp(__dirname, appName)
      await updateConfig({ outDirectory: docOutputProvided } as DocConfig)

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
      await updateConfig({ outDirectory: '' } as DocConfig)

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
})

const updateConfig = async (docConfig: DocConfig) => {
  const { buildSourceFolder } = getConstants()
  const configPath = path.join(buildSourceFolder, 'sasjs', 'sasjsconfig.json')
  const config = await getConfiguration(configPath)
  if (config?.targets?.[0].docConfig) config.targets[0].docConfig = docConfig

  await createFile(configPath, JSON.stringify(config, null, 1))
}

const verifyDocs = async (
  docsFolder: string,
  target: string = 'viya',
  macroCore: boolean = true
) => {
  const indexHTML = path.join(docsFolder, 'index.html')
  const appInitHTML = path.join(docsFolder, 'appinit_8sas.html')

  const sas9MacrosExampleMacro = path.join(
    docsFolder,
    'targets_2sas9_2macros_2examplemacro_8sas_source.html'
  )
  const sas9ServicesAdminDostuff = path.join(
    docsFolder,
    'targets_2sas9_2services_2admin_2dostuff_8sas_source.html'
  )
  const viyaMacrosExampleMacro = path.join(
    docsFolder,
    'targets_2viya_2macros_2examplemacro_8sas_source.html'
  )
  const viyaServicesAdminDostuff = path.join(
    docsFolder,
    'targets_2viya_2services_2admin_2dostuff_8sas_source.html'
  )
  const yetAnotherMacro = path.join(docsFolder, 'yetanothermacro_8sas.html')
  const yetAnotherMacroSource = path.join(
    docsFolder,
    'yetanothermacro_8sas_source.html'
  )
  const macroCoreFile = path.join(docsFolder, 'all_8sas.html')
  const macroCoreFileSource = path.join(docsFolder, 'all_8sas_source.html')

  await expect(folderExists(docsFolder)).resolves.toEqual(true)

  await expect(fileExists(indexHTML)).resolves.toEqual(true)
  await expect(fileExists(appInitHTML)).resolves.toEqual(true)

  const expectSas9Files = target === 'sas9'
  const expectViyaFiles = target === 'viya'

  await expect(fileExists(sas9MacrosExampleMacro)).resolves.toEqual(
    expectSas9Files
  )
  await expect(fileExists(sas9ServicesAdminDostuff)).resolves.toEqual(
    expectSas9Files
  )
  await expect(fileExists(viyaMacrosExampleMacro)).resolves.toEqual(
    expectViyaFiles
  )
  await expect(fileExists(viyaServicesAdminDostuff)).resolves.toEqual(
    expectViyaFiles
  )

  await expect(fileExists(yetAnotherMacro)).resolves.toEqual(true)
  await expect(fileExists(yetAnotherMacroSource)).resolves.toEqual(true)

  await expect(fileExists(macroCoreFile)).resolves.toEqual(macroCore)
  await expect(fileExists(macroCoreFileSource)).resolves.toEqual(macroCore)

  const indexHTMLContent = await readFile(indexHTML)

  expect(indexHTMLContent).toEqual(
    expect.stringContaining('<h1><a class="anchor" id="autotoc_md1"></a>')
  )
}

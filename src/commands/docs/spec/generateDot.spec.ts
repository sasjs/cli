import path from 'path'

import { doc } from '../../../main'
import { Command } from '../../../utils/command'
import { createTestApp, removeTestApp } from '../../../utils/test'
import { generateTimestamp } from '../../../utils/utils'
import {
  folderExists,
  fileExists,
  createFile,
  deleteFile
} from '../../../utils/file'
import { getConfiguration } from '../../../utils/config'
import { getConstants } from '../../../constants'
import { DocConfig } from '@sasjs/utils/types/config'

describe('sasjs doc lineage', () => {
  let appName: string

  afterEach(async () => {
    await removeTestApp(__dirname, appName)
  })

  it(
    `should generate dot-files (fallback first Target from config)`,
    async () => {
      appName = `test-app-doc-${generateTimestamp()}`
      const docOutputDefault = path.join(
        __dirname,
        appName,
        'sasjsbuild',
        'docs'
      )

      await createTestApp(__dirname, appName)

      await expect(doc(new Command(`doc lineage`))).resolves.toEqual(0)

      await verifyDotFiles(docOutputDefault)
    },
    60 * 1000
  )

  it(
    `should generate dot-files for supplied target`,
    async () => {
      appName = `test-app-doc-${generateTimestamp()}`
      const docOutputDefault = path.join(
        __dirname,
        appName,
        'sasjsbuild',
        'docs'
      )

      await createTestApp(__dirname, appName)

      await expect(doc(new Command(`doc lineage -t sas9`))).resolves.toEqual(0)

      await verifyDotFiles(docOutputDefault)
    },
    60 * 1000
  )

  it(
    `should generate dot-files to ./my-docs`,
    async () => {
      appName = `test-app-doc-${generateTimestamp()}`

      const docOutputProvided = path.join(__dirname, appName, 'my-docs')

      await createTestApp(__dirname, appName)

      await expect(folderExists(docOutputProvided)).resolves.toEqual(false)

      await expect(
        doc(new Command(`doc lineage --outDirectory ${docOutputProvided}`))
      ).resolves.toEqual(0)

      await verifyDotFiles(docOutputProvided)
    },
    60 * 1000
  )

  it(
    `should generate dot-files to sasjsconfig.json's outDirectory`,
    async () => {
      appName = `test-app-doc-${generateTimestamp()}`

      const docOutputProvided = path.join(__dirname, appName, 'xyz')

      await createTestApp(__dirname, appName)
      await updateConfig({ outDirectory: docOutputProvided } as DocConfig)

      await expect(folderExists(docOutputProvided)).resolves.toEqual(false)

      await expect(doc(new Command(`doc lineage`))).resolves.toEqual(0)

      await verifyDotFiles(docOutputProvided)
    },
    60 * 1000
  )

  it(
    `should generate dot-files to default location having docConfig.outDirectory is empty`,
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

      await expect(doc(new Command(`doc lineage`))).resolves.toEqual(0)

      await verifyDotFiles(docOutputDefault)
    },
    60 * 1000
  )
})

const updateConfig = async (docConfig: DocConfig) => {
  const { buildSourceFolder } = getConstants()
  const configPath = path.join(buildSourceFolder, 'sasjsconfig.json')
  const config = await getConfiguration(configPath)
  if (config?.targets?.[0].docConfig) config.targets[0].docConfig = docConfig

  await createFile(configPath, JSON.stringify(config, null, 1))
}

const verifyDotFiles = async (docsFolder: string) => {
  const dotCodeFile = path.join(docsFolder, 'generated_code.dot')
  const dotGraphFile = path.join(docsFolder, 'graph_diagram.svg')

  await expect(folderExists(docsFolder)).resolves.toEqual(true)

  await expect(fileExists(dotCodeFile)).resolves.toEqual(true)
  await expect(fileExists(dotGraphFile)).resolves.toEqual(true)
}

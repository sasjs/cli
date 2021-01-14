import path from 'path'

import { doc } from '../../../main'
import { Command } from '../../../utils/command'
import { createTestApp, removeTestApp } from '../../../utils/test'
import { generateTimestamp } from '../../../utils/utils'
import { folderExists, deleteFolder, deleteFile } from '../../../utils/file'

describe('sasjs doc', () => {
  let appName: string
  const docOutput = path.join(process.cwd(), './my-docs')

  afterEach(async () => {
    await deleteFolder(docOutput)
    await removeTestApp(__dirname, appName)
  })

  it(
    `should generate docs`,
    async () => {
      appName = `test-app-doc-${generateTimestamp()}`

      await createTestApp(__dirname, appName)

      await expect(doc(new Command(`doc`))).resolves.toEqual(0)
    },
    60 * 1000
  )

  it(
    `should generate docs for single target`,
    async () => {
      appName = `test-app-doc-${generateTimestamp()}`

      await createTestApp(__dirname, appName)

      await expect(doc(new Command(`doc -t viya`))).resolves.toEqual(0)
    },
    60 * 1000
  )

  it(
    `should generate docs to ./my-docs`,
    async () => {
      appName = `test-app-doc-${generateTimestamp()}`

      await createTestApp(__dirname, appName)

      await expect(folderExists(docOutput)).resolves.toEqual(false)

      await expect(doc(new Command(`doc --outDirectory ./my-docs`))).toResolve()

      await expect(folderExists(docOutput)).resolves.toEqual(true)
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
})

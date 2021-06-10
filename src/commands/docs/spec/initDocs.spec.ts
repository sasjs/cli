import path from 'path'

import { doc } from '../../../main'
import { Command } from '../../../utils/command'
import { createTestApp, removeTestApp } from '../../../utils/test'
import { folderExists, deleteFolder, generateTimestamp } from '@sasjs/utils'

describe('sasjs doc', () => {
  let appName: string

  afterEach(async () => {
    await removeTestApp(__dirname, appName)
  })

  it(
    `should create 'doxy' folder in 'sasjs'`,
    async () => {
      appName = `test-app-doc-${generateTimestamp()}`
      const doxypath = path.join(__dirname, appName, 'sasjs', 'doxy')

      await createTestApp(__dirname, appName)

      await deleteFolder(doxypath)
      await expect(folderExists(doxypath)).resolves.toEqual(false)

      await expect(doc(new Command(`doc init`))).resolves.toEqual(0)

      await expect(folderExists(doxypath)).resolves.toEqual(true)
    },
    60 * 1000
  )
})

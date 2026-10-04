import path from 'path'

import {
  createTestApp,
  removeTestApp,
  generateUniqueTimestamp
} from '../../../utils/test'
import { folderExists, deleteFolder } from '@sasjs/utils'
import { initDocs } from '../initDocs'

describe('sasjs doc', () => {
  let appName: string

  afterEach(async () => {
    await removeTestApp(__dirname, appName)
  })

  it(
    `should create 'doxy' folder in 'sasjs'`,
    async () => {
      appName = `test-app-doc-${generateUniqueTimestamp()}`
      const doxypath = path.join(__dirname, appName, 'sasjs', 'doxy')

      await createTestApp(__dirname, appName)

      await deleteFolder(doxypath)
      await expect(folderExists(doxypath)).resolves.toEqual(false)

      await expect(initDocs()).resolves.not.toThrow()

      await expect(folderExists(doxypath)).resolves.toEqual(true)
    },
    60 * 1000
  )
})

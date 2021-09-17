import { createReactApp } from '../utils'
import { folderExists, deleteFolder, createFolder } from '@sasjs/utils'
import path from 'path'

describe('utils', () => {
  describe('createReactApp', () => {
    it('should create React app', async () => {
      const reactFolder = 'react-seed-app'

      const reactFolderPath = path.join(__dirname, reactFolder)
      const sasjsFolderPath = path.join(reactFolderPath, 'sasjs')

      await createFolder(reactFolderPath)

      await expect(createReactApp(reactFolderPath)).toResolve()
      await expect(folderExists(sasjsFolderPath)).resolves.toEqual(true)

      await deleteFolder(reactFolderPath)
    })
  })
})

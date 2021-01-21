import { createReactApp } from '../utils'
import { folderExists, deleteFolder, createFolder } from '../file'
import path from 'path'

describe('utils', () => {
  describe('createReactApp', () => {
    it('should create React app', async () => {
      const subFolderPath = 'src/utils/spec'
      const reactFolder = 'react-seed-app'
      const folderPath = path.join(process.cwd(), subFolderPath, reactFolder)
      const reactFolderPath = path.join(subFolderPath, reactFolder)
      const sasjsFolderPath = path.join(reactFolderPath, 'sasjs')

      await createFolder(folderPath)

      await expect(createReactApp(reactFolderPath)).resolves
      await expect(folderExists(sasjsFolderPath)).resolves.toEqual(true)

      await deleteFolder(folderPath)
    })
  })
})

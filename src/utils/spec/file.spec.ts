import path from 'path'
import {
  createFile,
  readFile,
  fileExists,
  deleteFile,
  deleteFolder
} from '@sasjs/utils'
import { generateUniqueTimestamp } from '../test'

describe('file utility', () => {
  describe('createFile', () => {
    const filename = `test-create-file-${generateUniqueTimestamp()}.txt`

    it('should create a file', async () => {
      const filePath = path.join(process.cwd(), filename)
      const content = 'test content'

      await createFile(filePath, content)

      await expect(fileExists(filePath)).resolves.toEqual(true)
      await expect(readFile(filePath)).resolves.toEqual(content)

      deleteFile(filePath)
    })

    it('should create a file and parent folders', async () => {
      const filePath = path.join(
        process.cwd(),
        'testFolder_1',
        'testFolder_2',
        filename
      )
      const content = 'test content'

      await createFile(filePath, content)

      await expect(fileExists(filePath)).resolves.toEqual(true)
      await expect(readFile(filePath)).resolves.toEqual(content)

      deleteFolder(path.join(process.cwd(), 'testFolder_1'))
    })
  })
})

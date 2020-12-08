import {
  createFile,
  readFile,
  fileExists,
  deleteFile,
  deleteFolder
} from '../../src/utils/file'
import { generateTimestamp } from '../../src/utils/utils'

describe('file utility', () => {
  describe('createFile', () => {
    let filename = `test-create-file-${generateTimestamp()}.txt`

    it('should create a file', async () => {
      const content = 'test content'

      await createFile(filename, content)

      await expect(fileExists(filename)).resolves.toEqual(true)
      await expect(readFile(filename)).resolves.toEqual(content)

      deleteFile(filename)
    })

    it('should create a file and parent folders', async () => {
      filename = 'testFolder_1/testFolder_2/' + filename
      const content = 'test content'

      await createFile(filename, content)

      await expect(fileExists(filename)).resolves.toEqual(true)
      await expect(readFile(filename)).resolves.toEqual(content)

      deleteFolder('testFolder_1')
    })
  })
})

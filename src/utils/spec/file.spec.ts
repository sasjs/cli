import path from 'path'
import {
  createFile,
  readFile,
  fileExists,
  deleteFile,
  deleteFolder,
  unifyFilePath,
  getRelativePath,
  generateTimestamp
} from '@sasjs/utils'

describe('file utility', () => {
  describe('createFile', () => {
    const filename = `test-create-file-${generateTimestamp()}.txt`

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

  describe('unifyFilePath', () => {
    it('should unify file path in Unix-like systems', () => {
      const filePath = '/folder/subFolder/file.txt'

      expect(unifyFilePath(filePath, '/')).toEqual(filePath)
    })

    it('should unify file path in Windows system', () => {
      const filePath = '/folder/subFolder/file.txt'
      const expectedFilePath = filePath.replace(/\//g, '\\')

      expect(unifyFilePath(filePath, '\\')).toEqual(expectedFilePath)
    })

    it('should unify file path with mixed separators', () => {
      const filePath = '/folder/subFolder\\file.txt'
      const unixSeparator = '/'
      const winSeparator = '\\'
      const expectedUnixPath = filePath.replace(/\\/g, unixSeparator)
      const expectedWinPath = filePath.replace(/\//g, winSeparator)

      expect(unifyFilePath(filePath, unixSeparator)).toEqual(expectedUnixPath)
      expect(unifyFilePath(filePath, winSeparator)).toEqual(expectedWinPath)
    })

    it('should return file path with custom separator', () => {
      let filePath = '/folder/subFolder/file.txt'
      let expectedFilePath = filePath.replace(/\//g, '$')

      expect(unifyFilePath(filePath, '$')).toEqual(expectedFilePath)

      filePath = '\\folder\\subFolder\\file.txt'
      expectedFilePath = filePath.replace(/\\/g, '$')

      expect(unifyFilePath(filePath, '$', '\\')).toEqual(expectedFilePath)
    })
  })
})

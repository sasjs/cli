import path from 'path'
import {
  createFile,
  readFile,
  fileExists,
  deleteFile,
  deleteFolder,
  unifyFilePath,
  getRelativePath
} from '@sasjs/utils'
import { generateTimestamp } from '../utils'

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

  describe('getRelativePath', () => {
    const depthLevel = 8

    it('should return relative path from subfolder', () => {
      const currentFolder = process.cwd()
      let subFolder = path.join(currentFolder, 'subFolder')

      expect(getRelativePath(subFolder, currentFolder)).toEqual(`..${path.sep}`)

      subFolder = path.join(subFolder, 'subFolder')

      expect(getRelativePath(subFolder, currentFolder)).toEqual(
        `..${path.sep}`.repeat(2)
      )

      subFolder = path.join(
        subFolder,
        `subFolder${path.sep}`.repeat(depthLevel)
      )

      expect(getRelativePath(subFolder, currentFolder)).toEqual(
        `..${path.sep}`.repeat(2 + depthLevel)
      )
    })

    it('should return relative path to subfolder', () => {
      const currentFolder = process.cwd()
      const subFolderName = 'subFolder'
      let subFolder = path.join(currentFolder, subFolderName)

      expect(getRelativePath(currentFolder, subFolder)).toEqual(
        `.${path.sep}${subFolderName}`
      )

      subFolder = path.join(subFolder, subFolderName)

      expect(getRelativePath(currentFolder, subFolder)).toEqual(
        `.` + `${path.sep}${subFolderName}`.repeat(2)
      )

      subFolder = path.join(
        subFolder,
        `${subFolderName}${path.sep}`.repeat(depthLevel)
      )

      expect(getRelativePath(currentFolder, subFolder)).toEqual(
        `.` + `${path.sep}${subFolderName}`.repeat(2 + depthLevel)
      )
    })

    it('should return relative path from mixed sub folders', () => {
      const currentFolder = process.cwd()
      const subFolderName = 'subFolder'
      const otherSubFolderName = 'otherSubFolder'
      let subFolder = path.join(currentFolder, subFolderName)
      let folder = path.join(currentFolder, otherSubFolderName)

      expect(getRelativePath(folder, subFolder)).toEqual(
        `..${path.sep}${subFolderName}`
      )

      subFolder = path.join(subFolder, subFolderName)
      folder = path.join(folder, otherSubFolderName)

      expect(getRelativePath(folder, subFolder)).toEqual(
        `..${path.sep}`.repeat(2) + path.join(subFolderName, subFolderName)
      )

      subFolder = path.join(
        subFolder,
        `${subFolderName}${path.sep}`.repeat(depthLevel)
      )
      folder = path.join(
        folder,
        `${otherSubFolderName}${path.sep}`.repeat(depthLevel)
      )

      expect(getRelativePath(folder, subFolder)).toEqual(
        `..${path.sep}`.repeat(2 + depthLevel) +
          path.join(...new Array(2 + 8).fill(subFolderName))
      )
    })

    it('should return current folder if FROM and TO paths are equal', () => {
      const fromFolder = process.cwd()
      const toFolder = fromFolder

      expect(getRelativePath(fromFolder, toFolder)).toEqual(`.${path.sep}`)
    })
  })
})

import {
  parseLogLines,
  millisecondsToDdHhMmSs,
  inExistingProject,
  diff,
  setupGitIgnore,
  getAbsolutePath
} from '../utils'
import { createFile, deleteFile, fileExists, readFile } from '@sasjs/utils'
import path from 'path'
import { setConstants } from '..'

describe('utils', () => {
  const folderPath = path.join('src', 'utils', 'spec')

  describe('parseLogLines', () => {
    test('should generate plain text log from json', () => {
      const expectedLog = `line1\nline2\nline3\nline4\n`

      const json = {
        items: [
          {
            line: 'line1'
          },
          {
            line: 'line2'
          },
          {
            line: 'line3'
          },
          {
            line: 'line4'
          }
        ]
      }

      expect(parseLogLines(json)).toEqual(expectedLog)
    })
  })

  describe('millisecondsToDdHhMmSs', () => {
    it('should throw an error if not supported type was provided', () => {
      const error = new Error('Not supported attribute type.')

      expect(() => millisecondsToDdHhMmSs(undefined as any)).toThrow(error)
    })

    it('should process negative number', () => {
      expect(millisecondsToDdHhMmSs(-1000)).toEqual(
        '0 day(s); 0 hour(s); 0 minute(s); 1 second(s)'
      )
    })

    it('should process 0', () => {
      expect(millisecondsToDdHhMmSs(0)).toEqual(
        '0 day(s); 0 hour(s); 0 minute(s); 0 second(s)'
      )
    })

    it('should process number with floating point', () => {
      expect(millisecondsToDdHhMmSs(8 * 60 * 60 * 1000 + 0.93326263)).toEqual(
        '0 day(s); 8 hour(s); 0 minute(s); 0 second(s)'
      )
    })

    it('should process number', () => {
      expect(millisecondsToDdHhMmSs(24 * 60 * 60 * 1000)).toEqual(
        '1 day(s); 0 hour(s); 0 minute(s); 0 second(s)'
      )
    })
  })

  describe('inExistingProject', () => {
    it('should return true if package.json exists in folder', async () => {
      process.projectDir = process.cwd()
      await setConstants()

      const packagePath = path.join(
        process.projectDir,
        folderPath,
        'package.json'
      )

      await createFile(packagePath, '{}')

      await expect(inExistingProject(folderPath)).resolves.toEqual(true)

      await deleteFile(packagePath)
    })

    it('should return false if package.json does not exist in folder', async () => {
      await expect(inExistingProject(folderPath)).resolves.toEqual(false)
    })
  })

  describe('diff', () => {
    it('should return an array of differences', () => {
      expect(diff([1, 2, 3], [2])).toEqual([1, 3])
      expect(diff(['b'], ['a', 'b', 'c'])).toEqual(['a', 'c'])
      expect(diff([{}, { test: 1 }], [{}])).toEqual([{ test: 1 }])
      expect(diff([[1], []], [[]])).toEqual([[1]])
      expect(diff([null, NaN, undefined], [[]])).toEqual([
        null,
        NaN,
        undefined,
        []
      ])
      expect(diff([true], [false])).toEqual([true, false])
    })

    it('should return an empty array if provided two equal arrays', () => {
      expect(diff([2], [2])).toEqual([])
      expect(diff(['b'], ['b'])).toEqual([])
      expect(diff([{}], [{}])).toEqual([])
      expect(diff([[]], [[]])).toEqual([])
      expect(diff([null, NaN, undefined], [null, NaN, undefined])).toEqual([])
      expect(diff([true], [true])).toEqual([])
    })
  })

  describe('setupGitIgnore', () => {
    process.projectDir = process.cwd()
    beforeAll(async () => {
      await setConstants()
    })

    const gitFilePath = path.join(process.projectDir, folderPath, '.gitignore')

    it('should create .gitignore file', async () => {
      await expect(setupGitIgnore(folderPath)).toResolve()
      await expect(fileExists(gitFilePath)).resolves.toEqual(true)

      const gitIgnoreContent = await readFile(gitFilePath)

      expect(gitIgnoreContent.includes('sasjsbuild/')).toEqual(true)

      await deleteFile(gitFilePath)
    })

    it('should add sasjsbuild folder to .gitignore file', async () => {
      let gitIgnoreContent = 'node_modules/'

      await createFile(gitFilePath, gitIgnoreContent)

      await expect(setupGitIgnore(folderPath)).toResolve()

      const regExp = new RegExp(`^node_modules\/\nsasjsbuild\/\n`, 'gm')

      gitIgnoreContent = await readFile(gitFilePath)

      expect(gitIgnoreContent.match(regExp)).toBeTruthy()
    })

    it('should not add sasjsbuild folder to .gitignore file if such rule already exists', async () => {
      const gitIgnoreContent = await readFile(gitFilePath)

      await expect(setupGitIgnore(folderPath)).toResolve()

      const regExp = new RegExp(`^sasjsbuild\/`, 'gm')

      expect(gitIgnoreContent.match(regExp)).toBeTruthy()
      expect(gitIgnoreContent.match(regExp)!.length).toEqual(1)

      await deleteFile(gitFilePath)
    })
  })

  describe('getAbsolutePath', () => {
    const homedir = require('os').homedir()
    it('should convert relative path to absolute', () => {
      const relativePath = './my-path/xyz'
      const pathRelativeTo = '/home/abc'

      const expectedAbsolutePath = ['', 'home', 'abc', 'my-path', 'xyz'].join(
        path.sep
      )

      expect(getAbsolutePath(relativePath, pathRelativeTo)).toEqual(
        expectedAbsolutePath
      )
    })

    it('should convert tilde from absolute path', () => {
      const relativePath = '~/my-path/xyz'

      const expectedAbsolutePath =
        homedir + ['', 'my-path', 'xyz'].join(path.sep)

      expect(getAbsolutePath(relativePath, '')).toEqual(expectedAbsolutePath)
    })

    it('should return same path if path is absolute', () => {
      const absolutePath = '/my-path/xyz'
      const pathRelativeTo = '/home/abc'

      const expectedAbsolutePath = ['', 'my-path', 'xyz'].join(path.sep)

      expect(getAbsolutePath(absolutePath, pathRelativeTo)).toEqual(
        expectedAbsolutePath
      )
    })
  })
})

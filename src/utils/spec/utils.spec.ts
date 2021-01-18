import {
  generateTimestamp,
  parseLogLines,
  millisecondsToDdHhMmSs,
  padWithNumber,
  inExistingProject,
  diff,
  setupGitIgnore
} from '../utils'
import { createFile, deleteFile, fileExists, readFile } from '../file'
import path from 'path'

describe('utils', () => {
  const folderPath = 'src/utils/spec'

  describe('generateTimestamp', () => {
    let realDate: DateConstructor
    beforeAll(() => {
      const currentDate = new Date('2020-10-02T10:10:10.10Z')
      realDate = Date
      global.Date = class extends Date {
        constructor(date: string) {
          if (date) {
            return super(date) as any
          }

          return currentDate
        }
      } as DateConstructor
    })

    test('should generate a timestamp in the correct format', () => {
      const expectedTimestamp = '20201002101010'

      const timestamp = generateTimestamp()

      expect(timestamp).toEqual(expectedTimestamp)
    })

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

    afterAll(() => {
      global.Date = realDate
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

  describe('padWithNumber', () => {
    it('should pad with zero by default', () => {
      expect(padWithNumber(1)).toEqual('01')
    })

    it('should not pad number that is greater than 9', () => {
      expect(padWithNumber(10)).toEqual(10)
    })

    it('should pad number', () => {
      expect(padWithNumber(5, 6)).toEqual('65')
    })
  })

  describe('inExistingProject', () => {
    it('should return true if package.json exists in folder', async () => {
      process.projectDir = process.cwd()

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
      expect(gitIgnoreContent.match(regExp).length).toEqual(1)

      await deleteFile(gitFilePath)
    })
  })
})

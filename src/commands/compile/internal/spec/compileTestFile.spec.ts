import {
  isTestFile,
  moveTestFile,
  compileTestFile,
  compileTestFlow
} from '../compileTestFile'
import {
  Logger,
  LogLevel,
  Target,
  copy,
  readFile,
  fileExists,
  createFile,
  deleteFile,
  generateTimestamp
} from '@sasjs/utils'
import {
  removeTestApp,
  createTestMinimalApp,
  createTestGlobalTarget
} from '../../../../utils/test'
import { removeFromGlobalConfig } from '../../../../utils/config'
import path from 'path'
import { compile } from '../../compile'
import chalk from 'chalk'

describe('compileTestFile', () => {
  let appName: string
  let target: Target
  let sasjsPath: string
  let testBody: string
  const testFileName = 'random.test.sas'

  beforeAll(async () => {
    testBody = await readFile(path.join(__dirname, 'testFiles', testFileName))

    process.logger = new Logger(LogLevel.Off)

    appName = `cli-tests-compile-test-file-${generateTimestamp()}`
    target = await createTestGlobalTarget(appName, '/Public/app')

    await createTestMinimalApp(__dirname, target.name)
    await deleteFile(
      path.join(__dirname, appName, 'sasjs', 'macros', '.gitkeep')
    )
    await copyTestFiles(appName)

    sasjsPath = path.join(__dirname, appName, 'sasjs')
  })

  afterAll(async () => {
    await removeFromGlobalConfig(target.name)
    await removeTestApp(__dirname, target.name)
  })

  describe('compileTestFile function', () => {
    it('should compile test file', async () => {
      const testVar = 'testVar'
      await compileTestFile(
        target,
        path.join('sasjs', 'services', 'admin', testFileName),
        testVar
      )
      const compiledTestFilePath = path.join(
        __dirname,
        appName,
        'sasjsbuild',
        'tests',
        testFileName
      )
      await expect(fileExists(compiledTestFilePath)).resolves.toEqual(true)

      const testFileContent = await readFile(compiledTestFilePath)

      expect(new RegExp(`^${testVar}`).test(testFileContent)).toEqual(true)

      const dependencyStart = '* Dependencies start;'
      const dependency =
        '%macro mf_abort(mac=mf_abort.sas, type=deprecated, msg=, iftrue=%str(1=1)'
      const dependencyEnd = '* Dependencies end;'

      expect(testFileContent.indexOf(dependencyStart)).toBeGreaterThan(-1)
      expect(testFileContent.indexOf(dependency)).toBeGreaterThan(-1)
      expect(testFileContent.indexOf(dependencyEnd)).toBeGreaterThan(-1)
      expect(testFileContent.indexOf(testBody)).toBeGreaterThan(-1)
    })
  })

  describe('moveTestFile', () => {
    it('should move service test', async () => {
      const relativePath = path.join('services', 'admin', testFileName)
      const buildPath = path.join(__dirname, appName, 'sasjsbuild')
      const originalFilePath = path.join(buildPath, relativePath)
      const destinationFilePath = path.join(buildPath, 'tests', relativePath)

      await createFile(originalFilePath, testBody)

      await moveTestFile(originalFilePath)

      await expect(fileExists(originalFilePath)).resolves.toEqual(false)
      await expect(fileExists(destinationFilePath)).resolves.toEqual(true)
      await expect(readFile(destinationFilePath)).resolves.toEqual(testBody)
    })

    it('should move job test', async () => {
      const relativePath = path.join('jobs', 'jobs', testFileName)
      const buildPath = path.join(__dirname, appName, 'sasjsbuild')
      const originalFilePath = path.join(buildPath, relativePath)
      const destinationFilePath = path.join(buildPath, 'tests', relativePath)

      await createFile(originalFilePath, testBody)

      await moveTestFile(originalFilePath)

      await expect(fileExists(originalFilePath)).resolves.toEqual(false)
      await expect(fileExists(destinationFilePath)).resolves.toEqual(true)
      await expect(readFile(destinationFilePath)).resolves.toEqual(testBody)
    })
  })

  describe('compileTestFlow', () => {
    it('should compile test flow', async () => {
      const testSetUp = path.join('tests', 'testsetup.sas')
      const testTearDown = path.join('tests', 'testteardown.sas')

      if (target.testConfig) {
        target.testConfig.testSetUp = path.join('sasjs', testSetUp)
        target.testConfig.testTearDown = path.join('sasjs', testTearDown)
      }

      const buildPath = path.join(__dirname, appName, 'sasjsbuild')
      const testsPath = path.join(buildPath, 'tests')

      await createFile(path.join(testsPath, 'testsetup.sas'), '')
      await createFile(path.join(testsPath, 'testteardown.sas'), '')

      await compileTestFlow(target)

      const testFlowPath = path.join(buildPath, 'testFlow.json')

      await expect(fileExists(testFlowPath)).resolves.toEqual(true)

      const expectedTestFlow = {
        tests: [
          ['tests', 'random.test.sas'].join('/'),
          ['tests', 'jobs', 'jobs', 'random.test.sas'].join('/'),
          ['tests', 'services', 'admin', 'random.test.sas'].join('/')
        ],
        testSetUp: testSetUp.split(path.sep).join('/'),
        testTearDown: testTearDown.split(path.sep).join('/')
      }

      await expect(JSON.parse(await readFile(testFlowPath))).toEqual(
        expectedTestFlow
      )
    })

    it('should log coverage', async () => {
      jest.spyOn(process.logger, 'table').mockImplementation(() => '')

      const expectedHeader = { head: ['File', 'Type', 'Coverage'] }
      const expectedData = [
        [
          ['services', 'common', 'appinit.sas'].join('/'),
          'service',
          'not covered'
        ],
        [
          ['services', 'common', 'getdata.sas'].join('/'),
          'service',
          'not covered'
        ],
        [
          ['services', 'services', 'common', 'appinit.sas'].join('/'),
          'service',
          'not covered'
        ],
        [
          ['services', 'services', 'common', 'getdata.sas'].join('/'),
          'service',
          'not covered'
        ],
        [
          ['tests', 'services', 'services', 'admin', 'random.test.0.sas'].join(
            '/'
          ),
          'test',
          'standalone'
        ],
        [
          ['tests', 'services', 'services', 'admin', 'random.test.sas'].join(
            '/'
          ),
          'test',
          'standalone'
        ]
      ]

      await compile(target)

      expect(process.logger.table).toHaveBeenCalledTimes(1)
      expect(process.logger.table).toHaveBeenCalledWith(
        expectedData,
        expectedHeader
      )
    })

    it('should not log 0/0 coverage', async () => {
      jest.spyOn(process.logger, 'info').mockImplementation(() => '')

      await compile(target)

      expect(process.logger.info).toHaveBeenCalledTimes(13)
      expect(process.logger.info).toHaveBeenNthCalledWith(11, `Test coverage:`)
      expect(process.logger.info).toHaveBeenNthCalledWith(
        12,
        `Services coverage: 0/4 (${chalk.greenBright('0%')})`
      )
      expect(process.logger.info).toHaveBeenLastCalledWith(
        `Overall coverage: 0/4 (${chalk.greenBright('0%')})`
      )
    })
  })
})

describe('isTestFile', () => {
  it('should return true if test SAS file', () => {
    expect(isTestFile('random.test.sas')).toEqual(true)
    expect(isTestFile('random.test.SAS')).toEqual(true)
    expect(isTestFile('random.test.0.sas')).toEqual(true)
    expect(isTestFile('random.test.10.sas')).toEqual(true)
  })

  it('should return false if not a test SAS file', () => {
    expect(isTestFile('random.test.txt')).toEqual(false)
    expect(isTestFile('random.sas')).toEqual(false)
    expect(isTestFile('random.0.sas')).toEqual(false)
    expect(isTestFile('random.tests.sas')).toEqual(false)
  })
})

const copyTestFiles = async (appName: string) => {
  await copy(
    path.join(__dirname, 'testFiles'),
    path.join(__dirname, appName, 'sasjs', 'services', 'admin')
  )
}

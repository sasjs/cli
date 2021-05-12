import {
  compileTestFile,
  moveTestFile,
  isTestFile,
  compileTestFlow
} from '../compileTestFile'
import { Target } from '@sasjs/utils/types'
import { Logger, LogLevel } from '@sasjs/utils/logger'
import {
  createTestGlobalTarget,
  createTestMinimalApp,
  removeTestApp
} from '../../../../utils/test'
import { removeFromGlobalConfig } from '../../../../utils/config'
import { generateTimestamp } from '../../../../utils/utils'
import {
  createFolder,
  createFile,
  fileExists,
  readFile
} from '../../../../utils/file'
import path from 'path'
import { compile } from '../../compile'
import chalk from 'chalk'

describe('compileTestFile', () => {
  let appName: string
  let target: Target
  let sasjsPath: string
  const testFileName = 'random.test.sas'
  const subsequentTestFileName = 'random.test.0.sas'
  const testBody = `/**
@file random.test.sas
@brief brief desc
@details detailed desc.

<h4> SAS Macros </h4>
@li mf_abort.sas

**/

options
DATASTMTCHK=ALLKEYWORDS /* some sites have this enabled */
PS=MAX /* reduce log size slightly */;`

  beforeAll(async (done) => {
    let testPath: string

    process.logger = new Logger(LogLevel.Off)

    appName = `cli-tests-compile-test-file-${generateTimestamp()}`
    target = await createTestGlobalTarget(appName, '/Public/app')
    await createTestMinimalApp(__dirname, target.name)

    sasjsPath = path.join(__dirname, appName, 'sasjs')
    const testSourceFolder = path.join(sasjsPath, 'tests')
    testPath = path.join(sasjsPath, 'services', 'admin', testFileName)

    await createFolder(testSourceFolder)
    await createFile(testPath, testBody)

    testPath = path.join(sasjsPath, 'services', 'admin', subsequentTestFileName)
    await createFile(testPath, testBody)

    done()
  })

  afterAll(async (done) => {
    await removeFromGlobalConfig(target.name)
    await removeTestApp(__dirname, target.name)

    done()
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
        '%macro mf_abort(mac=mf_abort.sas, type=, msg=, iftrue=%str(1=1)'
      const dependencyEnd = '* Dependencies end;'
      expect(testFileContent.indexOf(dependencyStart)).toBeGreaterThan(-1)
      expect(testFileContent.indexOf(dependency)).toBeGreaterThan(-1)
      expect(testFileContent.indexOf(dependencyEnd)).toBeGreaterThan(-1)
      expect(testFileContent.indexOf(testBody)).toBeGreaterThan(-1)
    })
  })

  describe('moveTestFile', () => {
    it('should move service test', async () => {
      const relativePath = path.join('services', 'admin', 'random.test.sas')
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
      const relativePath = path.join('jobs', 'jobs', 'random.test.sas')
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
      const testSetUp = 'tests/testsetup.sas'
      const testTearDown = 'tests/testteardown.sas'

      if (target.testConfig) {
        target.testConfig.testSetUp = `sasjs/${testSetUp}`
        target.testConfig.testTearDown = `sasjs/${testTearDown}`
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
          'tests/random.test.sas',
          'tests/jobs/jobs/random.test.sas',
          'tests/services/admin/random.test.sas'
        ],
        testSetUp: testSetUp,
        testTearDown: testTearDown
      }

      await expect(JSON.parse(await readFile(testFlowPath))).toEqual(
        expectedTestFlow
      )
    })

    it('should log coverage', async (done) => {
      jest.spyOn(process.logger, 'table').mockImplementation(() => '')

      const expectedHeader = { head: ['File', 'Type', 'Coverage'] }
      const expectedData = [
        ['services/common/appinit.sas', 'service', 'not covered'],
        ['services/common/getdata.sas', 'service', 'not covered'],
        ['services/services/common/appinit.sas', 'service', 'not covered'],
        ['services/services/common/getdata.sas', 'service', 'not covered'],
        [
          'tests/services/services/admin/random.test.0.sas',
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

      done()
    })

    it('should not log 0/0 coverage', async (done) => {
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

      done()
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

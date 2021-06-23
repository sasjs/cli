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
  generateTimestamp,
  deleteFolder
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
  let buildPath: string
  const testFileName = 'random.test.sas'

  beforeAll(async () => {
    process.logger = new Logger(LogLevel.Off)

    appName = `cli-tests-compile-test-file-${generateTimestamp()}`

    buildPath = path.join(__dirname, appName, 'sasjsbuild')

    target = await createTestGlobalTarget(appName, '/Public/app')
    target = new Target({
      ...target.toJson(false),
      testConfig: {
        testFolders: ['tests'],
        initProgram: 'tests/testinit.sas',
        termProgram: 'tests/testterm.sas',
        macroVars: {
          testsuite: 'SASjs Test Template'
        },
        testSetUp: 'tests/testsetup.sas',
        testTearDown: 'tests/sub/testteardown.sas'
      },
      jobConfig: {
        jobFolders: ['sasjs/jobs'],
        initProgram: '',
        termProgram: '',
        macroVars: {}
      }
    })

    await createTestMinimalApp(__dirname, target.name)
    await copyTestFiles(appName)

    testBody = await readFile(
      path.join(__dirname, 'testFiles', 'services', testFileName)
    )

    sasjsPath = path.join(__dirname, appName, 'sasjs')
  })

  afterAll(async () => {
    await removeFromGlobalConfig(target.name)
    await removeTestApp(__dirname, target.name)
  })

  afterEach(async () => await deleteFolder(buildPath))

  describe('compileTestFile function', () => {
    it('should compile test file', async () => {
      await compile(target)

      const testContent = async (filePath: string) => {
        const compiledTestFilePath = path.join(
          __dirname,
          appName,
          'sasjsbuild',
          'tests',
          filePath
        )
        await expect(fileExists(compiledTestFilePath)).resolves.toEqual(true)

        const testFileContent = await readFile(compiledTestFilePath)
        const testVar = `* Test Variables start;

%let ${Object.keys(target.testConfig!.macroVars)[0]}=${
          Object.values(target.testConfig!.macroVars)[0]
        };

*Test Variables end;`
        const testInit = `* TestInit start;
/**
  @file
  @brief setting up the test

  <h4> SAS Macros </h4>
**/

%put testing, init;
* TestInit end;`
        const testTerm = `* TestTerm start;
/**
  @file
  @brief ending the test

  <h4> SAS Macros </h4>
**/

%put testing, termed;
* TestTerm end;`
        const mvWebout = `%macro mv_webout(action,ds,fref=_mvwtemp,dslabel=,fmt=Y,stream=Y);`

        expect(testFileContent.indexOf(testVar)).toBeGreaterThan(-1)
        expect(testFileContent.indexOf(testInit)).toBeGreaterThan(-1)
        expect(testFileContent.indexOf(testTerm)).toBeGreaterThan(-1)
        expect(testFileContent.indexOf(mvWebout)).toBeGreaterThan(-1)
      }

      await testContent(
        path.join('services', 'services', 'admin', testFileName)
      )
      await testContent(path.join('jobs', 'jobs', 'testJob.test.sas'))
      await testContent(path.join('testsetup.sas'))
      await testContent(path.join('testteardown.sas'))
    })
  })

  describe('moveTestFile', () => {
    it('should move service test', async () => {
      const relativePath = path.join(
        'services',
        'services',
        'admin',
        testFileName
      )
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

      await compile(target)

      await compileTestFlow(target)

      const testFlowPath = path.join(buildPath, 'testFlow.json')

      await expect(fileExists(testFlowPath)).resolves.toEqual(true)

      const expectedTestFlow = {
        tests: [
          ['tests', 'jobs', 'jobs', 'testJob.test.sas'].join('/'),
          ['tests', 'services', 'services', 'admin', 'random.test.sas'].join(
            '/'
          ),
          ['tests', 'services', 'services', 'admin', 'random.test.0.sas'].join(
            '/'
          )
        ].sort(),
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
          ['tests', 'jobs', 'jobs', 'testJob.test.sas'].join('/'),
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
      ].sort()

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

      expect(process.logger.info).toHaveBeenCalledTimes(14)
      expect(process.logger.info).toHaveBeenNthCalledWith(12, `Test coverage:`)
      expect(process.logger.info).toHaveBeenNthCalledWith(
        13,
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
    path.join(__dirname, 'testFiles', 'tests'),
    path.join(__dirname, appName, 'tests')
  )
  await copy(
    path.join(__dirname, 'testFiles', 'services'),
    path.join(__dirname, appName, 'sasjs', 'services', 'admin')
  )
  await copy(
    path.join(__dirname, 'testFiles', 'jobs'),
    path.join(__dirname, appName, 'sasjs', 'jobs')
  )
}

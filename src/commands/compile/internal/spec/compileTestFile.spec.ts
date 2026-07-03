import {
  compileTestFile,
  compileTestFlow,
  copyTestMacroFiles,
  getCompileTree,
  getTestFileDestinationFragment
} from '../'
import {
  Logger,
  LogLevel,
  Target,
  copy,
  readFile,
  fileExists,
  generateTimestamp,
  deleteFolder,
  createFolder,
  ServerType,
  isTestFile
} from '@sasjs/utils'
import {
  removeTestApp,
  createTestMinimalApp,
  generateTestTarget
} from '../../../../utils/test'
import path from 'path'
import { compile } from '../../compile'
import chalk from 'chalk'

describe('getTestFileDestinationFragment', () => {
  // sasjsconfig.json testConfig paths (testSetUp/testTearDown) are conventionally
  // forward-slash, regardless of the OS the CLI is running on - these tests pin
  // that a Windows-style host separator doesn't break the flattening/reduce logic
  // when the config value itself uses forward slashes (see PLAN-windows-testsetup-path.md).
  describe('saveToRoot = true (testSetUp/testTearDown)', () => {
    it('flattens a forward-slash config path to its basename', () => {
      expect(
        getTestFileDestinationFragment(
          'sasjs/tests/testsetup.sas',
          'tests',
          true
        )
      ).toEqual('testsetup.sas')
    })

    it('flattens a backslash (Windows-native) path to its basename', () => {
      expect(
        getTestFileDestinationFragment(
          'sasjs\\tests\\testsetup.sas',
          'tests',
          true
        )
      ).toEqual('testsetup.sas')
    })

    it('returns an empty string for a path ending in a separator', () => {
      expect(
        getTestFileDestinationFragment('sasjs/tests/', 'tests', true)
      ).toEqual('')
    })
  })

  describe('saveToRoot = false (service/job test files)', () => {
    it('keeps the path fragment after the build destination folder name, for a forward-slash path', () => {
      expect(
        getTestFileDestinationFragment(
          'sasjsbuild/tests/services/admin/random.test.sas',
          'tests',
          false
        )
      ).toEqual(['services', 'admin', 'random.test.sas'].join(path.sep))
    })

    it('keeps the path fragment after the build destination folder name, for a backslash path', () => {
      expect(
        getTestFileDestinationFragment(
          'sasjsbuild\\tests\\services\\admin\\random.test.sas',
          'tests',
          false
        )
      ).toEqual(['services', 'admin', 'random.test.sas'].join(path.sep))
    })
  })
})

describe('compileTestFile', () => {
  const appName: string = `cli-tests-compile-test-file-${generateTimestamp()}`

  const temp: Target = generateTestTarget(
    appName,
    '/Public/app',
    {
      serviceFolders: [path.join('sasjs', 'services')],
      initProgram: '',
      termProgram: '',
      macroVars: {}
    },
    ServerType.SasViya
  )
  const target: Target = new Target({
    ...temp.toJson(),
    jobConfig: {
      jobFolders: [path.join('sasjs', 'jobs')]
    },
    macroFolders: ['sasjs/macros']
  })

  let sasjsPath: string
  let testBody: string
  let buildPath: string

  const testFileName = 'random.test.sas'

  beforeAll(async () => {
    process.logger = new Logger(LogLevel.Off)

    buildPath = path.join(__dirname, appName, 'sasjsbuild')

    await createTestMinimalApp(__dirname, target.name)
    await copyTestFiles(appName)

    testBody = await readFile(
      path.join(__dirname, 'testFiles', 'services', testFileName)
    )

    sasjsPath = path.join(__dirname, appName, 'sasjs')
  })

  afterAll(async () => {
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

        const testFileContent = replaceLineBreaks(
          await readFile(compiledTestFilePath)
        )
        const testVar = replaceLineBreaks(`* Test Variables start;

%let ${Object.keys(target.testConfig!.macroVars)[0]}=${
          Object.values(target.testConfig!.macroVars)[0]
        };

* Test Variables end;`)
        const testInit = replaceLineBreaks(`* TestInit start;


%put testing, init;
* TestInit end;`)
        const testTerm = replaceLineBreaks(`* TestTerm start;


%put testing, termed;
* TestTerm end;`)

        const mvWebout = `%macro mv_webout(action,ds,fref=_mvwtemp,dslabel=,fmt=N,stream=Y,missing=NULL`

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
      await testContent(path.join('macros', 'testMacro.test.sas'))
    })

    it('should use default testVar/saveToRoot when omitted', async () => {
      await compile(target)

      const compileTree = getCompileTree(target)

      await expect(
        compileTestFile(
          target,
          target.testConfig!.testSetUp,
          undefined,
          undefined,
          false,
          compileTree
        )
      ).toResolve()
    })

    it('should prepend a non-empty testVar to the compiled test file', async () => {
      await compile(target)

      const compileTree = getCompileTree(target)
      const testVar = '%let some_var=some_value;'

      await compileTestFile(
        target,
        target.testConfig!.testSetUp,
        testVar,
        true,
        false,
        compileTree
      )

      const compiledTestSetUpPath = path.join(
        buildPath,
        'tests',
        'testsetup.sas'
      )
      const compiledContent = await readFile(compiledTestSetUpPath)

      expect(compiledContent.indexOf(testVar)).toEqual(0)
    })

    it('should skip copying a macro test file that is already present in the build folder', async () => {
      await compile(target)

      const macroFolderAbsolutePath = path.join(
        __dirname,
        appName,
        'sasjs',
        'macros'
      )

      await expect(copyTestMacroFiles(macroFolderAbsolutePath)).toResolve()
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
          ['tests', 'macros', 'testMacro.test.sas'].join('/'),
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

    it('should return no tests when the tests folder is empty', async () => {
      await compile(target)

      const testsFolderPath = path.join(buildPath, 'tests')
      await deleteFolder(testsFolderPath)
      await createFolder(testsFolderPath)

      const testFlow = await compileTestFlow(target)

      expect(testFlow!.tests).toEqual([])
      expect(testFlow!.testSetUp).toBeUndefined()
      expect(testFlow!.testTearDown).toBeUndefined()
    })

    it('should not set testSetUp/testTearDown when the configured file is not among the compiled tests', async () => {
      await compile(target)

      const targetWithBogusSetup = new Target({
        ...target.toJson(),
        testConfig: {
          ...target.testConfig!,
          testSetUp: 'does-not-exist-setup.sas',
          testTearDown: 'does-not-exist-teardown.sas'
        }
      })

      const testFlow = await compileTestFlow(targetWithBogusSetup)

      expect(testFlow!.testSetUp).toBeUndefined()
      expect(testFlow!.testTearDown).toBeUndefined()
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
          ['tests', 'macros', 'testMacro.test.sas'].join('/'),
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

      const totalCalls = 16

      expect(process.logger.info).toHaveBeenCalledTimes(totalCalls)
      expect(process.logger.info).toHaveBeenNthCalledWith(13, `Test coverage:`)
      expect(process.logger.info).toHaveBeenNthCalledWith(
        14,
        `Services coverage: 0/4 (${chalk.greenBright('0%')})`
      )
      expect(process.logger.info).toHaveBeenNthCalledWith(
        totalCalls - 1,
        `Overall coverage: 0/4 (${chalk.greenBright('0%')})`
      )
    })

    it('should log a warning is testFolders was used in root or target configuration', async () => {
      const testTarget = {
        name: 'viya',
        serverUrl: '',
        serverType: ServerType.SasViya,
        appLoc: '/Public/sasjs/jobs',
        macroFolders: [],
        programFolders: [],
        binaryFolders: [],
        testConfig: {
          testSetUp: '',
          testTearDown: '',
          macroVars: {},
          initProgram: '',
          termProgram: '',
          testFolders: ['tests']
        }
      }
      const testConfig = {
        macroFolders: ['macros'],
        testConfig: {
          testFolders: ['tests']
        },
        defaultTarget: 'viya',
        targets: [testTarget]
      }
      const expectedWarn = `'testFolders' is not supported 'testConfig' entry, please use 'serviceFolders' entry in 'serviceConfig' or 'jobFolders' entry in 'jobConfig'.`

      jest.spyOn(process.logger, 'warn')

      compileTestFlow(testTarget as unknown as Target)

      expect(process.logger.warn).toHaveBeenCalledWith(expectedWarn)

      compileTestFlow(testTarget as unknown as Target)

      expect(process.logger.warn).toHaveBeenCalledWith(expectedWarn)
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
  await copy(
    path.join(__dirname, 'testFiles', 'macros'),
    path.join(__dirname, appName, 'sasjs', 'macros')
  )
}

const replaceLineBreaks = (str: string) =>
  str.replace(/(?:\r\n|\r|\n)/g, '<br>')

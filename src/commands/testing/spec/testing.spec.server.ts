import path from 'path'
import { runTest } from '../test'
import { TestDescription, TestResult } from '../../../types'
import {
  Logger,
  LogLevel,
  Target,
  ServerType,
  listFilesInFolder,
  copy,
  folderExists,
  fileExists,
  readFile,
  generateTimestamp
} from '@sasjs/utils'
import {
  createTestApp,
  removeTestApp,
  removeTestServerFolder
} from '../../../utils/test'
import { contextName } from '../../../utils'
import dotenv from 'dotenv'
import { build, deploy } from '../..'
import SASjs from '@sasjs/adapter/node'

describe('sasjs test', () => {
  const expectedCoverageLcov = `TN:testsetup.sas
SF:standalone
FNF:1
FNH:1
LF:1
LH:1
BRF:1
BRH:1
end_of_record
TN:exampleprogram.test.sas
SF:jobs/jobs/exampleprogram.sas
FNF:1
FNH:1
LF:1
LH:1
BRF:1
BRH:1
end_of_record
TN:standalone.test.sas
SF:standalone
FNF:1
FNH:1
LF:1
LH:1
BRF:1
BRH:1
end_of_record
TN:examplemacro.test.sas
SF:standalone
FNF:1
FNH:1
LF:1
LH:1
BRF:1
BRH:1
end_of_record
TN:shouldFail.test.sas
SF:standalone
FNF:1
FNH:1
LF:1
LH:1
BRF:1
BRH:1
end_of_record
TN:dostuff.test.0.sas
SF:services/admin/dostuff.sas
FNF:1
FNH:1
LF:1
LH:1
BRF:1
BRH:1
end_of_record
TN:dostuff.test.1.sas
SF:services/admin/dostuff.sas
FNF:1
FNH:1
LF:1
LH:1
BRF:1
BRH:1
end_of_record
TN:testteardown.sas
SF:standalone
FNF:1
FNH:1
LF:1
LH:1
BRF:1
BRH:1
end_of_record`

  describe('SASVIYA', () => {
    const target: Target = generateTarget()
    const testUrl = (test: string) =>
      `${target.serverUrl}/SASJobExecution/?_program=/Public/app/cli-tests/${
        target.name
      }/tests/${test}&_debug=2477&_contextName=${encodeURIComponent(
        target.contextName
      )}`
    const testUrlLink = (test: string) => `"=HYPERLINK(""${testUrl(test)}"")"`

    beforeAll(async () => {
      await createTestApp(__dirname, target.name)
      await copyTestFiles(target.name)
      await build(target)
      await deploy(target, false)

      process.logger = new Logger(LogLevel.Off)
    })

    afterAll(async () => {
      await removeTestServerFolder(
        `/Public/app/cli-tests/${target.name}`,
        target
      )
      await removeTestApp(__dirname, target.name)
    })

    it('should execute tests and create result CSV, XML and JSON files using default source and output locations', async () => {
      const expectedResultsJson = {
        sasjs_test_meta: [
          {
            test_target: 'testsetup',
            results: [
              {
                test_loc: 'tests/testsetup.sas',
                sasjs_test_id: '',
                result: 'not provided',
                test_url: testUrl('testsetup')
              }
            ]
          },
          {
            test_target: 'exampleprogram',
            results: [
              {
                test_loc: 'tests/jobs/jobs/exampleprogram.test.sas',
                sasjs_test_id: '',
                result: 'not provided',
                test_url: testUrl('jobs/jobs/exampleprogram.test')
              }
            ]
          },
          {
            test_target: 'standalone',
            results: [
              {
                test_loc: 'tests/jobs/jobs/standalone.test.sas',
                sasjs_test_id: '',
                result: 'not provided',
                test_url: testUrl('jobs/jobs/standalone.test')
              }
            ]
          },
          {
            test_target: 'examplemacro',
            results: [
              {
                test_loc: 'tests/macros/examplemacro.test.sas',
                sasjs_test_id: '',
                result: [
                  {
                    TEST_DESCRIPTION: 'examplemacro test.1 description',
                    TEST_RESULT: 'PASS'
                  }
                ],
                test_url: testUrl('macros/examplemacro.test')
              }
            ]
          },
          {
            test_target: 'dostuff',
            results: [
              {
                test_loc: 'tests/services/admin/dostuff.test.0.sas',
                sasjs_test_id: '',
                result: [
                  {
                    TEST_DESCRIPTION: 'dostuff 0 test description',
                    TEST_RESULT: 'FAIL'
                  }
                ],
                test_url: testUrl('services/admin/dostuff.test.0')
              },
              {
                test_loc: 'tests/services/admin/dostuff.test.1.sas',
                sasjs_test_id: '',
                result: [
                  {
                    TEST_DESCRIPTION: 'dostuff 1 test description',
                    TEST_RESULT: 'PASS'
                  }
                ],
                test_url: testUrl('services/admin/dostuff.test.1')
              }
            ]
          },
          {
            test_target: 'testteardown',
            results: [
              {
                test_loc: 'tests/testteardown.sas',
                sasjs_test_id: '',
                result: 'not provided',
                test_url: testUrl('testteardown')
              }
            ]
          }
        ]
      }
      const expectedResultsCsv = `test_target,test_loc,sasjs_test_id,test_suite_result,test_description,test_url
testsetup,tests/testsetup.sas,sasjs_test_id,not provided,,${testUrlLink(
        'testsetup'
      )}
exampleprogram,tests/jobs/jobs/exampleprogram.test.sas,sasjs_test_id,not provided,,${testUrlLink(
        'jobs/jobs/exampleprogram.test'
      )}
standalone,tests/jobs/jobs/standalone.test.sas,sasjs_test_id,not provided,,${testUrlLink(
        'jobs/jobs/standalone.test'
      )}
examplemacro,tests/macros/examplemacro.test.sas,sasjs_test_id,PASS,examplemacro test.1 description,${testUrlLink(
        'macros/examplemacro.test'
      )}
dostuff,tests/services/admin/dostuff.test.0.sas,sasjs_test_id,FAIL,dostuff 0 test description,${testUrlLink(
        'services/admin/dostuff.test.0'
      )}
dostuff,tests/services/admin/dostuff.test.1.sas,sasjs_test_id,PASS,dostuff 1 test description,${testUrlLink(
        'services/admin/dostuff.test.1'
      )}
testteardown,tests/testteardown.sas,sasjs_test_id,not provided,,${testUrlLink(
        'testteardown'
      )}
`

      await runTest(target)

      const resultsFolderPath = path.join(
        __dirname,
        target.name,
        'sasjsresults'
      )
      const resultsJsonPath = path.join(resultsFolderPath, 'testResults.json')

      await expect(folderExists(resultsFolderPath)).resolves.toEqual(true)
      await expect(fileExists(resultsJsonPath)).resolves.toEqual(true)

      const resultsJson = await readFile(resultsJsonPath)

      const resultsCsvPath = path.join(resultsFolderPath, 'testResults.csv')

      await expect(fileExists(resultsCsvPath)).resolves.toEqual(true)

      let parsedResults = JSON.parse(resultsJson)

      parsedResults.sasjs_test_meta = parsedResults.sasjs_test_meta.flatMap(
        (res: TestDescription) => ({
          ...res,
          results: res.results.map((r: TestResult) => ({
            ...r,
            sasjs_test_id: ''
          }))
        })
      )

      expect(parsedResults).toEqual(expectedResultsJson)

      let resultsCsv = await readFile(resultsCsvPath)
      resultsCsv = resultsCsv.replace(
        /\b[0-9a-f]{8}\b-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-\b[0-9a-f]{12}\b/g,
        'sasjs_test_id'
      )

      expect(resultsCsv).toEqual(expectedResultsCsv)

      const resultsXmlPath = path.join(resultsFolderPath, 'testResults.xml')

      await expect(fileExists(resultsXmlPath)).resolves.toEqual(true)

      let resultsXml = await readFile(resultsXmlPath)

      const expectedResultsXml = `<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<testsuites id="" name=\"SASjs Test Meta\" tests=\"7\" failures=\"5\">
  <testsuite id=\"testsetup\" name=\"testsetup\" tests=\"1\" failures=\"1\">
    <testcase id="">
      <failure>Status was not provided</failure>
    </testcase>
  </testsuite>
  <testsuite id=\"exampleprogram\" name=\"exampleprogram\" tests=\"1\" failures=\"1\">
    <testcase id="">
      <failure>Status was not provided</failure>
    </testcase>
  </testsuite>
  <testsuite id=\"standalone\" name=\"standalone\" tests=\"1\" failures=\"1\">
    <testcase id="">
      <failure>Status was not provided</failure>
    </testcase>
  </testsuite>
  <testsuite id=\"examplemacro\" name=\"examplemacro\" tests=\"1\" failures=\"0\">
    <testcase id=\"\">
    </testcase>
  </testsuite>
  <testsuite id=\"dostuff\" name=\"dostuff\" tests=\"2\" failures=\"1\">
    <testcase id="">
      <failure>Description: dostuff 0 test description</failure>
    </testcase>
    <testcase id="">
    </testcase>
  </testsuite>
  <testsuite id=\"testteardown\" name=\"testteardown\" tests=\"1\" failures=\"1\">
    <testcase id="">
      <failure>Status was not provided</failure>
    </testcase>
  </testsuite>
</testsuites>`

      resultsXml = resultsXml.replace(
        /testsuites id="[^ ]*"/gm,
        `testsuites id=""`
      )
      resultsXml = resultsXml.replace(/testcase id="[^ ]*"/gm, `testcase id=""`)

      expect(resultsXml).toEqual(expectedResultsXml)

      const coverageLcovPath = path.join(resultsFolderPath, 'coverage.lcov')

      await expect(fileExists(coverageLcovPath)).resolves.toEqual(true)

      const coverageLcov = await readFile(coverageLcovPath)

      expect(coverageLcov).toEqual(expectedCoverageLcov)
    })

    it('should execute filtered tests and create result CSV, XML and JSON files using custom source and output locations', async () => {
      const expectedResultsJson = {
        sasjs_test_meta: [
          {
            test_target: 'testsetup',
            results: [
              {
                test_loc: 'tests/testsetup.sas',
                sasjs_test_id: '',
                result: 'not provided',
                test_url: testUrl('testsetup')
              }
            ]
          },
          {
            test_target: 'standalone',
            results: [
              {
                test_loc: 'tests/jobs/jobs/standalone.test.sas',
                sasjs_test_id: '',
                result: 'not provided',
                test_url: testUrl('jobs/jobs/standalone.test')
              }
            ]
          },
          {
            test_target: 'dostuff',
            results: [
              {
                test_loc: 'tests/services/admin/dostuff.test.0.sas',
                sasjs_test_id: '',
                result: [
                  {
                    TEST_DESCRIPTION: 'dostuff 0 test description',
                    TEST_RESULT: 'FAIL'
                  }
                ],
                test_url: testUrl('services/admin/dostuff.test.0')
              }
            ]
          },
          {
            test_target: 'testteardown',
            results: [
              {
                test_loc: 'tests/testteardown.sas',
                sasjs_test_id: '',
                result: 'not provided',
                test_url: testUrl('testteardown')
              }
            ]
          }
        ]
      }
      const expectedResultsCsv = `test_target,test_loc,sasjs_test_id,test_suite_result,test_description,test_url
testsetup,tests/testsetup.sas,sasjs_test_id,not provided,,${testUrlLink(
        'testsetup'
      )}
standalone,tests/jobs/jobs/standalone.test.sas,sasjs_test_id,not provided,,${testUrlLink(
        'jobs/jobs/standalone.test'
      )}
dostuff,tests/services/admin/dostuff.test.0.sas,sasjs_test_id,FAIL,dostuff 0 test description,${testUrlLink(
        'services/admin/dostuff.test.0'
      )}
testteardown,tests/testteardown.sas,sasjs_test_id,not provided,,${testUrlLink(
        'testteardown'
      )}
`

      const outputFolder = 'customOutPut'
      const movedTestFlow = 'movedTestFlow.json'

      await copy(
        path.join(__dirname, target.name, 'sasjsbuild', 'testFlow.json'),
        path.join(__dirname, target.name, movedTestFlow)
      )

      await runTest(
        target,
        ['jobs/standalone', 'shouldFail', 'services/admin/dostuff.test.0'],
        outputFolder,
        movedTestFlow
      )

      const resultsFolderPath = path.join(__dirname, target.name, outputFolder)
      const resultsJsonPath = path.join(resultsFolderPath, 'testResults.json')

      await expect(folderExists(resultsFolderPath)).resolves.toEqual(true)
      await expect(fileExists(resultsJsonPath)).resolves.toEqual(true)

      const resultsJson = await readFile(resultsJsonPath)

      const resultsCsvPath = path.join(resultsFolderPath, 'testResults.csv')

      await expect(fileExists(resultsCsvPath)).resolves.toEqual(true)

      let parsedResults = JSON.parse(resultsJson)

      parsedResults.sasjs_test_meta = parsedResults.sasjs_test_meta.flatMap(
        (res: TestDescription) => ({
          ...res,
          results: res.results.map((r: TestResult) => ({
            ...r,
            sasjs_test_id: ''
          }))
        })
      )

      expect(parsedResults).toEqual(expectedResultsJson)

      let resultsCsv = await readFile(resultsCsvPath)
      resultsCsv = resultsCsv.replace(
        /\b[0-9a-f]{8}\b-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-\b[0-9a-f]{12}\b/g,
        'sasjs_test_id'
      )

      expect(resultsCsv).toEqual(expectedResultsCsv)

      const logFolder = path.join(resultsFolderPath, 'logs')

      const logPath = path.join(logFolder, 'macros_shouldFail.test.log')

      await expect(listFilesInFolder(logFolder)).resolves.toEqual([
        'jobs_jobs_standalone.test.log',
        'macros_shouldFail.test.log',
        'services_admin_dostuff.test.0.log',
        'testsetup.log',
        'testteardown.log'
      ])

      const log = await readFile(logPath)

      expect(log.length).toBeGreaterThan(0)

      const resultsXmlPath = path.join(resultsFolderPath, 'testResults.xml')

      await expect(fileExists(resultsXmlPath)).resolves.toEqual(true)

      let resultsXml = await readFile(resultsXmlPath)

      const expectedResultsXml = `<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<testsuites id=\"\" name=\"SASjs Test Meta\" tests=\"4\" failures=\"4\">
  <testsuite id=\"testsetup\" name=\"testsetup\" tests=\"1\" failures=\"1\">
    <testcase id=\"\">
      <failure>Status was not provided</failure>
    </testcase>
  </testsuite>
  <testsuite id=\"standalone\" name=\"standalone\" tests=\"1\" failures=\"1\">
    <testcase id=\"\">
      <failure>Status was not provided</failure>
    </testcase>
  </testsuite>
  <testsuite id=\"dostuff\" name=\"dostuff\" tests=\"1\" failures=\"1\">
    <testcase id=\"\">
      <failure>Description: dostuff 0 test description</failure>
    </testcase>
  </testsuite>
  <testsuite id=\"testteardown\" name=\"testteardown\" tests=\"1\" failures=\"1\">
    <testcase id=\"\">
      <failure>Status was not provided</failure>
    </testcase>
  </testsuite>
</testsuites>`

      resultsXml = resultsXml.replace(
        /testsuites id="[^ ]*"/gm,
        `testsuites id=""`
      )
      resultsXml = resultsXml.replace(/testcase id="[^ ]*"/gm, `testcase id=""`)

      expect(resultsXml).toEqual(expectedResultsXml)
    })
  })

  describe('SASJS', () => {
    const sasjs = new (<jest.Mock<SASjs>>SASjs)()
    const target: Target = generateTarget(ServerType.Sasjs)
    const testUrl = (test: string) =>
      `${target.serverUrl}/${
        target.serverType === ServerType.SasViya
          ? 'SASJobExecution'
          : 'SASStoredProcess'
      }/?_program=/Public/app/cli-tests/${
        target.name
      }/tests/${test}&_debug=2477&_contextName=${encodeURIComponent(
        target.contextName
      )}`
    const testUrlLink = (test: string) => `"=HYPERLINK(""${testUrl(test)}"")"`

    beforeAll(async () => {
      await createTestApp(__dirname, target.name)
      await copyTestFiles(target.name)
      await build(target)

      process.logger = new Logger(LogLevel.Off)
    })

    afterAll(async () => {
      await removeTestApp(__dirname, target.name)
    })

    it('should execute tests and create result CSV, XML and JSON files using default source and output locations', async () => {
      const testDescription = 'random test description'
      const testResult = 'PASS'
      const expectedResultsJson = {
        sasjs_test_meta: [
          {
            test_target: 'testsetup',
            results: [
              {
                test_loc: 'tests/testsetup.sas',
                sasjs_test_id: '',
                result: [
                  {
                    TEST_DESCRIPTION: testDescription,
                    TEST_RESULT: testResult
                  }
                ],
                test_url: testUrl('testsetup')
              }
            ]
          },
          {
            test_target: 'exampleprogram',
            results: [
              {
                test_loc: 'tests/jobs/jobs/exampleprogram.test.sas',
                sasjs_test_id: '',
                result: [
                  {
                    TEST_DESCRIPTION: testDescription,
                    TEST_RESULT: testResult
                  }
                ],
                test_url: testUrl('jobs/jobs/exampleprogram.test')
              }
            ]
          },
          {
            test_target: 'standalone',
            results: [
              {
                test_loc: 'tests/jobs/jobs/standalone.test.sas',
                sasjs_test_id: '',
                result: [
                  {
                    TEST_DESCRIPTION: testDescription,
                    TEST_RESULT: testResult
                  }
                ],
                test_url: testUrl('jobs/jobs/standalone.test')
              }
            ]
          },
          {
            test_target: 'examplemacro',
            results: [
              {
                test_loc: 'tests/macros/examplemacro.test.sas',
                sasjs_test_id: '',
                result: [
                  {
                    TEST_DESCRIPTION: testDescription,
                    TEST_RESULT: testResult
                  }
                ],
                test_url: testUrl('macros/examplemacro.test')
              }
            ]
          },
          {
            test_target: 'shouldFail',
            results: [
              {
                test_loc: 'tests/macros/shouldFail.test.sas',
                sasjs_test_id: '',
                result: [
                  {
                    TEST_DESCRIPTION: testDescription,
                    TEST_RESULT: testResult
                  }
                ],
                test_url: testUrl('macros/shouldFail.test')
              }
            ]
          },
          {
            test_target: 'dostuff',
            results: [
              {
                test_loc: 'tests/services/admin/dostuff.test.0.sas',
                sasjs_test_id: '',
                result: [
                  {
                    TEST_DESCRIPTION: testDescription,
                    TEST_RESULT: testResult
                  }
                ],
                test_url: testUrl('services/admin/dostuff.test.0')
              },
              {
                test_loc: 'tests/services/admin/dostuff.test.1.sas',
                sasjs_test_id: '',
                result: [
                  {
                    TEST_DESCRIPTION: testDescription,
                    TEST_RESULT: testResult
                  }
                ],
                test_url: testUrl('services/admin/dostuff.test.1')
              }
            ]
          },
          {
            test_target: 'testteardown',
            results: [
              {
                test_loc: 'tests/testteardown.sas',
                sasjs_test_id: '',
                result: [
                  {
                    TEST_DESCRIPTION: testDescription,
                    TEST_RESULT: testResult
                  }
                ],
                test_url: testUrl('testteardown')
              }
            ]
          }
        ]
      }
      const expectedResultsCsv = `test_target,test_loc,sasjs_test_id,test_suite_result,test_description,test_url
testsetup,tests/testsetup.sas,sasjs_test_id,${testResult},${testDescription},${testUrlLink(
        'testsetup'
      )}
exampleprogram,tests/jobs/jobs/exampleprogram.test.sas,sasjs_test_id,${testResult},${testDescription},${testUrlLink(
        'jobs/jobs/exampleprogram.test'
      )}
standalone,tests/jobs/jobs/standalone.test.sas,sasjs_test_id,${testResult},${testDescription},${testUrlLink(
        'jobs/jobs/standalone.test'
      )}
examplemacro,tests/macros/examplemacro.test.sas,sasjs_test_id,${testResult},${testDescription},${testUrlLink(
        'macros/examplemacro.test'
      )}
shouldFail,tests/macros/shouldFail.test.sas,sasjs_test_id,${testResult},${testDescription},${testUrlLink(
        'macros/shouldFail.test'
      )}
dostuff,tests/services/admin/dostuff.test.0.sas,sasjs_test_id,${testResult},${testDescription},${testUrlLink(
        'services/admin/dostuff.test.0'
      )}
dostuff,tests/services/admin/dostuff.test.1.sas,sasjs_test_id,${testResult},${testDescription},${testUrlLink(
        'services/admin/dostuff.test.1'
      )}
testteardown,tests/testteardown.sas,sasjs_test_id,${testResult},${testDescription},${testUrlLink(
        'testteardown'
      )}
`

      jest.spyOn(sasjs, 'executeJobSASjs').mockImplementation(() =>
        Promise.resolve({
          status: 'success',
          _webout:
            '{"test_results":\r\n' +
            '[\r\n' +
            `{"TEST_DESCRIPTION":"${testDescription}" ,"TEST_RESULT":"${testResult}" }\r\n` +
            ']}',
          log:
            '1                                          The SAS System             11:42 Friday, February 11, 2022\r\n' +
            '\r\n' +
            'NOTE: Copyright (c) 2016 by SAS Institute Inc., Cary, NC, USA. \r\n' +
            'NOTE: This session is executing on the X64_10PRO  platform.\r\n',
          message: 'success'
        })
      )

      await runTest(target, undefined, undefined, undefined, sasjs)

      const resultsFolderPath = path.join(
        __dirname,
        target.name,
        'sasjsresults'
      )
      const resultsJsonPath = path.join(resultsFolderPath, 'testResults.json')

      await expect(folderExists(resultsFolderPath)).resolves.toEqual(true)
      await expect(fileExists(resultsJsonPath)).resolves.toEqual(true)

      const resultsJson = await readFile(resultsJsonPath)

      const resultsCsvPath = path.join(resultsFolderPath, 'testResults.csv')

      await expect(fileExists(resultsCsvPath)).resolves.toEqual(true)

      let parsedResults = JSON.parse(resultsJson)

      parsedResults.sasjs_test_meta = parsedResults.sasjs_test_meta.flatMap(
        (res: TestDescription) => ({
          ...res,
          results: res.results.map((r: TestResult) => ({
            ...r,
            sasjs_test_id: ''
          }))
        })
      )

      expect(parsedResults).toEqual(expectedResultsJson)

      let resultsCsv = await readFile(resultsCsvPath)
      resultsCsv = resultsCsv.replace(
        /\b[0-9a-f]{8}\b-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-\b[0-9a-f]{12}\b/g,
        'sasjs_test_id'
      )

      expect(resultsCsv).toEqual(expectedResultsCsv)

      const resultsXmlPath = path.join(resultsFolderPath, 'testResults.xml')

      await expect(fileExists(resultsXmlPath)).resolves.toEqual(true)

      let resultsXml = await readFile(resultsXmlPath)

      const expectedResultsXml = `<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<testsuites id="" name=\"SASjs Test Meta\" tests=\"8\" failures=\"0\">
  <testsuite id=\"testsetup\" name=\"testsetup\" tests=\"1\" failures=\"0\">
    <testcase id="">
    </testcase>
  </testsuite>
  <testsuite id=\"exampleprogram\" name=\"exampleprogram\" tests=\"1\" failures=\"0\">
    <testcase id="">
    </testcase>
  </testsuite>
  <testsuite id=\"standalone\" name=\"standalone\" tests=\"1\" failures=\"0\">
    <testcase id="">
    </testcase>
  </testsuite>
  <testsuite id=\"examplemacro\" name=\"examplemacro\" tests=\"1\" failures=\"0\">
    <testcase id=\"\">
    </testcase>
  </testsuite>
  <testsuite id=\"shouldFail\" name=\"shouldFail\" tests=\"1\" failures=\"0\">
    <testcase id=\"\">
    </testcase>
  </testsuite>
  <testsuite id=\"dostuff\" name=\"dostuff\" tests=\"2\" failures=\"0\">
    <testcase id="">
    </testcase>
    <testcase id="">
    </testcase>
  </testsuite>
  <testsuite id=\"testteardown\" name=\"testteardown\" tests=\"1\" failures=\"0\">
    <testcase id="">
    </testcase>
  </testsuite>
</testsuites>`

      resultsXml = resultsXml.replace(
        /testsuites id="[^ ]*"/gm,
        `testsuites id=""`
      )
      resultsXml = resultsXml.replace(/testcase id="[^ ]*"/gm, `testcase id=""`)

      expect(resultsXml).toEqual(expectedResultsXml)

      const coverageLcovPath = path.join(resultsFolderPath, 'coverage.lcov')

      await expect(fileExists(coverageLcovPath)).resolves.toEqual(true)

      const coverageLcov = await readFile(coverageLcovPath)

      expect(coverageLcov).toEqual(expectedCoverageLcov)
    })
  })
})

function generateTarget(serverType = ServerType.SasViya): Target {
  dotenv.config()

  const timestamp = generateTimestamp()
  const targetName = `cli-tests-test-command-${timestamp}`

  return new Target({
    name: targetName,
    serverType,
    serverUrl: (serverType === ServerType.SasViya
      ? process.env.VIYA_SERVER_URL
      : serverType === ServerType.Sas9
      ? process.env.SAS9_SERVER_URL
      : process.env.SASJS_SERVER_URL) as string,
    appLoc: `/Public/app/cli-tests/${targetName}`,
    contextName,
    macroFolders: ['sasjs/macros'],
    serviceConfig: {
      serviceFolders: [],
      initProgram: 'sasjs/build/serviceinit.sas',
      termProgram: 'sasjs/build/serviceterm.sas',
      macroVars: {
        name: 'viyavalue',
        extravar: 'this too'
      }
    },
    jobConfig: {
      jobFolders: ['sasjs/jobs'],
      initProgram: '',
      termProgram: '',
      macroVars: {}
    },
    authConfig: {
      client: process.env.CLIENT as string,
      secret: process.env.SECRET as string,
      access_token: process.env.ACCESS_TOKEN as string,
      refresh_token: process.env.REFRESH_TOKEN as string
    },
    deployConfig: {
      deployServicePack: true,
      deployScripts: []
    },
    testConfig: {
      initProgram: path.join('sasjs', 'tests', 'testinit.sas'),
      termProgram: path.join('sasjs', 'tests', 'testterm.sas'),
      macroVars: {
        testVar: 'testValue'
      },
      testSetUp: path.join('sasjs', 'tests', 'testsetup.sas'),
      testTearDown: path.join('sasjs', 'tests', 'testteardown.sas')
    }
  })
}

const copyTestFiles = async (appName: string) => {
  await copy(
    path.join(__dirname, 'testServicesFiles'),
    path.join(__dirname, appName, 'sasjs', 'services', 'admin')
  )
  await copy(
    path.join(__dirname, 'testJobsFiles'),
    path.join(__dirname, appName, 'sasjs', 'jobs')
  )
  await copy(
    path.join(__dirname, 'testFiles'),
    path.join(__dirname, appName, 'sasjs', 'tests')
  )
  await copy(
    path.join(__dirname, 'testMacros'),
    path.join(__dirname, appName, 'sasjs', 'macros')
  )
}

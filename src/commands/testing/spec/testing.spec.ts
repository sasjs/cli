import path from 'path'
import { runTest, getTestUrl } from '../test'
import { TestDescription, TestResult, TestResultStatus } from '../../../types'
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
import { createTestApp, removeTestApp } from '../../../utils/test'
import { contextName } from '../../../utils/setConstants'
import dotenv from 'dotenv'
import { build } from '../..'
import SASjs, { SASjsConfig } from '@sasjs/adapter/node'
import * as sasJsModules from '../../../utils/createSASjsInstance'
import { testResponses } from './mockedAdapter/testResponses'
import * as fileModule from '@sasjs/utils/file'
import * as utilsModule from '@sasjs/utils/utils'
import * as configUtils from '../../../utils/config'
import chalk from 'chalk'
import { mockAuthConfig } from '../../context/spec/mocks'

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

      process.logger = new Logger(LogLevel.Off)
    })

    beforeEach(() => {
      setupMocksForSASVIYA()
    })

    afterAll(async () => {
      await removeTestApp(__dirname, target.name)
    })

    it('should execute tests and create result CSV, XML and JSON files using default source and output locations', async () => {
      const resultsFolderPath = path.join(
        __dirname,
        target.name,
        'sasjsresults'
      )
      const resultsJsonPath = path.join(resultsFolderPath, 'testResults.json')
      const resultsCsvPath = path.join(resultsFolderPath, 'testResults.csv')
      const resultsXmlPath = path.join(resultsFolderPath, 'testResults.xml')
      const coverageReportPath = path.join(resultsFolderPath, 'coverage.lcov')

      const expectedResultsJson = {
        csv_result_path: resultsCsvPath,
        xml_result_path: resultsXmlPath,
        coverage_report_path: coverageReportPath,
        tests_that_pass: '2/7 (29%)',
        tests_with_results: '7/8 (88%)',
        target_name: target.name,
        target_server_url: target.serverUrl,
        target_server_type: target.serverType,
        local_date_time: expect.anything(),
        local_user_id: expect.anything(),
        local_machine_name: expect.anything(),
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
      )}`

      await runTest(target, undefined, undefined, undefined, true)

      await expect(folderExists(resultsFolderPath)).resolves.toEqual(true)
      await expect(fileExists(resultsJsonPath)).resolves.toEqual(true)

      const resultsJson = await readFile(resultsJsonPath)

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
      const outputFolder = 'customOutPut'
      const movedTestFlow = 'movedTestFlow.json'

      await copy(
        path.join(__dirname, target.name, 'sasjsbuild', 'testFlow.json'),
        path.join(__dirname, target.name, movedTestFlow)
      )

      const resultsFolderPath = path.join(__dirname, target.name, outputFolder)
      const resultsJsonPath = path.join(resultsFolderPath, 'testResults.json')
      const resultsCsvPath = path.join(resultsFolderPath, 'testResults.csv')
      const resultsXmlPath = path.join(resultsFolderPath, 'testResults.xml')
      const coverageReportPath = path.join(resultsFolderPath, 'coverage.lcov')

      const expectedResultsJson = {
        csv_result_path: resultsCsvPath,
        xml_result_path: resultsXmlPath,
        coverage_report_path: coverageReportPath,
        tests_that_pass: '0/4 (0%)',
        tests_with_results: '4/5 (80%)',
        target_name: target.name,
        target_server_url: target.serverUrl,
        target_server_type: target.serverType,
        local_date_time: expect.anything(),
        local_user_id: expect.anything(),
        local_machine_name: expect.anything(),
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
      )}`

      await runTest(
        target,
        ['jobs/standalone', 'shouldFail', 'services/admin/dostuff.test.0'],
        outputFolder,
        movedTestFlow,
        true
      )

      await expect(folderExists(resultsFolderPath)).resolves.toEqual(true)
      await expect(fileExists(resultsJsonPath)).resolves.toEqual(true)

      const resultsJson = await readFile(resultsJsonPath)

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
    const target: Target = generateTarget(ServerType.Sasjs)

    const testUrl = (test: string) =>
      `${getTestUrl(
        target,
        `/Public/app/cli-tests/${target.name}/tests/${test}`
      )}&_contextName=${encodeURIComponent(target.contextName)}`
    const testUrlLink = (test: string) => `"=HYPERLINK(""${testUrl(test)}"")"`

    beforeAll(async () => {
      await createTestApp(__dirname, target.name)
      await copyTestFiles(target.name)
      await build(target)

      process.logger = new Logger(LogLevel.Off)
    })

    beforeEach(() => {
      setupMocksForSASJS()
    })

    afterAll(async () => {
      await removeTestApp(__dirname, target.name)
    })

    it('should execute tests and create result CSV, XML and JSON files using default source and output locations', async () => {
      const resultsFolderPath = path.join(
        __dirname,
        target.name,
        'sasjsresults'
      )
      const resultsJsonPath = path.join(resultsFolderPath, 'testResults.json')
      const resultsCsvPath = path.join(resultsFolderPath, 'testResults.csv')
      const resultsXmlPath = path.join(resultsFolderPath, 'testResults.xml')
      const coverageReportPath = path.join(resultsFolderPath, 'coverage.lcov')

      const expectedResultsJson = {
        csv_result_path: resultsCsvPath,
        xml_result_path: resultsXmlPath,
        coverage_report_path: coverageReportPath,
        tests_that_pass: '2/8 (25%)',
        tests_with_results: '8/8 (100%)',
        target_name: target.name,
        target_server_url: target.serverUrl,
        target_server_type: target.serverType,
        local_date_time: expect.anything(),
        local_user_id: expect.anything(),
        local_machine_name: expect.anything(),
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
            test_target: 'shouldFail',
            results: [
              {
                test_loc: 'tests/macros/shouldFail.test.sas',
                sasjs_test_id: '',
                result: 'not provided',
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
shouldFail,tests/macros/shouldFail.test.sas,sasjs_test_id,not provided,,${testUrlLink(
        'macros/shouldFail.test'
      )}
dostuff,tests/services/admin/dostuff.test.0.sas,sasjs_test_id,FAIL,dostuff 0 test description,${testUrlLink(
        'services/admin/dostuff.test.0'
      )}
dostuff,tests/services/admin/dostuff.test.1.sas,sasjs_test_id,PASS,dostuff 1 test description,${testUrlLink(
        'services/admin/dostuff.test.1'
      )}
testteardown,tests/testteardown.sas,sasjs_test_id,not provided,,${testUrlLink(
        'testteardown'
      )}`

      await runTest(target, undefined, undefined, undefined, true)

      await expect(folderExists(resultsFolderPath)).resolves.toEqual(true)
      await expect(fileExists(resultsJsonPath)).resolves.toEqual(true)

      const resultsJson = await readFile(resultsJsonPath)

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

      await expect(fileExists(resultsXmlPath)).resolves.toEqual(true)

      let resultsXml = await readFile(resultsXmlPath)

      const expectedResultsXml = `<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<testsuites id="" name=\"SASjs Test Meta\" tests=\"8\" failures=\"6\">
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
  <testsuite id="shouldFail" name="shouldFail" tests="1" failures="1">
    <testcase id="">
      <failure>Status was not provided</failure>
    </testcase>
  </testsuite>
  <testsuite id=\"dostuff\" name=\"dostuff\" tests=\"2\" failures=\"1\">
    <testcase id="">
      <failure>Description: dostuff 0 test description</failure>
    </testcase>
    <testcase id="">
    </testcase>
  </testsuite>
  <testsuite id="testteardown" name="testteardown" tests="1" failures="1">
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

    it('should FAIL test suit if any test has status FAIL', async () => {
      const testService = 'notexisting'

      jest.spyOn(process.logger, 'table')
      jest.spyOn(utilsModule, 'uuidv4').mockImplementation(() => 'uuidv4')
      jest.spyOn(fileModule, 'readFile').mockImplementation(() =>
        Promise.resolve(`{
  "tests": [
    "tests/macros/${testService}.test.sas"
  ],
  "testSetUp": "",
  "testTearDown": ""
}`)
      )

      await runTest(target, undefined, undefined, undefined, true)

      expect(process.logger.table).toHaveBeenCalledWith(
        [['uuidv4', testService, chalk.redBright(TestResultStatus.fail)]],
        { head: ['SASjs Test ID', 'Test Target', 'Test Suite Result'] }
      )
    })

    it('should fail on tests failing', async () => {
      const error = await runTest(target).catch((err: any) => {
        return err
      })

      expect(error).toEqual('6 tests completed with failures!')
    })

    it('should not throw error on tests failing', async () => {
      const error = await runTest(
        target,
        undefined,
        undefined,
        undefined,
        true
      ).catch((err: any) => {
        return err
      })

      expect(error).toBeUndefined()
    })
  })
})

function generateTarget(serverType = ServerType.SasViya): Target {
  dotenv.config()

  const timestamp = generateTimestamp()
  const targetName = `cli-tests-test-command-${serverType}-${timestamp}`

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

const setupMocksForSASVIYA = () => {
  jest
    .spyOn(configUtils, 'getAuthConfig')
    .mockImplementation(() => Promise.resolve(mockAuthConfig))

  jest
    .spyOn(sasJsModules, 'createSASjsInstance')
    .mockImplementation((config: Partial<SASjsConfig>) => {
      return {
        request: async (sasJob: string) => {
          const testName = sasJob.split('/').pop() || ''

          if (testName === 'shouldFail.test') {
            throw {
              errorCode: 404,
              error: { details: { result: 'some log from server' } }
            }
          }

          return {
            result: { test_results: testResponses[testName] },
            log: 'some log from server'
          }
        }
      } as unknown as SASjs
    })
}

const setupMocksForSASJS = () => {
  jest
    .spyOn(sasJsModules, 'createSASjsInstance')
    .mockImplementation((config: Partial<SASjsConfig>) => {
      return {
        request: async (sasJob: string) => {
          const testName = sasJob.split('/').pop() || ''
          const test_results = testResponses[testName]
          return { result: { test_results } }
        }
      } as unknown as SASjs
    })
}

import { runTest } from '..'
import { compileBuildDeployServices } from '../../../main'
import { folder } from '../../folder/index'
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
import { createTestApp, removeTestApp } from '../../../utils/test'
import { Command } from '../../../utils/command'
import {
  removeFromGlobalConfig,
  saveToGlobalConfig
} from '../../../utils/config'
import dotenv from 'dotenv'
import path from 'path'

describe('sasjs test', () => {
  let target: Target
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
    target = await createGlobalTarget()

    await createTestApp(__dirname, target.name)
    await copyTestFiles(target.name)
    await compileBuildDeployServices(new Command(`cbd -t ${target.name} -f`))

    process.logger = new Logger(LogLevel.Off)
  })

  afterAll(async () => {
    await folder(
      new Command(
        `folder delete /Public/app/cli-tests/${target.name} -t ${target.name}`
      )
    )
    await removeTestApp(__dirname, target.name)
    await removeFromGlobalConfig(target.name)
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

    const resultsFolderPath = path.join(__dirname, target.name, 'sasjsresults')
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

    await runTest(target, [
      'jobs/standalone',
      'shouldFail',
      'services/admin/dostuff.test.0',
      outputFolder,
      movedTestFlow
    ])

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

const createGlobalTarget = async (serverType = ServerType.SasViya) => {
  dotenv.config()

  const timestamp = generateTimestamp()
  const targetName = `cli-tests-test-command-${timestamp}`

  const target = new Target({
    name: targetName,
    serverType,
    serverUrl: (serverType === ServerType.SasViya
      ? process.env.VIYA_SERVER_URL
      : process.env.SAS9_SERVER_URL) as string,
    appLoc: `/Public/app/cli-tests/${targetName}`,
    contextName: process.sasjsConstants.contextName,
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

  await saveToGlobalConfig(target)

  return target
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

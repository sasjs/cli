import { runTest } from '../'
import { compileBuildDeployServices } from '../../../main'
import { folder } from '../../folder/index'
import { TestDescription, TestResult } from '../../../types'
import { Target, ServerType } from '@sasjs/utils/types'
import { Logger, LogLevel } from '@sasjs/utils/logger'
import { createTestApp, removeTestApp } from '../../../utils/test'
import { copy, folderExists, fileExists, readFile } from '../../../utils/file'
import { Command } from '../../../utils/command'
import { generateTimestamp } from '../../../utils/utils'
import {
  removeFromGlobalConfig,
  saveToGlobalConfig
} from '../../../utils/config'
import dotenv from 'dotenv'
import path from 'path'

describe('sasjs test', () => {
  let target: Target

  beforeAll(async (done) => {
    target = await createGlobalTarget()

    await createTestApp(__dirname, target.name)
    await copyTestFiles(target.name)
    await compileBuildDeployServices(new Command(`cbd -t ${target.name} -f`))

    process.logger = new Logger(LogLevel.Off)

    done()
  })

  afterAll(async (done) => {
    await folder(
      new Command(
        `folder delete /Public/app/cli-tests/${target.name} -t ${target.name}`
      )
    )
    await removeTestApp(__dirname, target.name)
    await removeFromGlobalConfig(target.name)

    done()
  })

  it('should execute tests and create result CSV and JSON files using default source and output locations', async () => {
    const expectedResultsJSON = {
      sasjs_test_meta: [
        {
          test_target: 'testsetup',
          results: [
            {
              test_loc: 'tests/testsetup.sas',
              sasjs_test_id: '',
              result: 'not provided'
            }
          ]
        },
        {
          test_target: 'exampleprogram',
          results: [
            {
              test_loc: 'tests/jobs/jobs/exampleprogram.test.sas',
              sasjs_test_id: '',
              result: 'not provided'
            }
          ]
        },
        {
          test_target: 'standalone',
          results: [
            {
              test_loc: 'tests/jobs/jobs/standalone.test.sas',
              sasjs_test_id: '',
              result: 'not provided'
            }
          ]
        },
        {
          test_target: 'examplemacro',
          results: [
            {
              test_loc: 'tests/macros/macros/examplemacro.test.sas',
              sasjs_test_id: '',
              result: [
                {
                  TEST_DESCRIPTION: 'examplemacro test.1 description',
                  TEST_RESULT: 'PASS'
                }
              ]
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
              ]
            },
            {
              test_loc: 'tests/services/admin/dostuff.test.1.sas',
              sasjs_test_id: '',
              result: [
                {
                  TEST_DESCRIPTION: 'dostuff 1 test description',
                  TEST_RESULT: 'PASS'
                }
              ]
            }
          ]
        },
        {
          test_target: 'testteardown',
          results: [
            {
              test_loc: 'tests/testteardown.sas',
              sasjs_test_id: '',
              result: 'not provided'
            }
          ]
        }
      ]
    }
    const expectedResultsCSV = `test_target,test_loc,sasjs_test_id,test_suite_result,test_description
testsetup,tests/testsetup.sas,sasjs_test_id,not provided,
exampleprogram,tests/jobs/jobs/exampleprogram.test.sas,sasjs_test_id,not provided,
standalone,tests/jobs/jobs/standalone.test.sas,sasjs_test_id,not provided,
examplemacro,tests/macros/macros/examplemacro.test.sas,sasjs_test_id,PASS,examplemacro test.1 description
dostuff,tests/services/admin/dostuff.test.0.sas,sasjs_test_id,FAIL,dostuff 0 test description
dostuff,tests/services/admin/dostuff.test.1.sas,sasjs_test_id,PASS,dostuff 1 test description
testteardown,tests/testteardown.sas,sasjs_test_id,not provided,
`

    const command = new Command(`test -t ${target.name}`)

    await runTest(command)

    const resultsFolderPath = path.join(__dirname, target.name, 'sasjsresults')
    const resultsJSONPath = path.join(resultsFolderPath, 'testResults.json')

    await expect(folderExists(resultsFolderPath)).resolves.toEqual(true)
    await expect(fileExists(resultsJSONPath)).resolves.toEqual(true)

    const resultsJSON = await readFile(resultsJSONPath)

    const resultsCSVPath = path.join(resultsFolderPath, 'testResults.csv')

    await expect(fileExists(resultsCSVPath)).resolves.toEqual(true)

    let parsedResults = JSON.parse(resultsJSON)

    parsedResults.sasjs_test_meta = parsedResults.sasjs_test_meta.flatMap(
      (res: TestDescription) => ({
        ...res,
        results: res.results.map((r: TestResult) => ({
          ...r,
          sasjs_test_id: ''
        }))
      })
    )

    expect(parsedResults).toEqual(expectedResultsJSON)

    let resultsCSV = await readFile(resultsCSVPath)
    resultsCSV = resultsCSV.replace(
      /\b[0-9a-f]{8}\b-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-\b[0-9a-f]{12}\b/g,
      'sasjs_test_id'
    )

    expect(resultsCSV).toEqual(expectedResultsCSV)
  })

  it('should execute filtered tests and create result CSV and JSON files using custom source and output locations', async () => {
    const expectedResultsJSON = {
      sasjs_test_meta: [
        {
          test_target: 'testsetup',
          results: [
            {
              test_loc: 'tests/testsetup.sas',
              sasjs_test_id: '',
              result: 'not provided'
            }
          ]
        },
        {
          test_target: 'standalone',
          results: [
            {
              test_loc: 'tests/jobs/jobs/standalone.test.sas',
              sasjs_test_id: '',
              result: 'not provided'
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
              ]
            }
          ]
        },
        {
          test_target: 'testteardown',
          results: [
            {
              test_loc: 'tests/testteardown.sas',
              sasjs_test_id: '',
              result: 'not provided'
            }
          ]
        }
      ]
    }
    const expectedResultsCSV = `test_target,test_loc,sasjs_test_id,test_suite_result,test_description
testsetup,tests/testsetup.sas,sasjs_test_id,not provided,
standalone,tests/jobs/jobs/standalone.test.sas,sasjs_test_id,not provided,
dostuff,tests/services/admin/dostuff.test.0.sas,sasjs_test_id,FAIL,dostuff 0 test description
testteardown,tests/testteardown.sas,sasjs_test_id,not provided,
`

    const outputFolder = 'customOutPut'
    const movedTestFlow = 'movedTestFlow.json'

    await copy(
      path.join(__dirname, target.name, 'sasjsbuild', 'testFlow.json'),
      path.join(__dirname, target.name, movedTestFlow)
    )

    const command = new Command(
      `test jobs/standalone shouldFail services/admin/dostuff.test.0 -t ${target.name} -s ${movedTestFlow} -o ${outputFolder}`
    )

    await runTest(command)

    const resultsFolderPath = path.join(__dirname, target.name, outputFolder)
    const resultsJSONPath = path.join(resultsFolderPath, 'testResults.json')

    await expect(folderExists(resultsFolderPath)).resolves.toEqual(true)
    await expect(fileExists(resultsJSONPath)).resolves.toEqual(true)

    const resultsJSON = await readFile(resultsJSONPath)

    const resultsCSVPath = path.join(resultsFolderPath, 'testResults.csv')

    await expect(fileExists(resultsCSVPath)).resolves.toEqual(true)

    let parsedResults = JSON.parse(resultsJSON)

    parsedResults.sasjs_test_meta = parsedResults.sasjs_test_meta.flatMap(
      (res: TestDescription) => ({
        ...res,
        results: res.results.map((r: TestResult) => ({
          ...r,
          sasjs_test_id: ''
        }))
      })
    )

    expect(parsedResults).toEqual(expectedResultsJSON)

    let resultsCSV = await readFile(resultsCSVPath)
    resultsCSV = resultsCSV.replace(
      /\b[0-9a-f]{8}\b-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-\b[0-9a-f]{12}\b/g,
      'sasjs_test_id'
    )

    expect(resultsCSV).toEqual(expectedResultsCSV)

    const logPath = path.join(
      resultsFolderPath,
      'logs',
      'macros_macros_shouldFail.test.log'
    )

    await expect(fileExists(logPath)).resolves.toEqual(true)

    const log = await readFile(logPath)

    expect(log.length).toBeGreaterThan(0)
  })
})

const createGlobalTarget = async () => {
  dotenv.config()

  const timestamp = generateTimestamp()
  const targetName = `cli-tests-test-command-${timestamp}`

  const serverType: ServerType =
    process.env.SERVER_TYPE === ServerType.SasViya
      ? ServerType.SasViya
      : ServerType.Sas9

  const target = new Target({
    name: targetName,
    serverType,
    serverUrl: process.env.SERVER_URL as string,
    appLoc: `/Public/app/cli-tests/${targetName}`,
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
      initProgram: 'sasjs/tests/testinit.sas',
      termProgram: 'sasjs/tests/testterm.sas',
      macroVars: {
        testVar: 'testValue'
      },
      testSetUp: 'sasjs/tests/testsetup.sas',
      testTearDown: 'sasjs/tests/testteardown.sas'
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

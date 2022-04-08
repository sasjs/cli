import {
  saveLog,
  saveResultJson,
  saveResultCsv,
  saveResultXml,
  saveCoverageLcov
} from './internal/saveOutput'
import {
  TestFlow,
  TestResults,
  TestResultStatus,
  TestDescription,
  TestResultCsv
} from '../../types'
import { sasFileRegExp } from '../../utils/file'
import { getAuthConfig } from '../../utils/config'
import { displayError, displaySuccess } from '../../utils/displayResult'
import {
  ServerType,
  uuidv4,
  asyncForEach,
  readFile,
  AuthConfig,
  decodeFromBase64,
  Target
} from '@sasjs/utils'
import path from 'path'
import chalk from 'chalk'
import { displaySasjsRunnerError } from '../../utils/utils'
import { createSASjsInstance } from '../../utils/createSASjsInstance'

// interface

export async function runTest(
  target: Target,
  testRegExps: string[] = [],
  outDirectory?: string,
  flowSourcePath?: string,
  ignoreFail?: boolean
) {
  if (outDirectory) outDirectory = path.join(process.currentDir, outDirectory)
  else outDirectory = process.sasjsConstants.buildDestinationResultsFolder

  if (!target) {
    return Promise.reject(
      'Target not found! Please try again with another target.'
    )
  }

  flowSourcePath = flowSourcePath
    ? path.join(process.currentDir, flowSourcePath)
    : path.join(process.sasjsConstants.buildDestinationFolder, 'testFlow.json')

  const testFlowData = await readFile(flowSourcePath).catch((_) => {
    return Promise.reject(`Test flow file was not found at ${flowSourcePath}`)
  })

  if (!testFlowData) return

  let testFlow: TestFlow = { tests: [] }

  try {
    testFlow = JSON.parse(testFlowData)
  } catch (error) {
    return Promise.reject(`Provided test flow file is not valid.`)
  }

  let flow = []

  if (testFlow.testSetUp) flow.push(testFlow.testSetUp)

  if (testFlow.tests) {
    flow = [
      ...flow,
      ...testFlow.tests.filter((test: string) => {
        if (!testRegExps.length) return true

        let match = false

        for (const pattern of testRegExps) {
          if (new RegExp(pattern).test(test)) match = true
        }

        return match
      })
    ]
  }

  if (testFlow.testTearDown) flow.push(testFlow.testTearDown)

  const sasjs = createSASjsInstance({
    serverUrl: target.serverUrl,
    httpsAgentOptions: target.httpsAgentOptions,
    appLoc: target.appLoc,
    serverType: target.serverType,
    debug: true,
    contextName: target.contextName,
    useComputeApi: false
  })

  let authConfig: AuthConfig, username: string, password: string

  switch (target.serverType) {
    case ServerType.SasViya:
      authConfig = await getAuthConfig(target)

      break
    case ServerType.Sas9:
      if (target.authConfigSas9) {
        username = target.authConfigSas9.userName
        password = target.authConfigSas9.password
      } else {
        username = process.env.SAS_USERNAME as string
        password = process.env.SAS_PASSWORD as string
      }

      if (!username || !password) {
        const { sas9CredentialsError } = process.sasjsConstants
        throw new Error(sas9CredentialsError)
      }

      password = decodeFromBase64(password)

      break
    case ServerType.Sasjs:
      try {
        authConfig = await getAuthConfig(target)
      } catch (e) {} // FIXME: handle error properly

      break
  }

  const result: TestResults = {
    sasjs_test_meta: []
  }

  let isCodeExamplePrinted = false

  const printCodeExample = () => {
    if (!isCodeExamplePrinted) {
      process.logger?.info(`Code example to provide output:
  data work.test_results;
    test_description="some description";
    test_result="PASS";
    output;
  run;
  %webout(OPEN)
  %webout(OBJ, test_results)
  %webout(CLOSE)
`)

      isCodeExamplePrinted = true
    }
  }

  await asyncForEach(flow, async (test) => {
    const pathSepRegExp = new RegExp(path.sep.replace(/\\/g, '\\\\'), 'g')
    const sasJobLocation = [
      target.appLoc,
      test.replace(pathSepRegExp, '/').replace(sasFileRegExp, '')
    ].join('/')

    const testTarget = test
      .split('/')
      .pop()
      .replace(/(.test)?(.\d+)?(.sas)?$/i, '')
    const testId = uuidv4()

    let testUrl = getTestUrl(target, sasJobLocation)

    if (target.contextName) {
      testUrl = `${testUrl}&_contextName=${encodeURIComponent(
        target.contextName
      )}`
    }

    const printTestUrl = () => process.logger.info(`Test URL: ${testUrl}`)

    printTestUrl()

    await sasjs!
      .request(
        sasJobLocation,
        {},
        { username, password },
        () => {
          displayError(null, 'Login callback called. Request failed.')
        },
        authConfig,
        ['log']
      )
      .then(async (res: any) => {
        let lineBreak = true

        const test_results = res.result?.test_results

        if (!test_results) {
          displayError(
            {},
            `Job did not return a response, to debug click ${testUrl}`
          )

          printCodeExample()

          lineBreak = false

          const existingTestTarget = result.sasjs_test_meta.find(
            (testResult: TestDescription) =>
              testResult.test_target === testTarget
          )

          if (existingTestTarget) {
            existingTestTarget.results.push({
              test_loc: test,
              sasjs_test_id: testId,
              result: TestResultStatus.notProvided,
              test_url: testUrl
            })
          } else {
            result.sasjs_test_meta.push({
              test_target: testTarget,
              results: [
                {
                  test_loc: test,
                  sasjs_test_id: testId,
                  result: TestResultStatus.notProvided,
                  test_url: testUrl
                }
              ]
            })
          }
        }

        if (res.log) await saveLog(outDirectory!, test, res.log, lineBreak)

        if (test_results) {
          const existingTestTarget = result.sasjs_test_meta.find(
            (testResult: TestDescription) =>
              testResult.test_target === testTarget
          )

          if (existingTestTarget) {
            existingTestTarget.results.push({
              test_loc: test,
              sasjs_test_id: testId,
              result: test_results,
              test_url: testUrl
            })
          } else {
            result.sasjs_test_meta.push({
              test_target: testTarget,
              results: [
                {
                  test_loc: test,
                  sasjs_test_id: testId,
                  result: test_results,
                  test_url: testUrl
                }
              ]
            })
          }
        } else if (
          target.serverType === ServerType.SasViya ||
          target.serverType === ServerType.Sas9
        ) {
          displayError(
            {},
            `'test_results' not found in server response, to debug click ${testUrl}`
          )

          printCodeExample()
        }
      })
      .catch(async (err) => {
        printTestUrl()

        if (err?.errorCode === 404) {
          displaySasjsRunnerError(username)
        } else {
          displayError(
            {},
            `An error occurred while executing the request. Job location: ${sasJobLocation}`
          )
        }

        if (err?.error?.details?.result) {
          await saveLog(outDirectory!, test, err.error.details.result)
        }
      })
  })

  const jsonPath = await saveResultJson(outDirectory, result)

  if (!jsonPath) return

  const xmlPath = await saveResultXml(outDirectory, result)

  const { csvData, csvPath } = await saveResultCsv(outDirectory, result)

  const coverageReportPath = await saveCoverageLcov(outDirectory, flow)

  const resultTable: any = {}

  if (Array.isArray(csvData)) {
    const testSuites = csvData.reduce(
      (acc: TestResultCsv[], item: TestResultCsv) => {
        if (
          !acc.filter(
            (i: TestResultCsv) => i.sasjs_test_id === item.sasjs_test_id
          ).length
        )
          acc.push(item)

        return acc
      },
      []
    )

    testSuites.forEach((test: TestResultCsv) => {
      const passedTests = csvData.filter(
        (item: TestResultCsv) =>
          item.sasjs_test_id === test.sasjs_test_id &&
          item.test_suite_result === TestResultStatus.pass
      )
      const failedTests = csvData.filter(
        (item: TestResultCsv) =>
          item.sasjs_test_id === test.sasjs_test_id &&
          item.test_suite_result === TestResultStatus.fail
      )

      resultTable[test.sasjs_test_id] = {
        test_target: test.test_target,
        test_suite_result:
          passedTests.length && !failedTests.length
            ? TestResultStatus.pass
            : TestResultStatus.fail
      }
    })
  }

  process.logger?.table(
    Object.keys(resultTable).map((key) => [
      key as string,
      resultTable[key].test_target as string,
      resultTable[key].test_suite_result === TestResultStatus.pass
        ? chalk.greenBright(TestResultStatus.pass)
        : resultTable[key].test_suite_result === TestResultStatus.fail
        ? chalk.redBright(TestResultStatus.fail)
        : resultTable[key].test_suite_result
    ]),
    {
      head: ['SASjs Test ID', 'Test Target', 'Test Suite Result']
    }
  )

  const testsCount = flow.length
  const passedTestsCount = Object.values(resultTable).filter(
    (res: any) => res.test_suite_result === TestResultStatus.pass
  ).length
  const testsWithResultsCount = Object.values(resultTable).filter(
    (res: any) => res.test_suite_result !== TestResultStatus.notProvided
  ).length

  process.logger?.info(`Tests provided results: ${
    testsWithResultsCount + '/' + testsCount
  } (${chalk.greenBright(
    Math.round((testsWithResultsCount / testsCount) * 100 || 0) + '%'
  )})
  Tests that pass: ${
    passedTestsCount + '/' + testsWithResultsCount
  } (${chalk.greenBright(
    Math.round((passedTestsCount / testsWithResultsCount) * 100 || 0) + '%'
  )})
  `)

  displaySuccess(
    `Tests execution finished. The results are stored at:
  ${jsonPath}
  ${csvPath}
  ${xmlPath}`
  )
  displaySuccess(
    `Tests coverage report:
  ${coverageReportPath}`
  )

  if (!ignoreFail) {
    /**
     * When running tests there are 2 types of outcomes
     * Test provided result (FAIL or PASS)
     * Test did not provide any result
     *
     * In this section we want to write tests that did not succeed
     * For better UX we want to separate them and write for example:
     * 1 Test failed to complete
     * 1 Test completed with failures
     */
    const failedTestsCount = testsWithResultsCount - passedTestsCount
    const testsWithoutResultCount = testsCount - testsWithResultsCount
    let errorMessage: string = ''

    if (testsWithoutResultCount > 0)
      errorMessage = `${testsWithoutResultCount} ${
        testsWithoutResultCount === 1 ? 'test' : 'tests'
      } failed to complete!\n`

    if (failedTestsCount > 0)
      errorMessage += `${failedTestsCount} ${
        failedTestsCount === 1 ? 'test' : 'tests'
      } completed with failures!`

    if (errorMessage) return Promise.reject(errorMessage)
  }
}

export const getTestUrl = (target: Target, jobLocation: string) =>
  `${target.serverUrl}/${
    target.serverType === ServerType.SasViya
      ? 'SASJobExecution'
      : target.serverType === ServerType.Sas9
      ? 'SASStoredProcess'
      : 'SASjsApi/stp/execute'
  }/?_program=${jobLocation}&_debug=2477`

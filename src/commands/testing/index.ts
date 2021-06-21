import { getConstants } from '../../constants'
import {
  saveLog,
  saveResultJson,
  saveResultCsv,
  saveResultXml
} from './saveOutput'
import {
  TestFlow,
  TestResults,
  TestResultStatus,
  TestDescription
} from '../../types'
import { sasFileRegExp } from '../../utils/file'
import { Command } from '../../utils/command'
import { findTargetInConfiguration } from '../../utils/config'
import { getAccessToken } from '../../utils/config'
import { displayError, displaySuccess } from '../../utils/displayResult'
import { ServerType, uuidv4, asyncForEach, readFile } from '@sasjs/utils'
import SASjs from '@sasjs/adapter/node'
import path from 'path'
import chalk from 'chalk'

export async function runTest(command: Command) {
  const targetName = command.getFlagValue('target') as string
  const testRegExps = command.values

  let outDirectory = command.getFlagValue('outDirectory') as string

  if (outDirectory) outDirectory = path.join(process.currentDir, outDirectory)
  else outDirectory = (await getConstants()).buildDestinationResultsFolder

  const { target } = await findTargetInConfiguration(targetName)

  if (!target) {
    return Promise.reject(
      'Target not found! Please try again with another target.'
    )
  }

  let flowSourcePath = command.getFlagValue('source') as string

  flowSourcePath = flowSourcePath
    ? path.join(process.currentDir, flowSourcePath)
    : (flowSourcePath = path.join(
        (await getConstants()).buildDestinationFolder,
        'testFlow.json'
      ))

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

  if (testFlow.tests)
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

  if (testFlow.testTearDown) flow.push(testFlow.testTearDown)

  const sasjs = new SASjs({
    serverUrl: target.serverUrl,
    allowInsecureRequests: target.allowInsecureRequests,
    appLoc: target.appLoc,
    serverType: target.serverType,
    debug: true
  })

  let accessToken: string, username: string, password: string
  if (target.serverType === ServerType.SasViya) {
    accessToken = await getAccessToken(target)
  }
  if (target.serverType === ServerType.Sas9) {
    username = process.env.SAS_USERNAME as string
    password = process.env.SAS_PASSWORD as string

    if (!username || !password) {
      throw new Error(
        'A valid username and password are required for requests to SAS9 servers.' +
          '\nPlease set the SAS_USERNAME and SAS_PASSWORD variables in your target-specific or project-level .env file.'
      )
    }
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
    const sasJobLocation = [
      target.appLoc,
      test.replace(sasFileRegExp, '')
    ].join('/')

    const testTarget = test
      .split('/')
      .pop()
      .replace(/(.test)?(.\d+)?(.sas)?$/i, '')
    const testId = uuidv4()

    let testUrl = `${target.serverUrl}/${
      target.serverType === ServerType.SasViya
        ? 'SASJobExecution'
        : 'SASStoredProcess'
    }/?_program=${sasJobLocation}&_debug=2477`

    await sasjs
      .request(
        sasJobLocation,
        {},
        { username, password },
        () => {
          displayError(null, 'Login callback called. Request failed.')
        },
        accessToken
      )
      .then(async (res) => {
        let lineBreak = true

        if (!res.result) {
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

        if (!res.result?.test_results) lineBreak = false

        if (res.log) await saveLog(outDirectory, test, res.log, lineBreak)

        if (res.result?.test_results) {
          const existingTestTarget = result.sasjs_test_meta.find(
            (testResult: TestDescription) =>
              testResult.test_target === testTarget
          )

          if (existingTestTarget) {
            existingTestTarget.results.push({
              test_loc: test,
              sasjs_test_id: testId,
              result: res.result.test_results,
              test_url: testUrl
            })
          } else {
            result.sasjs_test_meta.push({
              test_target: testTarget,
              results: [
                {
                  test_loc: test,
                  sasjs_test_id: testId,
                  result: res.result.test_results,
                  test_url: testUrl
                }
              ]
            })
          }
        } else {
          displayError(
            {},
            `'test_results' not found in server response, to debug click ${testUrl}`
          )

          printCodeExample()
        }
      })
      .catch(async (err) => {
        displayError(
          {},
          `An error occurred while executing the request. Job location: ${sasJobLocation}`
        )

        if (err?.error?.details?.result) {
          await saveLog(outDirectory, test, err.error.details.result)
        }
      })
  })

  const jsonPath = await saveResultJson(outDirectory, result)

  if (!jsonPath) return

  const xmlPath = await saveResultXml(outDirectory, result)

  const { csvData, csvPath } = await saveResultCsv(outDirectory, result)

  const resultTable: any = {}

  if (Array.isArray(csvData)) {
    csvData.forEach(
      (item: any) =>
        (resultTable[item.sasjs_test_id] = {
          test_target: item.test_target,
          test_suite_result: item.test_suite_result
        })
    )
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
}

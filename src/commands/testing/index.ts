import { getConstants } from '../../constants'
import {
  TestFlow,
  TestResults,
  TestResultStatus,
  TestDescription,
  TestResult,
  TestResultDescription
} from '../../types'
import {
  readFile,
  folderExists,
  createFile,
  createFolder,
  sasFileRegExp
} from '../../utils/file'
import { Command } from '../../utils/command'
import { findTargetInConfiguration } from '../../utils/config'
import { asyncForEach } from '../../utils/utils'
import { getAccessToken } from '../../utils/config'
import { displayError, displaySuccess } from '../../utils/displayResult'
import { uuidv4 } from '@sasjs/utils/utils'
import SASjs from '@sasjs/adapter/node'
import stringify from 'csv-stringify'
import path from 'path'
import chalk from 'chalk'
import cliTable from 'cli-table'

export async function runTest(command: Command) {
  const targetName = command.getFlagValue('target') as string
  const { target } = await findTargetInConfiguration(targetName)

  if (!target) {
    throw new Error('Target not found! Please try again with another target.')
  }

  const { buildDestinationFolder } = await getConstants()
  const testFlowPath = path.join(buildDestinationFolder, 'testFlow.json')
  const testFlowData = await readFile(testFlowPath)

  let testFlow: TestFlow = { tests: [] }

  try {
    testFlow = JSON.parse(testFlowData)
  } catch (error) {
    throw new Error('Provided test flow file is not valid.')
  }

  let flow = []

  if (testFlow.testSetUp) flow.push(testFlow.testSetUp)
  if (testFlow.tests) flow = [...flow, ...testFlow.tests]
  if (testFlow.testTearDown) flow.push(testFlow.testTearDown)

  const sasjs = new SASjs({
    serverUrl: target.serverUrl,
    appLoc: target.appLoc,
    serverType: target.serverType
  })

  const accessToken = await getAccessToken(target)

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
  %webout(CLOSE)`)

      isCodeExamplePrinted = true
    }
  }

  await asyncForEach(flow, async (test) => {
    const sasJobLocation = path.join(
      target.appLoc,
      test.replace(sasFileRegExp, '')
    )
    const testTarget = test
      .split(path.sep)
      .pop()
      .replace(/(.test)?(.\d+)?(.sas)?$/i, '')
    const testId = uuidv4()

    await sasjs
      .request(
        sasJobLocation,
        {},
        {},
        () => {
          displayError(null, 'Login callback called. Request failed.')
        },
        accessToken
      )
      .then(
        async (res) => {
          if (!res) {
            displayError(
              {},
              `Job located at ${sasJobLocation} did not return a response.`
            )

            printCodeExample()

            const existingTestTarget = result.sasjs_test_meta.find(
              (testResult: TestDescription) =>
                testResult.test_target === testTarget
            )

            if (existingTestTarget) {
              existingTestTarget.results.push({
                test_loc: test,
                sasjs_test_id: testId,
                result: TestResultStatus.notProvided
              })
            } else {
              result.sasjs_test_meta.push({
                test_target: testTarget,
                results: [
                  {
                    test_loc: test,
                    sasjs_test_id: testId,
                    result: TestResultStatus.notProvided
                  }
                ]
              })
            }

            return
          }

          if (res.test_results) {
            const existingTestTarget = result.sasjs_test_meta.find(
              (testResult: TestDescription) =>
                testResult.test_target === testTarget
            )

            if (existingTestTarget) {
              existingTestTarget.results.push({
                test_loc: test,
                sasjs_test_id: testId,
                result: res.test_results
              })
            } else {
              result.sasjs_test_meta.push({
                test_target: testTarget,
                results: [
                  {
                    test_loc: test,
                    sasjs_test_id: testId,
                    result: res.test_results
                  }
                ]
              })
            }
          } else {
            displayError({}, `'test_results' not found in server response.`)

            printCodeExample()
          }
        },
        (err) => {
          displayError(err, 'An error occurred while executing the request.')
        }
      )
  })

  let finaleResult

  try {
    finaleResult = JSON.stringify(result, null, 2)
  } catch (err) {
    displayError(err, 'Error while converting test results into a string.')
  }

  const { buildDestinationResultsFolder } = await getConstants()

  if (!(await folderExists(buildDestinationResultsFolder))) {
    await createFolder(buildDestinationResultsFolder)
  }

  const csvPath = path.join(buildDestinationResultsFolder, 'testResults.csv')

  const saveCSV = async (data: {}[], options: {}) =>
    new Promise((resolve, reject) =>
      stringify(data, options || {}, async (err, output) => {
        if (err) reject(err)

        await createFile(csvPath, output).catch((err) =>
          displayError(err, 'Error while creating CSV file.')
        )

        resolve(true)
      })
    )

  const csvData: {}[] = result.sasjs_test_meta.flatMap((resTarget: any) =>
    resTarget.results.flatMap((res: TestResult) => {
      let item: any = {
        test_target: resTarget.test_target,
        test_loc: res.test_loc,
        sasjs_test_id: res.sasjs_test_id
      }

      if (Array.isArray(res.result)) {
        item = res.result.map((r: TestResultDescription) => ({
          test_target: resTarget.test_target,
          test_loc: res.test_loc,
          sasjs_test_id: res.sasjs_test_id,
          test_suite_result: r.TEST_RESULT,
          test_description: r.TEST_DESCRIPTION
        }))
      } else item.test_suite_result = res.result

      return item
    })
  )

  await saveCSV(csvData, {
    header: true,
    columns: {
      test_target: 'test_target',
      test_loc: 'test_loc',
      sasjs_test_id: 'sasjs_test_id',
      test_suite_result: 'test_suite_result',
      test_description: 'test_description'
    }
  }).catch((err) => displayError(err, 'Error while saving CSV file'))

  const jsonPath = path.join(buildDestinationResultsFolder, 'testResults.json')

  await createFile(jsonPath, finaleResult)

  const resultTable: any = {}

  csvData.forEach(
    (item: any) =>
      (resultTable[item.sasjs_test_id] = {
        test_target: item.test_target,
        test_suite_result: item.test_suite_result
      })
  )

  // TODO: move to @sasjs/utils
  const table = new cliTable({
    chars: {
      top: '═',
      'top-mid': '╤',
      'top-left': '╔',
      'top-right': '╗',
      bottom: '═',
      'bottom-mid': '╧',
      'bottom-left': '╚',
      'bottom-right': '╝',
      left: '║',
      'left-mid': '╟',
      mid: '─',
      'mid-mid': '┼',
      right: '║',
      'right-mid': '╢',
      middle: '│'
    },
    head: [
      chalk.white.bold('SASjs Test ID'),
      chalk.white.bold('Test Target'),
      chalk.white.bold('Test Suite Result')
    ]
  })

  Object.keys(resultTable).forEach((key) =>
    table.push([
      key,
      resultTable[key].test_target,
      resultTable[key].test_suite_result === TestResultStatus.pass
        ? chalk.greenBright(TestResultStatus.pass)
        : resultTable[key].test_suite_result === TestResultStatus.fail
        ? chalk.redBright(TestResultStatus.fail)
        : resultTable[key].test_suite_result
    ])
  )

  process.logger?.log(table.toString() + '\n')

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
    Math.round((testsWithResultsCount / testsCount) * 100) + '%'
  )})
  Tests that pass: ${
    passedTestsCount + '/' + testsWithResultsCount
  } (${chalk.greenBright(
    Math.round((passedTestsCount / testsWithResultsCount) * 100) + '%'
  )})
  `)

  displaySuccess(
    `Tests execution finished. The results are stored at:
  ${jsonPath}
  ${csvPath}`
  )
}

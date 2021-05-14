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
import { getAccessToken } from '../../utils/config'
import { displayError, displaySuccess } from '../../utils/displayResult'
import { ServerType, uuidv4, asyncForEach } from '@sasjs/utils'
import SASjs from '@sasjs/adapter/node'
import stringify from 'csv-stringify'
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
    appLoc: target.appLoc,
    serverType: target.serverType,
    debug: true
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
  %webout(CLOSE)
`)

      isCodeExamplePrinted = true
    }
  }

  const saveLog = async (
    test: string,
    log: string,
    lineBreak: boolean = false
  ) => {
    const logPath = path.join(
      outDirectory,
      'logs',
      test.replace(sasFileRegExp, '').split(path.sep).slice(1).join('_') +
        '.log'
    )

    await createFile(logPath, log)

    process.logger.info(
      `Log file is located at ${logPath}${lineBreak ? '\n' : ''}`
    )
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

    let testUrl = `${target.serverUrl}/${
      target.serverType === ServerType.SasViya
        ? 'SASJobExecution'
        : 'SASStoredProcess'
    }/?_program=${sasJobLocation}&_debug=2477`

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

        if (res.log) await saveLog(test, res.log, lineBreak)

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
          displayError({}, `'test_results' not found in server response.`)

          printCodeExample()
        }
      })
      .catch(async (err) => {
        displayError(
          {},
          `An error occurred while executing the request. Job location: ${sasJobLocation}`
        )

        if (err?.error?.details?.result) {
          await saveLog(test, err.error.details.result)
        }
      })
  })

  let finaleResult

  try {
    finaleResult = JSON.stringify(result, null, 2)
  } catch (err) {
    displayError(err, 'Error while converting test results into a string.')
  }

  if (!(await folderExists(outDirectory))) {
    await createFolder(outDirectory)
  }

  const csvPath = path.join(outDirectory, 'testResults.csv')

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
        sasjs_test_id: res.sasjs_test_id,
        test_url: `=HYPERLINK("${res.test_url}")`
      }

      if (Array.isArray(res.result)) {
        item = res.result.map((r: TestResultDescription) => ({
          test_target: resTarget.test_target,
          test_loc: res.test_loc,
          sasjs_test_id: res.sasjs_test_id,
          test_suite_result: r.TEST_RESULT,
          test_description: r.TEST_DESCRIPTION,
          test_url: `=HYPERLINK("${res.test_url}")`
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
      test_description: 'test_description',
      test_url: 'test_url'
    }
  }).catch((err) => displayError(err, 'Error while saving CSV file'))

  const jsonPath = path.join(outDirectory, 'testResults.json')

  await createFile(jsonPath, finaleResult)

  const resultTable: any = {}

  csvData.forEach(
    (item: any) =>
      (resultTable[item.sasjs_test_id] = {
        test_target: item.test_target,
        test_suite_result: item.test_suite_result
      })
  )

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
  ${csvPath}`
  )
}

import path from 'path'
import {
  asyncForEach,
  createFile,
  fileExists,
  generateTimestamp,
  testFileRegExp,
  createCsv
} from '@sasjs/utils'
import { sasFileRegExp } from '../../../utils/file'
import { displayError } from '../../../utils/displayResult'
import {
  TestDescription,
  TestResult,
  TestResultDescription,
  TestResults,
  TestResultStatus,
  TestResultCsv
} from '../../../types'
import xml from 'xml'

const resultFileName = 'testResults'

export const saveLog = async (
  outDirectory: string,
  test: string,
  log: string,
  lineBreak: boolean = false
) => {
  const logPath = path.join(
    outDirectory,
    'logs',
    test.replace(sasFileRegExp, '').split('/').slice(1).join('_') + '.log'
  )

  await createFile(logPath, log)

  process.logger.info(
    `Log file is located at ${logPath}${lineBreak ? '\n' : ''}`
  )
}

export const saveResultJson = async (jsonPath: string, result: TestResults) => {
  try {
    const finaleResult = JSON.stringify(result, null, 2)
    await createFile(jsonPath, finaleResult)
  } catch (err) {
    displayError(err, 'Error while converting test results into a string.')

    throw new Error('Error while converting test results into a string.')
  }
}

export const saveResultCsv = async (
  csvPath: string,
  result: TestResults,
  columns = [
    'test_target',
    'test_loc',
    'sasjs_test_id',
    'test_suite_result',
    'test_description',
    'test_url'
  ]
): Promise<TestResultCsv[]> => {
  const csvData: TestResultCsv[] = result.sasjs_test_meta.flatMap(
    (resTarget: any) =>
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

  return createCsv(csvPath, csvData, columns)
    .then(() => csvData)
    .catch((err) => {
      displayError(err, 'Error while creating CSV file')
      throw err
    })
}

export const saveResultXml = async (xmlPath: string, result: TestResults) => {
  const getFailures = (testCase: TestResult) => {
    if (Array.isArray(testCase.result)) {
      return testCase.result
        .filter(
          (res: TestResultDescription) =>
            res.TEST_RESULT === TestResultStatus.fail
        )
        .map((res: TestResultDescription) => ({
          failure: res.TEST_COMMENT
            ? `
        Description: ${res.TEST_DESCRIPTION}
        Comment: ${res.TEST_COMMENT}
      `
            : `Description: ${res.TEST_DESCRIPTION}`
        }))
    }

    return [
      {
        failure: 'Status was not provided'
      }
    ]
  }

  const resultXml = {
    testsuites: [
      ...result.sasjs_test_meta.map((testSuite: TestDescription) => ({
        testsuite: [
          {
            _attr: {
              id: testSuite.test_target,
              name: testSuite.test_target,
              tests: testSuite.results.reduce(
                (acc, val) =>
                  acc + (Array.isArray(val.result) ? val.result.length : 1),
                0
              ),
              failures: testSuite.results.reduce(
                (acc, val) =>
                  acc +
                  (Array.isArray(val.result)
                    ? val.result.filter(
                        (res: TestResultDescription) =>
                          res.TEST_RESULT === TestResultStatus.fail
                      ).length
                    : 1),
                0
              )
            }
          },
          ...testSuite.results.map((testCase: TestResult) => ({
            testcase: [
              {
                _attr: {
                  id: testCase.sasjs_test_id
                }
              },
              ...getFailures(testCase)
            ]
          }))
        ]
      })),
      {
        _attr: {
          id: generateTimestamp('_', 3),
          name: 'SASjs Test Meta',
          tests: result.sasjs_test_meta.reduce(
            (acc, val) =>
              acc +
              val.results.reduce(
                (acc, val) =>
                  acc + (Array.isArray(val.result) ? val.result.length : 1),
                0
              ),
            0
          ),
          failures: result.sasjs_test_meta.reduce(
            (acc, val) =>
              acc +
              val.results.reduce(
                (acc, val) =>
                  acc +
                  (Array.isArray(val.result)
                    ? val.result.filter(
                        (res: TestResultDescription) =>
                          res.TEST_RESULT === TestResultStatus.fail
                      ).length
                    : 1),
                0
              ),
            0
          )
        }
      }
    ]
  }

  const xmlString = xml(resultXml, { declaration: true, indent: '  ' })

  await createFile(xmlPath, xmlString)
}

export const saveCoverageLcov = async (
  coverageReportPath: string,
  tests: string[]
) => {
  const testsPrefixRegExp = new RegExp(`^tests/`)
  const coverageReport: string[] = []

  const coveringFile = async (filePath: string) =>
    (await fileExists(
      path.join(process.sasjsConstants.buildDestinationFolder, filePath)
    ))
      ? filePath
      : 'standalone'

  await asyncForEach(tests, async (test: string) =>
    coverageReport.push(`TN:${test.split('/').pop()}
SF:${await coveringFile(
      test.replace(testsPrefixRegExp, '').replace(testFileRegExp, '.sas')
    )}
FNF:1
FNH:1
LF:1
LH:1
BRF:1
BRH:1
end_of_record`)
  )

  await createFile(coverageReportPath, coverageReport.join('\n'))
}

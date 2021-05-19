export interface TestFlow {
  testSetUp?: string
  testTearDown?: string
  tests: string[]
}

export enum CoverageType {
  service = 'service',
  job = 'job',
  macro = 'macro',
  test = 'test'
}

export enum CoverageState {
  notCovered = 'not covered',
  standalone = 'standalone'
}

export interface Coverage {
  [key: string]: {
    Type: CoverageType
    Coverage: CoverageState
  }
}

export interface TestResultDescription {
  TEST_DESCRIPTION: string
  TEST_RESULT: TestResultStatus.pass | TestResultStatus.fail
}

export enum TestResultStatus {
  pass = 'PASS',
  fail = 'FAIL',
  notProvided = 'not provided'
}

export interface TestDescription {
  test_target: string
  results: TestResult[]
}
export interface TestResult {
  test_loc: string
  sasjs_test_id: string
  result: TestResultStatus.notProvided | TestResultDescription[]
  test_url: string
}
export interface TestResults {
  sasjs_test_meta: TestDescription[]
}

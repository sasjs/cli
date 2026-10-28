import {
  asyncForEach,
  CompileTree,
  Configuration,
  copy,
  createFile,
  deleteFile,
  fileExists,
  folderExists,
  getAbsolutePath,
  listFilesAndSubFoldersInFolder,
  SASJsFileType,
  Target,
  testFileRegExp
} from '@sasjs/utils'
import chalk from 'chalk'
import path from 'path'
import {
  Coverage,
  CoverageReport,
  CoverageState,
  CoverageSummary,
  CoverageType,
  TestFlow
} from '../../../types'
import { getMacroFolders, getProgramFolders } from '../../../utils/config'
import { sasFileRegExp } from '../../../utils/file'
import { loadDependencies } from './'

const getFileName = (filePath: string) => path.parse(filePath).base

/** The coverage report `sasjs compile` writes to the build folder. */
export const coverageFileName = 'coverage.json'

/**
 * Resolves the relative destination fragment for a compiled test file inside
 * `sasjsbuild/tests` - either just the file's basename (saveToRoot, used for
 * testSetUp/testTearDown), or the path fragment following the build
 * destination folder name (used for service/job test files).
 *
 * `filePath` for testSetUp/testTearDown comes straight from a user's
 * sasjsconfig.json, which conventionally uses forward slashes for
 * portability - it is not guaranteed to match the current OS's separator.
 * Splitting on both `/` and `\` (instead of only `path.sep`) means this
 * works whether the config was authored with POSIX-style paths and the CLI
 * is running on Windows (`path.sep === '\\'`) or vice versa. Splitting on
 * `path.sep` alone silently no-ops when the string contains none of that
 * separator, leaving the whole config path intact and producing a nested
 * `sasjsbuild/tests/sasjs/tests/testsetup.sas` instead of a flat
 * `sasjsbuild/tests/testsetup.sas`.
 */
export const getTestFileDestinationFragment = (
  filePath: string,
  buildDestinationFolderName: string | undefined,
  saveToRoot: boolean
): string => {
  const segments = filePath.split(/[\\/]/)

  const destinationFragment = saveToRoot
    ? segments.pop() || ''
    : segments
        .reduce(
          (acc: string[], item: string, i: number, arr: string[]) =>
            acc.length
              ? [...acc, item]
              : arr[i - 1] === buildDestinationFolderName
                ? [...acc, item]
                : acc,
          [] as string[]
        )
        .join(path.sep)

  return destinationFragment
}

export async function compileTestFile(
  target: Target,
  filePath: string,
  testVar: string = '',
  saveToRoot: boolean = true,
  removeOriginalFile = true,
  compileTree: CompileTree,
  destinationPath?: string
) {
  let dependencies = await loadDependencies(
    target,
    getAbsolutePath(filePath, process.projectDir),
    await getMacroFolders(target),
    await getProgramFolders(target),
    SASJsFileType.test,
    compileTree
  )

  dependencies = `${testVar ? testVar + '\n' : ''}\n${dependencies}`

  const { buildDestinationFolder, buildDestinationTestFolder } =
    process.sasjsConstants

  const buildDestinationFolderName = buildDestinationFolder
    .split(path.sep)
    .pop()

  destinationPath =
    destinationPath ||
    path.join(
      buildDestinationTestFolder,
      getTestFileDestinationFragment(
        filePath,
        buildDestinationFolderName,
        saveToRoot
      )
    )

  await createFile(destinationPath, dependencies)

  if (removeOriginalFile) await deleteFile(filePath)
}

export async function copyTestMacroFiles(folderAbsolutePath: string) {
  const macroFiles = await listFilesAndSubFoldersInFolder(folderAbsolutePath)
  const macroTestFiles = macroFiles.filter((item) => testFileRegExp.test(item))

  const { buildDestinationTestFolder } = process.sasjsConstants

  await asyncForEach(macroTestFiles, async (file) => {
    const destinationFile = path.join(
      buildDestinationTestFolder,
      'macros',
      file
    )

    if (!(await fileExists(destinationFile))) {
      await copy(path.join(folderAbsolutePath, file), destinationFile)
    }
  })
}

export const compileTestFlow = async (target: Target) => {
  if (
    target.testConfig &&
    Object.keys(target.testConfig).includes('testFolders')
  ) {
    process.logger.warn(
      `'testFolders' is not supported 'testConfig' entry, please use 'serviceFolders' entry in 'serviceConfig' or 'jobFolders' entry in 'jobConfig'.`
    )
  }

  const { buildDestinationFolder, buildDestinationTestFolder } =
    process.sasjsConstants

  if (await folderExists(buildDestinationTestFolder)) {
    let testFiles = (
      await listFilesAndSubFoldersInFolder(buildDestinationTestFolder)
    ).map((file) => path.join('tests', file))

    const config = process.sasjsConfig

    const testFlow: TestFlow = { tests: [] }
    const testSetUp =
      target.testConfig?.testSetUp || config.testConfig?.testSetUp
    const testTearDown =
      target.testConfig?.testTearDown || config.testConfig?.testTearDown

    if (testFiles.length) {
      if (testSetUp) {
        const testSetUpFileName = getFileName(testSetUp)

        if (testFiles.find((file) => getFileName(file) === testSetUpFileName)) {
          testFiles = testFiles.filter(
            (file) => getFileName(file) !== testSetUpFileName
          )

          testFlow.testSetUp = ['tests', testSetUpFileName].join('/')
        }
      }

      if (testTearDown) {
        const testTearDownFileName = getFileName(testTearDown)

        if (
          testFiles.find((file) => getFileName(file) === testTearDownFileName)
        ) {
          testFiles = testFiles.filter(
            (file) => getFileName(file) !== testTearDownFileName
          )

          testFlow.testTearDown = ['tests', testTearDownFileName].join('/')
        }
      }
    }

    testFlow.tests = testFiles.map((file: string) =>
      file.split(path.sep).join('/')
    )

    await printTestCoverage(testFlow, buildDestinationFolder, target)

    return Promise.resolve(testFlow)
  }
}

const printTestCoverage = async (
  testFlow: TestFlow,
  buildDestinationFolder: string,
  target: Target
) => {
  let toCover: string[] = []
  let covered: string[] = []
  let extraTests: string[] = testFlow.tests

  const serviceFolder = path.join(buildDestinationFolder, 'services')

  const collectCoverage = async (
    folder: string,
    type: string,
    filter = (s: string) => true
  ) => {
    if (await folderExists(folder)) {
      const files = (await listFilesAndSubFoldersInFolder(folder))
        .filter((file: string) => sasFileRegExp.test(file))
        .filter(filter)
        .map((file) => [type, file.split(path.sep).join('/')].join('/'))

      toCover = [...toCover, ...files]

      files.forEach((file) => {
        let shouldBeCovered = ['tests', file.split(path.sep).join('/')]
          .join('/')
          .replace(sasFileRegExp, '')

        if (type === 'macros') {
          shouldBeCovered = shouldBeCovered.split(path.sep).pop() || ''
        }

        if (
          testFlow.tests.find((testFile: string) => {
            let testCovering = testFile.replace(testFileRegExp, '')

            if (type === 'macros') {
              testCovering = testCovering.split(path.sep).pop() || ''
            }

            if (testCovering === shouldBeCovered) {
              extraTests = extraTests.filter(
                (test) =>
                  test.replace(testFileRegExp, '') !==
                  testFile.replace(testFileRegExp, '')
              )
            }

            return testCovering === shouldBeCovered
          })
        ) {
          covered.push(file)
        }
      })
    }
  }

  await collectCoverage(serviceFolder, 'services')

  const jobFolder = path.join(buildDestinationFolder, 'jobs')

  await collectCoverage(jobFolder, 'jobs')

  const macroFolders = await getMacroFolders(target)

  await asyncForEach(macroFolders, async (macroFolder) => {
    await collectCoverage(
      macroFolder,
      'macros',
      (file: string) => !testFileRegExp.test(file)
    )
  })

  const filter = (files: string[], type: string) =>
    files.filter((file) => new RegExp(`^${type}`).test(file))

  const coveredServices = filter(covered, CoverageType.service)
  const servicesToCover = filter(toCover, CoverageType.service)

  const coveredJobs = filter(covered, CoverageType.job)
  const jobsToCover = filter(toCover, CoverageType.job)

  const coveredMacros = filter(covered, CoverageType.macro)
  const macrosToCover = filter(toCover, CoverageType.macro)

  // One map feeds both the console table and coverage.json: every file the
  // compile found, keyed by its project-relative path (`macros/x.sas`,
  // `services/common/x.sas`) and marked covered or not. Keys never carry the
  // build machine's paths, so the same project produces the same report
  // everywhere - and the table cannot disagree with the file beside it.
  const coverage: Coverage = {}

  const markCoverage = (
    type: CoverageType,
    filesToCover: string[],
    coveredFiles: string[]
  ) =>
    filesToCover.forEach((file) => {
      coverage[file] = {
        Type: type,
        Coverage: coveredFiles.includes(file)
          ? CoverageState.covered
          : CoverageState.notCovered
      }
    })

  markCoverage(CoverageType.service, servicesToCover, coveredServices)
  markCoverage(CoverageType.job, jobsToCover, coveredJobs)
  markCoverage(CoverageType.macro, macrosToCover, coveredMacros)

  extraTests.forEach((file) => {
    coverage[file] = {
      Type: CoverageType.test,
      Coverage: CoverageState.standalone
    }
  })

  const summarize = (cov: string[], toCov: string[]): CoverageSummary => ({
    covered: cov.length,
    total: toCov.length,
    percentage: toCov.length ? Math.round((cov.length / toCov.length) * 100) : 0
  })

  const formatCoverage = (type: string, summary: CoverageSummary) =>
    summary.total
      ? process.logger?.info(
          `${type} coverage: ${summary.covered}/${
            summary.total
          } (${chalk.greenBright(`${summary.percentage}%`)})`
        )
      : null

  const summary: CoverageReport['summary'] = {
    services: summarize(coveredServices, servicesToCover),
    jobs: summarize(coveredJobs, jobsToCover),
    macros: summarize(coveredMacros, macrosToCover),
    overall: summarize(covered, toCover)
  }

  process.logger?.info('Test coverage:')

  // The table renders the same map coverage.json serialises, so a reader sees
  // every file - covered rows included - under the key the report uses.
  process.logger?.table(
    Object.keys(coverage).map((key) => [
      key,
      coverage[key].Type,
      coverage[key].Coverage
    ]),
    {
      head: ['File', 'Type', 'Coverage']
    }
  )

  formatCoverage('Services', summary.services)
  formatCoverage('Jobs', summary.jobs)
  formatCoverage('Macros', summary.macros)
  formatCoverage('Overall', summary.overall)
  process.logger?.log('')

  await createFile(
    path.join(buildDestinationFolder, 'testFlow.json'),
    JSON.stringify(testFlow, null, 2)
  )

  // The numbers are already computed and rendered above, so the report costs
  // one small file - which lets a CI job publish the figures instead of
  // scraping the log.
  const report: CoverageReport = { summary, files: coverage }

  await createFile(
    path.join(buildDestinationFolder, coverageFileName),
    JSON.stringify(report, null, 2)
  )
}

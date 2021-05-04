import { Target } from '@sasjs/utils/types'
import { TestFlow, Coverage, CoverageType, CoverageState } from '../../../types'
import path from 'path'
import { getConstants } from '../../../constants'
import { createFile } from '../../../utils/file'
import { loadDependencies } from './loadDependencies'
import { createFolder, sasFileRegExp } from '../../../utils/file'
import { moveFile, folderExists } from '@sasjs/utils/file'
import { listFilesAndSubFoldersInFolder } from '@sasjs/utils/file'
import chalk from 'chalk'

export async function compileTestFile(
  target: Target,
  filePath: string,
  macroFolders: string[],
  testVar: string = ''
) {
  let dependencies = await loadDependencies(
    target,
    path.join(process.projectDir, filePath),
    macroFolders,
    [],
    'test',
    true
  )
  dependencies = `${testVar ? testVar + '\n' : ''}${dependencies}`

  const destinationPath = path.join(
    process.currentDir,
    'sasjsbuild',
    'tests',
    filePath.split(path.sep).pop() || ''
  )

  await createFile(destinationPath, dependencies)
}

export async function moveTestFile(filePath: string) {
  const fileName = filePath.split(path.sep).pop() as string

  if (!isTestFile(fileName)) return

  const destinationPath = filePath.replace('sasjsbuild', 'sasjsbuild/tests')

  const testDestinationFolder = destinationPath
    .split(path.sep)
    .slice(0, -1)
    .join(path.sep)

  if (!(await folderExists(testDestinationFolder))) {
    await createFolder(testDestinationFolder)
  }

  await moveFile(filePath, destinationPath)
}

export const testFileRegExp = /\.test\.(\d+\.)?sas$/i

export const isTestFile = (fileName: string) => testFileRegExp.test(fileName)

export const compileTestFlow = async (target: Target) => {
  const {
    buildDestinationFolder,
    buildDestinationTestFolder
  } = await getConstants()

  if (await folderExists(buildDestinationTestFolder)) {
    let testFiles = await (
      await listFilesAndSubFoldersInFolder(buildDestinationTestFolder)
    ).map((file) => path.join('tests', file))

    const testFlow: TestFlow = { tests: [] }
    const testSetUp = target.testConfig?.testSetUp
    const testTearDown = target.testConfig?.testTearDown

    if (testFiles.length) {
      if (testSetUp) {
        const testSetUpPath = testSetUp.split(path.sep).slice(1).join(path.sep)

        if (testFiles.find((file) => file === testSetUpPath)) {
          testFiles = testFiles.filter((file) => file !== testSetUpPath)

          testFlow.testSetUp = testSetUpPath
        }
      }

      if (testTearDown) {
        const testTearDownPath = testTearDown
          .split(path.sep)
          .slice(1)
          .join(path.sep)

        if (testFiles.find((file) => file === testTearDownPath)) {
          testFiles = testFiles.filter((file) => file !== testTearDownPath)

          testFlow.testTearDown = testTearDownPath
        }
      }
    }

    testFlow.tests = testFiles

    await printTestCoverage(testFlow, buildDestinationFolder)
  }
}

const printTestCoverage = async (
  testFlow: TestFlow,
  buildDestinationFolder: string
) => {
  let toCover: string[] = []
  let covered: string[] = []
  let extraTests: string[] = testFlow.tests

  const serviceFolder = path.join(buildDestinationFolder, 'services')

  if (await folderExists(serviceFolder)) {
    const serviceFiles = (
      await listFilesAndSubFoldersInFolder(serviceFolder)
    ).map((file) => path.join('services', file))

    toCover = serviceFiles

    serviceFiles.forEach((sf) => {
      const shouldBeCovered = path.join('tests', sf).replace(sasFileRegExp, '')

      if (
        testFlow.tests.find((testFile: string) => {
          const testCovering = testFile.replace(testFileRegExp, '')

          if (testCovering === shouldBeCovered) {
            extraTests = extraTests.filter((test) => test !== testFile)
          }

          return testCovering === shouldBeCovered
        })
      ) {
        covered.push(sf)
      }
    })
  }

  const jobFolder = path.join(buildDestinationFolder, 'jobs')

  if (await folderExists(jobFolder)) {
    const jobFiles = (
      await listFilesAndSubFoldersInFolder(jobFolder)
    ).map((file) => path.join('jobs', file))

    toCover = [...toCover, ...jobFiles]

    jobFiles.forEach((jf) => {
      const shouldBeCovered = path.join('tests', jf).replace(sasFileRegExp, '')

      if (
        testFlow.tests.find((testFile: string) => {
          const testCovering = testFile.replace(testFileRegExp, '')

          if (testCovering === shouldBeCovered) {
            extraTests = extraTests.filter((test) => test !== testFile)
          }

          return testCovering === shouldBeCovered
        })
      ) {
        covered.push(jf)
      }
    })
  }

  const filter = (files: string[], type: string) =>
    files.filter((file) => new RegExp(`^${type}`).test(file))

  let coverage: Coverage = {}
  const notCovered = toCover.filter((tc) => !covered.includes(tc))

  const coveredServices = filter(covered, 'services')
  const servicesToCover = filter(toCover, 'services')
  const notCoveredServices = filter(notCovered, 'services')

  notCoveredServices.forEach((file, i) => {
    coverage[file] = {
      Type: CoverageType.service,
      Coverage: CoverageState.notCovered
    }
  })

  const coveredJobs = filter(covered, 'jobs')
  const jobsToCover = filter(toCover, 'jobs')
  const notCoveredJobs = filter(notCovered, 'jobs')

  notCoveredJobs.forEach((file, i) => {
    coverage[file] = {
      Type: CoverageType.job,
      Coverage: CoverageState.notCovered
    }
  })

  extraTests.forEach((file) => {
    coverage[file] = {
      Type: CoverageType.test,
      Coverage: CoverageState.standalone
    }
  })

  const calculateCoverage = (covered: number, from: number) =>
    (Math.round((covered / from) * 100) || 0) + '%'

  const printCoverage = (type: string, covered: string[], toCover: string[]) =>
    `${type} coverage: ${covered.length}/${toCover.length} (${chalk.greenBright(
      calculateCoverage(covered.length, toCover.length)
    )})`

  process.logger?.info('Test coverage:')

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

  process.logger?.info(`${printCoverage(
    'Services',
    coveredServices,
    servicesToCover
  )}
  ${printCoverage('Jobs', coveredJobs, jobsToCover)}
  ${printCoverage('Overall', covered, toCover)}
`)

  await createFile(
    path.join(buildDestinationFolder, 'testFlow.json'),
    JSON.stringify(testFlow, null, 2)
  )
}

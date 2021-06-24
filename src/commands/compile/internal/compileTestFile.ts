import { TestFlow, Coverage, CoverageType, CoverageState } from '../../../types'
import path from 'path'
import { getConstants } from '../../../constants'
import {
  createFile,
  copy,
  listFilesInFolder,
  fileExists,
  createFolder,
  Target,
  asyncForEach,
  moveFile,
  deleteFile,
  folderExists,
  deleteFolder,
  listFilesAndSubFoldersInFolder,
  pathSepEscaped
} from '@sasjs/utils'
import { loadDependencies } from './loadDependencies'
import { sasFileRegExp } from '../../../utils/file'
import chalk from 'chalk'
import { getProgramFolders, getMacroFolders } from '../../../utils/config'
import { getPreCodeForServicePack } from './compileServiceFile'

const testsBuildFolder = () =>
  path.join(process.currentDir, 'sasjsbuild', 'tests')

const getFileName = (filePath: string) => path.parse(filePath).base

export async function compileTestFile(
  target: Target,
  filePath: string,
  testVar: string = '',
  saveToRoot: boolean = true,
  removeOriginalFile = true
) {
  let dependencies = await loadDependencies(
    target,
    path.isAbsolute(filePath)
      ? filePath
      : path.join(process.projectDir, filePath),
    await getMacroFolders(target),
    await getProgramFolders(target),
    'test'
  )

  const preCode = await getPreCodeForServicePack(target.serverType)

  dependencies = `${testVar ? testVar + '\n' : ''}\n${preCode}\n${dependencies}`

  const destinationPath = path.join(
    testsBuildFolder(),
    saveToRoot
      ? filePath.split(path.sep).pop() || ''
      : filePath
          .split(path.sep)
          .reduce(
            (acc: any, item: any, i: any, arr: any) =>
              acc.length
                ? [...acc, item]
                : arr[i - 1] === 'sasjsbuild'
                ? [...acc, item]
                : acc,
            []
          )
          .join(path.sep)
  )

  await createFile(destinationPath, dependencies)

  if (removeOriginalFile) await deleteFile(filePath)
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

  const sourceFolder = filePath
    .split(path.sep)
    .slice(0, filePath.split(path.sep).length - 1)
    .join(path.sep)

  if ((await listFilesInFolder(sourceFolder)).length === 0) {
    await deleteFolder(sourceFolder)
  }
}

export async function copyTestMacroFiles(folderAbsolutePath: string) {
  const macroFiles = await listFilesAndSubFoldersInFolder(folderAbsolutePath)
  const macroTestFiles = macroFiles.filter((item) => testFileRegExp.test(item))

  await asyncForEach(macroTestFiles, async (file) => {
    const destinationFile = path.join(testsBuildFolder(), 'macros', file)

    if (!(await fileExists(destinationFile))) {
      await copy(path.join(folderAbsolutePath, file), destinationFile)
    }
  })
}

export const testFileRegExp = /\.test\.(\d+\.)?sas$/i

export const isTestFile = (fileName: string) => testFileRegExp.test(fileName)

export const compileTestFlow = async (target: Target) => {
  const { buildDestinationFolder, buildDestinationTestFolder } =
    await getConstants()

  if (await folderExists(buildDestinationTestFolder)) {
    let testFiles = (
      await listFilesAndSubFoldersInFolder(buildDestinationTestFolder)
    ).map((file) => path.join('tests', file))

    const testFlow: TestFlow = { tests: [] }
    const testSetUp = target.testConfig?.testSetUp
    const testTearDown = target.testConfig?.testTearDown

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

  let coverage: Coverage = {}
  const notCovered = toCover.filter((tc) => !covered.includes(tc))

  const coveredServices = filter(covered, CoverageType.service)
  const servicesToCover = filter(toCover, CoverageType.service)
  const notCoveredServices = filter(notCovered, CoverageType.service)

  notCoveredServices.forEach((file, i) => {
    coverage[file] = {
      Type: CoverageType.service,
      Coverage: CoverageState.notCovered
    }
  })

  const coveredJobs = filter(covered, CoverageType.job)
  const jobsToCover = filter(toCover, CoverageType.job)
  const notCoveredJobs = filter(notCovered, CoverageType.job)

  notCoveredJobs.forEach((file, i) => {
    coverage[file] = {
      Type: CoverageType.job,
      Coverage: CoverageState.notCovered
    }
  })

  const coveredMacros = filter(covered, CoverageType.macro)
  const macrosToCover = filter(toCover, CoverageType.macro)
  let notCoveredMacros = filter(notCovered, CoverageType.macro)

  if (notCoveredMacros.length) {
    await asyncForEach(macroFolders, async (macroFolder: string) => {
      const macros = await (
        await listFilesAndSubFoldersInFolder(macroFolder)
      ).filter((file: string) => !isTestFile(file))

      const macroTypeRegExp = new RegExp(`^macros${pathSepEscaped}`)

      notCoveredMacros = notCoveredMacros.map((macro: string) =>
        macros.includes(macro.replace(macroTypeRegExp, ''))
          ? macro.replace(macroTypeRegExp, macroFolder + path.sep)
          : macro
      )
    })
  }

  notCoveredMacros.forEach((file, i) => {
    coverage[file] = {
      Type: CoverageType.macro,
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

  const formatCoverage = (type: string, covered: string[], toCover: string[]) =>
    toCover.length
      ? process.logger?.info(
          `${type} coverage: ${covered.length}/${
            toCover.length
          } (${chalk.greenBright(
            calculateCoverage(covered.length, toCover.length)
          )})`
        )
      : null

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

  formatCoverage('Services', coveredServices, servicesToCover)
  formatCoverage('Jobs', coveredJobs, jobsToCover)
  formatCoverage('Macros', coveredMacros, macrosToCover)
  formatCoverage('Overall', covered, toCover)
  process.logger?.log('')

  await createFile(
    path.join(buildDestinationFolder, 'testFlow.json'),
    JSON.stringify(testFlow, null, 2)
  )
}

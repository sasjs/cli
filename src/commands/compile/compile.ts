import path from 'path'
import {
  getProgramFolders,
  getMacroFolders,
  getTestSetUp,
  getTestTearDown
} from '../../utils/config'
import {
  listSubFoldersInFolder,
  listFilesInFolder,
  fileExists,
  deleteFolder,
  createFolder,
  folderExists,
  copy,
  asyncForEach,
  listFilesAndSubFoldersInFolder
} from '@sasjs/utils'
import { isSasFile } from '../../utils/file'
import { Target } from '@sasjs/utils/types'
import { getConstants } from '../../constants'
import { checkCompileStatus } from './internal/checkCompileStatus'
import * as compileModule from './compile'
import { getAllJobFolders } from './internal/getAllJobFolders'
import { getAllServiceFolders } from './internal/getAllServiceFolders'
import { compileServiceFile } from './internal/compileServiceFile'
import { compileJobFile } from './internal/compileJobFile'
import {
  compileTestFile,
  compileTestFlow,
  copyTestMacroFiles
} from './internal/compileTestFile'
import {
  getDestinationServicePath,
  getDestinationJobPath
} from './internal/getDestinationPath'
import { moveTestFile } from './internal/compileTestFile'

export async function compile(target: Target, forceCompile = false) {
  const result = await checkCompileStatus(target, ['tests'])

  // no need to compile again
  if (result.compiled && !forceCompile) {
    process.logger?.info('Skipping compilation.')
    process.logger?.info(result.message)
    return
  }

  await compileModule.copyFilesToBuildFolder(target).catch((error) => {
    process.logger?.error('Project compilation has failed.')
    throw error
  })

  await compileModule.compileJobsServicesTests(target)

  let macroFolders: string[] = await getMacroFolders(target)

  if (macroFolders.length) {
    const programFolders = await getProgramFolders(target)

    await asyncForEach(
      macroFolders,
      async (macroFolder: string) => await copyTestMacroFiles(macroFolder)
    )

    const buildMacroTestFolder = path.join(
      (await getConstants()).buildDestinationTestFolder,
      'macros'
    )

    if (await folderExists(buildMacroTestFolder)) {
      const macroTestFiles = await (
        await listFilesAndSubFoldersInFolder(buildMacroTestFolder)
      ).filter(isSasFile)

      await asyncForEach(macroTestFiles, async (macroTestFile: string) =>
        compileServiceFile(
          target,
          path.join(buildMacroTestFolder, macroTestFile),
          macroFolders,
          programFolders
        )
      )
    }
  }

  await compileTestFlow(target).catch((err) =>
    process.logger?.error('Test flow compilation has failed.')
  )
}

export async function copyFilesToBuildFolder(target: Target) {
  const { buildSourceFolder, buildDestinationFolder } = await getConstants()

  await recreateBuildFolder()

  process.logger?.info(`Copying files to ${buildDestinationFolder} .`)

  try {
    const serviceFolders = await getAllServiceFolders(target)
    const jobFolders = await getAllJobFolders(target)

    // REFACTOR
    await asyncForEach(serviceFolders, async (serviceFolder: string) => {
      const destinationPath = await getDestinationServicePath(serviceFolder)
      await copy(serviceFolder, destinationPath)
    })

    await asyncForEach(jobFolders, async (jobFolder) => {
      const destinationPath = await getDestinationJobPath(jobFolder)
      await copy(jobFolder, destinationPath)
    })
  } catch (error) {
    process.logger?.error(
      `An error has occurred when copying files to ${buildDestinationFolder} .`
    )
    throw error
  }
}

export async function compileJobsServicesTests(target: Target) {
  try {
    const serviceFolders = await getAllServiceFolders(target)
    const jobFolders = await getAllJobFolders(target)
    const macroFolders = await getMacroFolders(target)
    const programFolders = await getProgramFolders(target)
    const testSetUp = await getTestSetUp(target)
    const testTearDown = await getTestTearDown(target)

    if (testSetUp)
      await compileTestFile(target, testSetUp).catch((err) =>
        process.logger?.error('Test set up compilation has failed.')
      )
    if (testTearDown)
      await compileTestFile(target, testTearDown).catch((err) =>
        process.logger?.error('Test tear down compilation has failed.')
      )

    await asyncForEach(serviceFolders, async (serviceFolder) => {
      await compileServiceFolder(
        target,
        serviceFolder,
        macroFolders,
        programFolders
      )
    })

    await asyncForEach(jobFolders, async (jobFolder) => {
      await compileJobFolder(target, jobFolder, macroFolders, programFolders)
    })
  } catch (error) {
    process.logger?.error(
      'An error has occurred when compiling your jobs and services.'
    )

    throw error
  }
}

async function recreateBuildFolder() {
  const { buildDestinationFolder } = await getConstants()
  process.logger?.info('Recreating build folder...')
  const pathExists = await fileExists(buildDestinationFolder)
  if (pathExists) {
    await deleteFolder(buildDestinationFolder)
  }
  await createFolder(buildDestinationFolder)
}

const compileServiceFolder = async (
  target: Target,
  serviceFolder: string,
  macroFolders: string[],
  programFolders: string[]
) => {
  const destinationPath = await getDestinationServicePath(serviceFolder)
  const subFolders = await listSubFoldersInFolder(destinationPath)
  const filesNamesInPath = await listFilesInFolder(destinationPath)

  await asyncForEach(filesNamesInPath, async (fileName) => {
    const filePath = path.join(destinationPath, fileName)

    await compileServiceFile(target, filePath, macroFolders, programFolders)

    await moveTestFile(filePath).catch((err) =>
      process.logger?.error('Failed to move test file.')
    )
  })

  await asyncForEach(subFolders, async (subFolder) => {
    const fileNames = await listFilesInFolder(
      path.join(serviceFolder, subFolder)
    )

    await asyncForEach(fileNames, async (fileName) => {
      const filePath = path.join(destinationPath, subFolder, fileName)

      await compileServiceFile(target, filePath, macroFolders, programFolders)

      await moveTestFile(filePath).catch((err) =>
        process.logger?.error('Failed to move test file.')
      )
    })
  })
}

const compileJobFolder = async (
  target: Target,
  jobFolder: string,
  macroFolders: string[],
  programFolders: string[]
) => {
  const destinationPath = await getDestinationJobPath(jobFolder)
  const subFolders = await listSubFoldersInFolder(destinationPath)
  const filesNamesInPath = await listFilesInFolder(destinationPath)

  await asyncForEach(filesNamesInPath, async (fileName) => {
    const filePath = path.join(destinationPath, fileName)

    await compileJobFile(target, filePath, macroFolders, programFolders)

    await moveTestFile(filePath)
  })

  await asyncForEach(subFolders, async (subFolder) => {
    const fileNames = await listFilesInFolder(path.join(jobFolder, subFolder))

    await asyncForEach(fileNames, async (fileName) => {
      const filePath = path.join(destinationPath, subFolder, fileName)

      await compileJobFile(target, filePath, macroFolders, programFolders)

      await moveTestFile(filePath)
    })
  })
}

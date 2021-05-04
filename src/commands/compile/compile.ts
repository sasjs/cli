import path from 'path'
import { getProgramFolders } from '../../utils/config'
import {
  getSubFoldersInFolder,
  getFilesInFolder,
  copy,
  fileExists,
  deleteFolder,
  createFolder
} from '../../utils/file'
import { asyncForEach } from '@sasjs/utils/utils'
import { Target } from '@sasjs/utils/types'
import { getConstants } from '../../constants'
import { checkCompileStatus } from './internal/checkCompileStatus'
import * as compileModule from './compile'
import { getAllJobFolders } from './internal/getAllJobFolders'
import { getAllServiceFolders } from './internal/getAllServiceFolders'
import { compileServiceFile } from './internal/compileServiceFile'
import { compileJobFile } from './internal/compileJobFile'
import { compileTestFile, compileTestFlow } from './internal/compileTestFile'
import {
  getDestinationServicePath,
  getDestinationJobPath
} from './internal/getDestinationPath'
import { moveTestFile } from './internal/compileTestFile'

export async function compile(target: Target, forceCompile = false) {
  const result = await checkCompileStatus(target)

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
      const sourcePath = path.isAbsolute(serviceFolder)
        ? serviceFolder
        : path.join(buildSourceFolder, serviceFolder)

      const destinationPath = await getDestinationServicePath(sourcePath)

      await copy(sourcePath, destinationPath)
    })

    await asyncForEach(jobFolders, async (jobFolder) => {
      const sourcePath = path.isAbsolute(jobFolder)
        ? jobFolder
        : path.join(buildSourceFolder, jobFolder)
      const destinationPath = await getDestinationJobPath(sourcePath)
      await copy(sourcePath, destinationPath)
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
    const macroFolders = target ? target.macroFolders : []
    const programFolders = await getProgramFolders(target)
    const testSetUp = target.testConfig?.testSetUp
    const testTearDown = target.testConfig?.testTearDown

    if (testSetUp)
      await compileTestFile(target, testSetUp, macroFolders).catch((err) =>
        process.logger?.error('Test set up compilation has failed.')
      )
    if (testTearDown)
      await compileTestFile(target, testTearDown, macroFolders).catch((err) =>
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
  const { buildSourceFolder } = await getConstants()
  const folderPath = path.isAbsolute(serviceFolder)
    ? serviceFolder
    : path.join(buildSourceFolder, serviceFolder)
  const destinationPath = await getDestinationServicePath(folderPath)
  const subFolders = await getSubFoldersInFolder(destinationPath)
  const filesNamesInPath = await getFilesInFolder(destinationPath)

  await asyncForEach(filesNamesInPath, async (fileName) => {
    const filePath = path.join(destinationPath, fileName)

    await compileServiceFile(target, filePath, macroFolders, programFolders)

    await moveTestFile(filePath).catch((err) =>
      process.logger?.error('Failed to move test file.')
    )
  })

  await asyncForEach(subFolders, async (subFolder) => {
    const fileNames = await getFilesInFolder(path.join(folderPath, subFolder))

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
  const { buildSourceFolder } = await getConstants()
  const folderPath = path.isAbsolute(jobFolder)
    ? jobFolder
    : path.join(buildSourceFolder, jobFolder)
  const destinationPath = await getDestinationJobPath(folderPath)
  const subFolders = await getSubFoldersInFolder(destinationPath)
  const filesNamesInPath = await getFilesInFolder(destinationPath)

  await asyncForEach(filesNamesInPath, async (fileName) => {
    const filePath = path.join(destinationPath, fileName)

    await compileJobFile(target, filePath, macroFolders, programFolders)

    await moveTestFile(filePath)
  })

  await asyncForEach(subFolders, async (subFolder) => {
    const fileNames = await getFilesInFolder(path.join(folderPath, subFolder))

    await asyncForEach(fileNames, async (fileName) => {
      const filePath = path.join(destinationPath, subFolder, fileName)

      await compileJobFile(target, filePath, macroFolders, programFolders)

      await moveTestFile(filePath)
    })
  })
}

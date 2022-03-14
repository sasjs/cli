import path from 'path'
import {
  getLocalOrGlobalConfig,
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
  listFilesAndSubFoldersInFolder,
  isTestFile,
  CompileTree
} from '@sasjs/utils'
import { createWebAppServices } from '../web/web'
import { isSasFile } from '../../utils/file'
import { Target, StreamConfig } from '@sasjs/utils/types'
import { checkCompileStatus } from './internal/checkCompileStatus'
import * as compileModule from './compile'
import { getAllFolders, SasFileType } from './internal/getAllFolders'
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
import { getCompileTree } from './internal/loadDependencies'

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

  const compileTree = getCompileTree(target)

  await compileModule.compileJobsServicesTests(target, compileTree)

  let macroFolders: string[] = await getMacroFolders(target)

  if (macroFolders.length) {
    const programFolders = await getProgramFolders(target)

    await asyncForEach(
      macroFolders,
      async (macroFolder: string) => await copyTestMacroFiles(macroFolder)
    )

    const buildMacroTestFolder = path.join(
      process.sasjsConstants.buildDestinationTestFolder,
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
          programFolders,
          undefined,
          compileTree
        )
      )
    }
  }

  await compileTestFlow(target).catch((err) =>
    process.logger?.error('Test flow compilation has failed.')
  )

  await compileWeb(target)
}

export async function copyFilesToBuildFolder(target: Target) {
  const { buildDestinationFolder } = process.sasjsConstants

  await recreateBuildFolder()

  process.logger?.info(`Copying files to ${buildDestinationFolder} .`)

  try {
    const serviceFolders = await getAllFolders(target, SasFileType.Service)

    const jobFolders = await getAllFolders(target, SasFileType.Job)

    // REFACTOR
    await asyncForEach(serviceFolders, async (serviceFolder: string) => {
      const destinationPath = getDestinationServicePath(serviceFolder)

      await copy(serviceFolder, destinationPath)
    })

    await asyncForEach(jobFolders, async (jobFolder) => {
      const destinationPath = getDestinationJobPath(jobFolder)

      await copy(jobFolder, destinationPath)
    })
  } catch (error) {
    process.logger?.error(
      `An error has occurred when copying files to ${buildDestinationFolder} .`
    )
    throw error
  }
}

export async function compileJobsServicesTests(
  target: Target,
  compileTree: CompileTree
) {
  try {
    const serviceFolders = await getAllFolders(target, SasFileType.Service)
    const jobFolders = await getAllFolders(target, SasFileType.Job)
    const macroFolders = await getMacroFolders(target)
    const programFolders = await getProgramFolders(target)
    const testSetUp = await getTestSetUp(target)
    const testTearDown = await getTestTearDown(target)

    if (testSetUp)
      await compileTestFile(target, testSetUp, '', true, false).catch((err) =>
        process.logger?.error('Test set up compilation has failed.')
      )
    if (testTearDown)
      await compileTestFile(target, testTearDown, '', true, false).catch(
        (err) => process.logger?.error('Test tear down compilation has failed.')
      )

    await asyncForEach(serviceFolders, async (serviceFolder) => {
      await compileServiceFolder(
        target,
        serviceFolder,
        macroFolders,
        programFolders,
        compileTree
      )
    })

    await asyncForEach(jobFolders, async (jobFolder) => {
      await compileJobFolder(
        target,
        jobFolder,
        macroFolders,
        programFolders,
        compileTree
      )
    })
  } catch (error) {
    process.logger?.error(
      'An error has occurred when compiling your jobs and services.'
    )

    throw error
  }
}

async function recreateBuildFolder() {
  const { buildDestinationFolder } = process.sasjsConstants
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
  programFolders: string[],
  compileTree: CompileTree
) => {
  const destinationPath = getDestinationServicePath(serviceFolder)
  const subFolders = await listSubFoldersInFolder(destinationPath)
  const filesNamesInPath = await listFilesInFolder(destinationPath)

  await asyncForEach(filesNamesInPath, async (fileName) => {
    const filePath = path.join(destinationPath, fileName)

    if (isTestFile(filePath)) await compileTestFile(target, filePath, '', false)
    else {
      await compileServiceFile(
        target,
        filePath,
        macroFolders,
        programFolders,
        undefined,
        compileTree
      )
    }
  })

  await asyncForEach(subFolders, async (subFolder) => {
    const fileNames = await listFilesInFolder(
      path.join(serviceFolder, subFolder)
    )

    await asyncForEach(fileNames, async (fileName) => {
      const filePath = path.join(destinationPath, subFolder, fileName)

      if (isTestFile(filePath)) {
        await compileTestFile(target, filePath, '', false)
      } else {
        await compileServiceFile(
          target,
          filePath,
          macroFolders,
          programFolders,
          undefined,
          compileTree
        )
      }
    })
  })

  compileTree.saveTree()
}

const compileJobFolder = async (
  target: Target,
  jobFolder: string,
  macroFolders: string[],
  programFolders: string[],
  compileTree: CompileTree
) => {
  const destinationPath = getDestinationJobPath(jobFolder)
  const subFolders = await listSubFoldersInFolder(destinationPath)
  const filesNamesInPath = await listFilesInFolder(destinationPath)

  await asyncForEach(filesNamesInPath, async (fileName) => {
    const filePath = path.join(destinationPath, fileName)

    if (isTestFile(fileName)) {
      await compileTestFile(target, filePath, '', false)
    } else {
      await compileJobFile(
        target,
        filePath,
        macroFolders,
        programFolders,
        undefined,
        compileTree
      )
    }
  })

  await asyncForEach(subFolders, async (subFolder) => {
    const fileNames = await listFilesInFolder(path.join(jobFolder, subFolder))

    await asyncForEach(fileNames, async (fileName) => {
      const filePath = path.join(destinationPath, subFolder, fileName)

      if (isTestFile(filePath))
        await compileTestFile(target, filePath, '', false)
      else {
        await compileJobFile(
          target,
          filePath,
          macroFolders,
          programFolders,
          undefined,
          compileTree
        )
      }
    })
  })
}

async function compileWeb(target: Target) {
  const { configuration } = await getLocalOrGlobalConfig()

  const streamConfig = {
    ...configuration?.streamConfig,
    ...target.streamConfig
  } as StreamConfig
  const streamWeb = streamConfig.streamWeb ?? false

  if (streamWeb) {
    process.logger?.info(
      'Compiling web app services since `streamWeb` is enabled.'
    )
    await createWebAppServices(target)
      .then(() =>
        process.logger?.success(`Web app services have been compiled.`)
      )
      .catch((err) => {
        process.logger?.error(
          'An error has occurred when compiling web app services.'
        )
        throw err
      })
  }
}

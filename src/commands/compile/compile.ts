import {
  asyncForEach,
  CompileTree,
  copy,
  createFolder,
  deleteFolder,
  fileExists,
  folderExists,
  isTestFile,
  listFilesAndSubFoldersInFolder,
  listFilesInFolder,
  listSubFoldersInFolder
} from '@sasjs/utils'
import { SASJsFileType, StreamConfig, Target } from '@sasjs/utils/types'
import path from 'path'
import {
  getMacroFolders,
  getProgramFolders,
  getTestSetUp,
  getTestTearDown
} from '../../utils/config'
import { isSasFile } from '../../utils/file'
import { createWebAppServices } from '../web/web'
import * as compileModule from './compile'
import {
  checkCompileStatus,
  compileFile,
  compileTestFile,
  compileTestFlow,
  copyTestMacroFiles,
  copySyncFolder,
  getAllFolders,
  SasFileType,
  getDestinationJobPath,
  getDestinationServicePath,
  getCompileTree
} from './internal'

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

      await asyncForEach(
        macroTestFiles,
        async (macroTestFile: string) =>
          await compileFile(
            target,
            path.join(buildMacroTestFolder, macroTestFile),
            macroFolders,
            programFolders,
            undefined,
            compileTree,
            SASJsFileType.service,
            ''
          )
      )
    }
  }

  await compileTree.saveTree()

  await compileTestFlow(target).catch((err) =>
    process.logger?.error('Test flow compilation has failed.')
  )

  await compileWeb(target)

  await syncFolder(target)
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

    if (testSetUp) {
      await compileTestFile(
        target,
        testSetUp,
        '',
        true,
        false,
        compileTree
      ).catch((err) =>
        process.logger?.error('Test set up compilation has failed.')
      )
    }
    if (testTearDown) {
      await compileTestFile(
        target,
        testTearDown,
        '',
        true,
        false,
        compileTree
      ).catch((err) =>
        process.logger?.error('Test tear down compilation has failed.')
      )
    }

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

// REFACTOR: combine compileServiceFolder and compileJobFolder
const compileServiceFolder = async (
  target: Target,
  serviceFolder: string,
  macroFolders: string[],
  programFolders: string[],
  compileTree: CompileTree
) => {
  const destinationPath = getDestinationServicePath(serviceFolder)
  const subFolders = await listSubFoldersInFolder(destinationPath)
  const sourceFiles = await listFilesInFolder(serviceFolder)

  // Checks if file in sasjsbuild folder exists in source folder.
  // If not, it means that the file shouldn't be compiled.
  await asyncForEach(sourceFiles, async (fileName: string, i: number) => {
    if (!(await fileExists(path.join(serviceFolder, fileName)))) {
      sourceFiles.splice(i, 1)
    }
  })

  await asyncForEach(sourceFiles, async (fileName) => {
    const filePath = path.join(destinationPath, fileName)

    if (isTestFile(filePath)) {
      await compileTestFile(target, filePath, '', false, undefined, compileTree)
    } else {
      await compileFile(
        target,
        filePath,
        macroFolders,
        programFolders,
        undefined,
        compileTree,
        SASJsFileType.service,
        serviceFolder
      )
    }
  })

  await asyncForEach(subFolders, async (subFolder) => {
    const sourceFolder = path.join(serviceFolder, subFolder)
    const sourceFiles = await listFilesInFolder(sourceFolder)

    await asyncForEach(sourceFiles, async (fileName) => {
      const filePath = path.join(destinationPath, subFolder, fileName)

      if (isTestFile(filePath)) {
        await compileTestFile(
          target,
          filePath,
          '',
          false,
          undefined,
          compileTree
        )
      } else {
        await compileFile(
          target,
          filePath,
          macroFolders,
          programFolders,
          undefined,
          compileTree,
          SASJsFileType.service,
          sourceFolder
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
  const sourceFiles = await listFilesInFolder(destinationPath)

  // Checks if file in sasjsbuild folder exists in source folder.
  // If not, it means that the file shouldn't be compiled.
  await asyncForEach(sourceFiles, async (fileName: string, i: number) => {
    if (!(await fileExists(path.join(jobFolder, fileName)))) {
      sourceFiles.splice(i, 1)
    }
  })

  await asyncForEach(sourceFiles, async (fileName) => {
    const filePath = path.join(destinationPath, fileName)

    if (isTestFile(fileName)) {
      await compileTestFile(target, filePath, '', false, undefined, compileTree)
    } else {
      await compileFile(
        target,
        filePath,
        macroFolders,
        programFolders,
        undefined,
        compileTree,
        SASJsFileType.job,
        jobFolder
      )
    }
  })

  await asyncForEach(subFolders, async (subFolder) => {
    const sourcePath = path.join(jobFolder, subFolder)
    const sourceFiles = await listFilesInFolder(sourcePath)

    await asyncForEach(sourceFiles, async (fileName) => {
      const filePath = path.join(destinationPath, subFolder, fileName)

      if (isTestFile(filePath))
        await compileTestFile(
          target,
          filePath,
          '',
          false,
          undefined,
          compileTree
        )
      else {
        await compileFile(
          target,
          filePath,
          macroFolders,
          programFolders,
          undefined,
          compileTree,
          SASJsFileType.job,
          sourcePath
        )
      }
    })
  })
}

async function compileWeb(target: Target) {
  const configuration = process.sasjsConfig

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
          'An error has occurred when compiling web app services.',
          err.toString()
        )
      })
  }
}

const syncFolder = async (target: Target) => {
  const configuration = process.sasjsConfig

  if (configuration.syncFolder) {
    await copySyncFolder(configuration.syncFolder)
  }

  if (target.syncFolder) {
    await copySyncFolder(target.syncFolder)
  }
}

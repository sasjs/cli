import { createFile, isTestFile, CompileTree } from '@sasjs/utils'
import { Target, SASJsFileType } from '@sasjs/utils/types'
import { loadDependencies, shouldPassThrough } from './'
import path from 'path'

/**
 * Compiles file dependencies.
 * @param {Target} target - SAS server configuration.
 * @param {string} filePath - file path of the file to be compiled.
 * @param {string[]} macroFolders - macro folders paths.
 * @param {string[]} programFolders - program folders paths.
 * @param {string} programVar - program variable.
 * @param {object} compileTree - compilation tree that stores used compilation assets.
 * @param {SASJsFileType} fileType - sasjs file type.
 * @param {string} sourceFolder - folder path of the source folder.
 */
export async function compileFile(
  target: Target,
  filePath: string,
  macroFolders: string[],
  programFolders: string[],
  programVar: string = '',
  compileTree: CompileTree,
  fileType: SASJsFileType,
  sourceFolder: string
) {
  // Only SAS programs are compiled. Anything else - a `.js` stored program, a
  // web asset, a file a deploy script reads - is already in the build folder
  // from the folder copy, and parsing it as SAS would corrupt it.
  if (shouldPassThrough(path.basename(filePath))) {
    process.logger?.info(
      `Copying ${path.basename(
        filePath
      )} to the build folder unchanged - it is not a SAS program.`
    )

    return
  }

  let dependencies = await loadDependencies(
    target,
    sourceFolder
      ? path.join(sourceFolder, filePath.split(path.sep).pop()!)
      : filePath,
    macroFolders,
    programFolders,
    isTestFile(filePath) ? SASJsFileType.test : fileType,
    compileTree
  )

  if (fileType === SASJsFileType.service) {
    dependencies = `${programVar}\n${dependencies}`
  } else {
    dependencies = `${programVar ? programVar + '\n' : ''}${dependencies}`
  }

  await createFile(filePath, dependencies)
}

import { createFile, readFile, isTestFile, CompileTree } from '@sasjs/utils'
import { Target, ServerType, SASJsFileType } from '@sasjs/utils/types'
import { ServerTypeError } from '@sasjs/utils/error'
import { loadDependencies } from './loadDependencies'
import { getServerType } from './getServerType'
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

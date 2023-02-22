import path from 'path'
import { getProgramFolders, getMacroFolders } from '../../utils/config'
import {
  Target,
  fileExists,
  deleteFolder,
  createFolder,
  copy,
  getAbsolutePath,
  SASJsFileType
} from '@sasjs/utils'
import { compileFile } from './internal/compileFile'
import { identifySasFile } from './internal/identifySasFile'
import { getCompileTree } from './internal/loadDependencies'

export async function compileSingleFile(
  target: Target,
  subCommand: string = 'identify',
  source: string,
  output: string,
  insertProgramVar: boolean = false,
  currentFolder?: string
) {
  const subCommands = {
    job: 'job',
    service: 'service'
  }

  if (!subCommands.hasOwnProperty(subCommand) && subCommand !== 'identify') {
    throw new Error(
      `Unsupported context command. Supported commands are:\n${Object.keys(
        subCommands
      ).join('\n')}`
    )
  }

  const commandExample =
    'sasjs compile <command> --source myjob.sas --target targetName -output /some/folder'

  if (!source) {
    throw new Error(`'--source' flag is missing (eg '${commandExample}')`)
  }

  source = source.split('/').join(path.sep)

  const sourcePath = getAbsolutePath(
    source,
    currentFolder || process.currentDir
  )

  if (!(await validateSourcePath(sourcePath))) {
    throw new Error(`Provide a path to source file (eg '${commandExample}')`)
  }

  if (subCommand === 'identify') {
    subCommand = await identifySasFile(target, sourcePath)
  }

  process.logger?.info(`Compiling source file:\n- ${sourcePath}`)

  let outputPathParts = output.split(path.sep)
  const leafFolderName = source.split(path.sep).pop() as string
  outputPathParts.pop(), outputPathParts.pop()
  const parentOutputFolder = outputPathParts.join(path.sep)

  const pathExists = await fileExists(parentOutputFolder)
  if (pathExists) await deleteFolder(parentOutputFolder)

  await createFolder(output)

  const sourceFileName = sourcePath.split(path.sep).pop() as string
  const destinationPath = path.join(output, sourceFileName)
  await copy(sourcePath, destinationPath)

  const sourceFileNameWithoutExt = sourceFileName.split('.')[0]
  const macroFolders = await getMacroFolders(target)
  const programFolders = await getProgramFolders(target)
  const psMaxOption = 'options ps=max;'
  const programVar = insertProgramVar
    ? `%let _program=${target.appLoc}/${subCommand}s/${leafFolderName}/${sourceFileNameWithoutExt};\n${psMaxOption}`
    : `${psMaxOption}`
  const compileTree = getCompileTree(target)
  const sourceFolder = sourcePath
    .split(path.sep)
    .slice(0, sourcePath.split(path.sep).length - 1)
    .join(path.sep)

  switch (subCommand) {
    case subCommands.service:
      await compileFile(
        target,
        destinationPath,
        macroFolders,
        programFolders,
        programVar,
        compileTree,
        SASJsFileType.service,
        sourceFolder
      )
      break
    case subCommands.job:
      await compileFile(
        target,
        destinationPath,
        macroFolders,
        programFolders,
        programVar,
        compileTree,
        SASJsFileType.job,
        sourceFolder
      )
      break
    default:
      break
  }

  await compileTree.saveTree()

  return { destinationPath }
}

async function validateSourcePath(path: string) {
  if (!path) return false

  const isSourceFile = /\.sas$/i.test(path)

  if (!isSourceFile) return false

  return await fileExists(path)
}

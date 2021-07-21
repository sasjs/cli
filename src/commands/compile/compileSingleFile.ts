import path from 'path'
import { getProgramFolders, getMacroFolders } from '../../utils/config'
import { getAbsolutePath } from '../../utils/utils'
import { fileExists, deleteFolder, createFolder, copy } from '@sasjs/utils'
import { Target } from '@sasjs/utils/types'
import { compileServiceFile } from './internal/compileServiceFile'
import { compileJobFile } from './internal/compileJobFile'
import { identifySasFile } from './internal/identifySasFile'
import { Command } from '../../utils/command'
import {
  getDestinationServicePath,
  getDestinationJobPath
} from './internal/getDestinationPath'

export async function compileSingleFile(
  target: Target,
  command: Command,
  subCommand: string = 'identify',
  insertProgramVar: boolean = false
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

  let source = command.getFlagValue('source') as string
  const output = command.getFlagValue('output') as string

  if (!source) {
    throw new Error(`'--source' flag is missing (eg '${commandExample}')`)
  }

  source = source.split('/').join(path.sep)

  const sourcePath = getAbsolutePath(source, process.currentDir)

  if (!(await validateSourcePath(sourcePath))) {
    throw new Error(`Provide a path to source file (eg '${commandExample}')`)
  }

  if (subCommand === 'identify') {
    subCommand = await identifySasFile(target, sourcePath)
  }

  let sourcefilePathParts = sourcePath.split(path.sep)
  sourcefilePathParts.splice(-1, 1)
  const sourceFolderPath = sourcefilePathParts.join(path.sep)
  const leafFolderName = sourceFolderPath.split(path.sep).pop() as string
  const outputPath = output
    ? path.isAbsolute(output)
      ? path.join(output, `${subCommand}s`, leafFolderName)
      : path.join(process.currentDir!, output, `${subCommand}s`, leafFolderName)
    : subCommand === subCommands.job
    ? await getDestinationJobPath(sourceFolderPath)
    : await getDestinationServicePath(sourceFolderPath)

  process.logger?.info(`Compiling source file:\n- ${sourcePath}`)

  let outputPathParts = outputPath.split(path.sep)
  outputPathParts.pop(), outputPathParts.pop()
  const parentOutputFolder = outputPathParts.join(path.sep)

  const pathExists = await fileExists(parentOutputFolder)
  if (pathExists) await deleteFolder(parentOutputFolder)

  await createFolder(outputPath)

  const sourceFileName = sourcePath.split(path.sep).pop() as string
  const destinationPath = path.join(outputPath, sourceFileName)
  await copy(sourcePath, destinationPath)

  const sourceFileNameWithoutExt = sourceFileName.split('.')[0]
  const macroFolders = await getMacroFolders(target)
  const programFolders = await getProgramFolders(target)
  const psMaxOption = 'options ps=max;'
  const programVar = insertProgramVar
    ? `%let _program=${target.appLoc}/${subCommand}s/${leafFolderName}/${sourceFileNameWithoutExt};\n${psMaxOption}`
    : `${psMaxOption}`

  switch (subCommand) {
    case subCommands.service:
      await compileServiceFile(
        target,
        destinationPath,
        macroFolders,
        programFolders,
        programVar
      )
      break
    case subCommands.job:
      await compileJobFile(
        target,
        destinationPath,
        macroFolders,
        programFolders,
        programVar
      )
      break
    default:
      break
  }

  return { destinationPath }
}

async function validateSourcePath(path: string) {
  if (!path) return false

  const isSourceFile = /\.sas$/i.test(path)

  if (!isSourceFile) return false

  return await fileExists(path)
}

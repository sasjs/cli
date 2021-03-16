import path from 'path'
import { getProgramFolders } from '../../utils/config'
import { copy, fileExists, deleteFolder, createFolder } from '../../utils/file'
import { Target } from '@sasjs/utils/types'
import { getConstants } from '../../constants'
import { compileServiceFile } from './internal/compileServiceFile'
import { compileJobFile } from './internal/compileJobFile'
import { Command } from '../../utils/command'

export async function compileSingleFile(
  target: Target,
  command: Command,
  subCommand: string
) {
  const subCommands = {
    job: 'job',
    service: 'service'
  }

  if (!subCommands.hasOwnProperty(subCommand)) {
    throw new Error(
      `Unsupported context command. Supported commands are:\n${Object.keys(
        subCommands
      ).join('\n')}`
    )
  }

  const commandExample =
    'sasjs compile <command> --source myjob.sas --target targetName -output /some/folder'

  const source = command.getFlagValue('source') as string
  const output = command.getFlagValue('output') as string

  if (!source) {
    throw new Error(`'--source' flag is missing (eg '${commandExample}')`)
  }

  const sourcePath = path.isAbsolute(source)
    ? source
    : path.join(process.currentDir!, source)

  if (!(await validateSourcePath(sourcePath))) {
    throw new Error(`Provide a path to source file (eg '${commandExample}')`)
  }

  const { buildDestinationFolder } = await getConstants()
  const outputPath = output
    ? path.isAbsolute(output)
      ? output
      : path.join(process.currentDir!, output)
    : buildDestinationFolder

  process.logger?.info(`Compiling source file:\n- ${sourcePath}`)

  await deleteFolder(outputPath)
  await createFolder(outputPath)

  const sourceFileName = sourcePath.split(path.sep).pop() as string
  const destinationPath = path.join(outputPath, sourceFileName)
  await copy(sourcePath, destinationPath)

  const macroFolders = target ? target.macroFolders : []
  const programFolders = await getProgramFolders(target)

  switch (subCommand) {
    case subCommands.service:
      await compileServiceFile(
        target,
        destinationPath,
        macroFolders,
        programFolders
      )
      break
    case subCommands.job:
      await compileJobFile(
        target,
        destinationPath,
        macroFolders,
        programFolders
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

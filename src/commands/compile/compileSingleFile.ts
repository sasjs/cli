import path from 'path'
import { getProgramFolders, getMacroFolders } from '../../utils/config'
import {
  Target,
  fileExists,
  createFolder,
  copy,
  getAbsolutePath,
  SASJsFileType
} from '@sasjs/utils'
import { prefixMessage } from '@sasjs/utils/error'
import {
  compileFile,
  identifySasFile,
  getCompileTree,
  compileTestFile,
  getAllFolders,
  SasFileType
} from './internal'

export enum CompileSingleFileSubCommands {
  Job = 'job',
  Service = 'service',
  Test = 'test'
}

const isCompileSingleFileSubCommands = (command: string) =>
  (Object.values(CompileSingleFileSubCommands) as string[]).includes(command)

/** The longest configured folder that contains the given folder, if any. */
const getContainingFolder = (
  folders: string[],
  folder: string
): string | undefined =>
  folders
    .filter(
      (configured) =>
        folder === configured || folder.startsWith(configured + path.sep)
    )
    .sort((a, b) => b.length - a.length)[0]

/** The configured folders that can hold a file of this type. */
const getConfiguredFolders = async (
  target: Target,
  subCommand: string
): Promise<string[]> => {
  if (subCommand === CompileSingleFileSubCommands.Service)
    return await getAllFolders(target, SasFileType.Service)

  if (subCommand === CompileSingleFileSubCommands.Job)
    return await getAllFolders(target, SasFileType.Job)

  return [
    ...(await getAllFolders(target, SasFileType.Service)),
    ...(await getAllFolders(target, SasFileType.Job)),
    ...(await getMacroFolders(target))
  ]
}

/** A test is filed under tests/services, tests/jobs or tests/macros. */
const getTestType = async (
  target: Target,
  sourceFolder: string
): Promise<string> => {
  // A test kept in the project's own tests tree says which kind it is.
  const segments = sourceFolder.split(path.sep)
  const testsIndex = segments.lastIndexOf('tests')

  if (testsIndex !== -1) {
    const fromPath = segments[testsIndex + 1]

    if (['services', 'jobs', 'macros'].includes(fromPath)) return fromPath
  }

  const byType = [
    {
      type: 'services',
      folders: await getAllFolders(target, SasFileType.Service)
    },
    { type: 'jobs', folders: await getAllFolders(target, SasFileType.Job) },
    { type: 'macros', folders: await getMacroFolders(target) }
  ]

  const fromConfiguredFolders = byType.find(({ folders }) =>
    getContainingFolder(folders, sourceFolder)
  )?.type

  if (!fromConfiguredFolders) {
    throw new Error(
      `Single file compilation failed. Cannot tell which test tree ${sourceFolder} belongs to - keep the test under a configured folder, or under tests/services, tests/jobs or tests/macros.`
    )
  }

  return fromConfiguredFolders
}

/** The folder a file of this type is written under. */
const getTypeFolderName = (subCommand: string, testType?: string): string => {
  switch (subCommand) {
    case CompileSingleFileSubCommands.Job:
      return 'jobs'
    case CompileSingleFileSubCommands.Service:
      return 'services'
    case CompileSingleFileSubCommands.Test:
      return path.posix.join('tests', testType as string)
    default:
      throw new Error(
        `Single file compilation failed. Unsupported sub command: ${subCommand}`
      )
  }
}

/** The build folder a project compile uses for this type. */
const getBaseFolder = (subCommand: string, testType?: string): string => {
  const {
    buildDestinationJobsFolder,
    buildDestinationServicesFolder,
    buildDestinationTestFolder
  } = process.sasjsConstants

  if (subCommand === CompileSingleFileSubCommands.Job)
    return buildDestinationJobsFolder

  if (subCommand === CompileSingleFileSubCommands.Service)
    return buildDestinationServicesFolder

  return path.join(buildDestinationTestFolder, testType as string)
}

export async function compileSingleFile(
  target: Target,
  subCommand: string = 'identify',
  source: string,
  output?: string,
  insertProgramVar: boolean = false,
  currentFolder?: string
) {
  if (
    !isCompileSingleFileSubCommands(subCommand) &&
    subCommand !== 'identify'
  ) {
    throw new Error(
      `Unsupported context command. Supported commands are:\n${Object.values(
        CompileSingleFileSubCommands
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
    throw new Error(
      `Provide a valid path to source file (eg '${commandExample}')`
    )
  }

  if (subCommand === 'identify') {
    subCommand = await identifySasFile(target, sourcePath).catch((err) => {
      throw prefixMessage(err, 'Single file compilation failed. ')
    })
  }

  process.logger?.info(`Compiling source file:\n- ${sourcePath}`)

  const sourcePathParts = sourcePath.split(path.sep)
  const sourceFileName = sourcePathParts.pop() as string
  const sourceFileNameWithoutExt = sourceFileName.replace(/\.sas$/i, '')
  const sourceFolder = sourcePathParts.join(path.sep)

  // Where a project compile puts this file: each configured folder is copied to
  // <type folder>/<its own name>, keeping the structure below it. Mirrored here
  // so a single-file compile writes to the same path a project compile does.
  const configuredFolders = await getConfiguredFolders(target, subCommand)
  const configuredFolder = getContainingFolder(configuredFolders, sourceFolder)

  // A configured folder contributes its own name and the path below it. With no
  // configuration to consult, the file's own folder stands in - the only signal
  // available. With configuration but no match the file sits outside the
  // project's folders and goes straight into the type folder.
  const leafFolderName = configuredFolder
    ? path.basename(configuredFolder)
    : configuredFolders.length
      ? ''
      : path.basename(sourceFolder)
  const relativeFolder = configuredFolder
    ? path.relative(configuredFolder, sourceFolder)
    : ''

  const testType =
    subCommand === CompileSingleFileSubCommands.Test
      ? await getTestType(target, sourceFolder)
      : undefined

  const typeFolderName = getTypeFolderName(subCommand, testType)

  const destinationFolder = output
    ? path.join(output, typeFolderName, leafFolderName, relativeFolder)
    : path.join(
        getBaseFolder(subCommand, testType),
        leafFolderName,
        relativeFolder
      )

  // Nothing is deleted: the folder is created if missing and the compiled file
  // overwrites its previous copy, so siblings in the same leaf folder survive.
  await createFolder(destinationFolder)

  const destinationPath = path.join(destinationFolder, sourceFileName)

  await copy(sourcePath, destinationPath)

  const macroFolders = await getMacroFolders(target)
  const programFolders = await getProgramFolders(target)
  const psMaxOption = 'options ps=max;'
  // Mirrors the destination exactly, so _program cannot name a folder the file
  // was not written to.
  const programFolder = [typeFolderName, leafFolderName, relativeFolder]
    .filter(Boolean)
    .join('/')
    .split(path.sep)
    .join('/')
  const programVar = insertProgramVar
    ? `%let _program=${target.appLoc}/${programFolder}/${sourceFileNameWithoutExt};\n${psMaxOption}`
    : `${psMaxOption}`
  const compileTree = getCompileTree(target)

  switch (subCommand) {
    case CompileSingleFileSubCommands.Service:
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
    case CompileSingleFileSubCommands.Job:
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
    case CompileSingleFileSubCommands.Test:
      await compileTestFile(
        target,
        sourcePath,
        programVar,
        undefined,
        false,
        compileTree,
        destinationPath
      )
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

import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'
import { displayError, isSASjsProject, saveLog } from '../../utils'
import path, { join } from 'path'
import {
  createFile,
  compareHashes,
  findResourcesNotPresentLocally,
  generateCompileProgram,
  getHash,
  generateProgramToGetRemoteHash,
  generateProgramToSyncHashDiff,
  getRelativePath,
  generateTimestamp
} from '@sasjs/utils'
import { CommandOptions } from '../../types/command/commandBase'
import { executeCode } from './internal/executeCode'
import { extractHashArray } from './internal/extractHashArray'

enum FsSubCommand {
  Compile = 'compile',
  Sync = 'sync'
}

const syntax = 'fs <subCommand> [options]'
const usage = 'Usage: sasjs fs <subCommand> [options]'
// TODO: update
const description = 'Handles operations around file system synchronisation'

const compileCommandSyntax = 'fs <subCommand> <localFolder> [options]'
const compileCommandUsage = 'Usage: sasjs fs compile <localFolder> [options]'
const compileCommandDescription =
  'Compiles a SAS program with the contents of a local directory'
const compileCommandExamples: CommandExample[] = [
  {
    command:
      'sasjs fs compile <path/of/folder> --output <path/of/outputProgram>',
    description: 'Compiles a SAS program with the contents of a local directory'
  }
]

const syncCommandSyntax = 'fs <subCommand> <localFolder> <remoteFolder>'
const syncCommandUsage = 'Usage: sasjs fs sync <localFolder> <remoteFolder>'
const syncCommandDescription =
  'Synchronise the remote SAS file system with the local project folder according to the target `syncDirectories` array'
const syncCommandExamples: CommandExample[] = [
  {
    command: 'sasjs fs sync <path/of/folder> <path/of/remote/folder>',
    description:
      'Synchronise the remote SAS file system with the local project folder according to the target `syncDirectories` array'
  }
]

const parseOptions = {
  output: { type: 'string', alias: 'o' }
}

export class FSCommand extends TargetCommand {
  constructor(args: string[]) {
    const commandOptions: CommandOptions = {
      syntax,
      usage,
      description,
      parseOptions
    }

    const subCommand = args[3]

    switch (subCommand) {
      case FsSubCommand.Compile:
        commandOptions.syntax = compileCommandSyntax
        commandOptions.usage = compileCommandUsage
        commandOptions.description = compileCommandDescription
        commandOptions.examples = compileCommandExamples
        break
      case FsSubCommand.Sync:
        commandOptions.syntax = syncCommandSyntax
        commandOptions.usage = syncCommandUsage
        commandOptions.description = syncCommandDescription
        commandOptions.examples = syncCommandExamples
        break
    }

    super(args, commandOptions)
  }

  public get localFolder(): string {
    const sourcePath = this.parsed.localFolder as string
    const currentDirPath = path.isAbsolute(sourcePath) ? '' : process.projectDir
    return path.join(currentDirPath, sourcePath)
  }

  public get remoteFolder(): string {
    const remotePath = this.parsed.remoteFolder as string
    return remotePath.endsWith(path.sep) ? remotePath.slice(0, -1) : remotePath
  }

  public async getOutputPath(): Promise<string> {
    let outputPath = this.parsed.output as string
    if (this.parsed.subCommand === FsSubCommand.Compile) {
      if (!outputPath) {
        const outputFolder = path.join(
          process.sasjsConstants.buildDestinationFolder,
          'fs-compile',
          generateTimestamp()
        )

        const filename = 'compileProgram.sas'
        return path.join(outputFolder, filename)
      }

      if (!outputPath.endsWith('.sas')) {
        outputPath += '.sas'
      }
    }

    if (!outputPath) {
      return path.join(
        process.sasjsConstants.buildDestinationResultsFolder,
        'fs',
        generateTimestamp()
      )
    }

    if (path.isAbsolute(outputPath)) return outputPath

    return path.join(process.cwd(), outputPath)
  }

  public async execute() {
    if (this.parsed.subCommand === FsSubCommand.Compile) {
      return await this.compile()
    }

    if (this.parsed.subCommand === FsSubCommand.Sync) {
      return await this.sync()
    }
    return ReturnCode.InvalidCommand
  }

  async compile() {
    const folderPath = this.localFolder
    const outputPath = await this.getOutputPath()

    const programContent = await generateCompileProgram(folderPath)

    return await createFile(outputPath, programContent)
      .then(() => {
        process.logger?.success(
          `A compiled sas program has been successfully created at ${outputPath}`
        )
        return ReturnCode.Success
      })
      .catch((err) => {
        displayError(err, 'An error has occurred when creating program file.')
        return ReturnCode.InternalError
      })
  }

  async sync() {
    const { target } = await this.getTargetInfo()
    const remoteFolderPath = this.remoteFolder
    const localFolderPath = this.localFolder
    const outputFolder = await this.getOutputPath()

    process.logger?.info('generating program to get remote hash')
    const program = await generateProgramToGetRemoteHash(remoteFolderPath)

    process.logger?.info('executing program to get remote hash')
    const { log } = await executeCode(target, program)
    await saveLog(log, path.join(outputFolder, 'getRemoteHash.log'), '', false)

    process.logger?.info('extracting hashes from log')
    const remoteHashes = extractHashArray(log)
    await createHashFile(
      JSON.stringify(remoteHashes, null, 2),
      path.join(outputFolder, 'hashesBeforeSync.json')
    )

    process.logger?.info('creating the hash of local folder')
    const localHash = await getHash(localFolderPath)

    const remoteHashMap = remoteHashes.reduce(
      (map: { [key: string]: string }, item: any) => {
        const relativePath = getRelativePath(remoteFolderPath, item.FILE_PATH)
        map[relativePath] = item.FILE_HASH
        return map
      },
      {}
    )

    if (remoteHashMap[localHash.relativePath] === localHash.hash) {
      process.logger?.info(
        'There are no differences between Remote and Local directory. Already synced.'
      )
      return ReturnCode.Success
    }

    process.logger?.info('Extract differences from local and remote hash')
    const hashedDiff = compareHashes(localHash, remoteHashMap)
    await createHashFile(
      JSON.stringify(hashedDiff, null, 2),
      path.join(outputFolder, 'hashesDiff.json')
    )

    process.logger?.info('generating program to sync differences')
    const syncProgram = await generateProgramToSyncHashDiff(
      hashedDiff,
      remoteFolderPath
    )

    process.logger?.info('executing program to sync differences')
    const { log: syncLog } = await executeCode(target, syncProgram)
    await saveLog(syncLog, path.join(outputFolder, 'sync.log'), '', false)

    const syncedHash = extractHashArray(syncLog)
    await createHashFile(
      JSON.stringify(syncedHash, null, 2),
      path.join(outputFolder, 'hashesAfterSync.json')
    )
    const syncedHashMap = syncedHash.reduce(
      (map: { [key: string]: string }, item: any) => {
        const relativePath = getRelativePath(remoteFolderPath, item.FILE_PATH)
        map[relativePath] = item.FILE_HASH
        return map
      },
      {}
    )

    const syncedResources: string[] = []

    Object.entries(syncedHashMap).forEach(([key, value]) => {
      if (remoteHashMap[key] !== value) syncedResources.push(key)
    })

    if (syncedResources.length) {
      process.logger?.log('The following resources were synced:')
      syncedResources.forEach((item) => {
        process.logger?.log(`* ${item}`)
      })
    }

    const resourcesNotPresentLocally = findResourcesNotPresentLocally(
      localHash,
      syncedHashMap
    )

    if (resourcesNotPresentLocally.length) {
      process.logger?.log(
        'The following resources are present in remote directory but not in local:'
      )
      resourcesNotPresentLocally.forEach((item) => {
        process.logger?.log(`* ${item}`)
      })
    }

    return ReturnCode.Success
  }
}

const createHashFile = async (content: string, fileName: string) => {
  process.logger?.info(`Creating json file at ${fileName} .`)
  await createFile(fileName, content)
  process.logger?.success(`Hashes saved to  ${fileName} .`)
}

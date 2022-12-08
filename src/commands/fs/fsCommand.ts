import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'
import { displayError, getSyncDirectories, saveLog } from '../../utils'
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
  generateTimestamp,
  SyncDirectoryMap
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
const description = 'Handles operations around file system synchronisation'
const parseOptions = {
  output: { type: 'string', alias: 'o' }
}

const compileCommandSyntax = 'fs <subCommand> <localFolder> [options]'
const compileCommandUsage = 'sasjs fs compile <localFolder> [options]'
const compileCommandDescription =
  'Compiles a SAS program with the contents of a local directory'
const compileCommandExamples: CommandExample[] = [
  {
    command:
      'sasjs fs compile <path/of/folder> --output <path/of/outputProgram>',
    description: 'Compiles a SAS program with the contents of a local directory'
  }
]

const syncCommandSyntax = 'fs <subCommand> [options]'
const syncCommandUsage = 'sasjs fs sync'
const syncCommandDescription =
  'Synchronise the remote SAS file system with the local project folder according to the target `syncDirectories` array'
const syncCommandExamples: CommandExample[] = [
  {
    command:
      'sasjs fs sync --local <path/of/folder> --remote <path/of/remote/folder>',
    description: ''
  },
  {
    command:
      'sasjs fs sync --local <path/of/folder> --remote <path/of/remote/folder> --target <target-name>',
    description: ''
  },
  {
    command:
      'sasjs fs sync -l <path/of/folder> -r <path/of/remote/folder> -t <target-name>',
    description: ''
  }
]

const syncCommandParseOptions = {
  ...parseOptions,
  local: { type: 'string', alias: 'l' },
  remote: { type: 'string', alias: 'r' }
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
        commandOptions.parseOptions = syncCommandParseOptions
        break
    }

    super(args, commandOptions)
  }

  public get localFolder(): string {
    const sourcePath = (this.parsed.local as string) ?? ''
    const currentDirPath = path.isAbsolute(sourcePath) ? '' : process.projectDir
    return path.join(currentDirPath, sourcePath)
  }

  public get remoteFolder(): string {
    const remotePath = (this.parsed.remote as string) ?? ''
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
        'fs-sync',
        generateTimestamp()
      )
    }

    if (path.isAbsolute(outputPath)) {
      return path.join(outputPath, generateTimestamp())
    }

    return path.join(process.cwd(), outputPath, generateTimestamp())
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
    const { target, isLocal } = await this.getTargetInfo()
    const remoteFolderPath = this.remoteFolder
    const localFolderPath = this.localFolder

    const syncDirectories: SyncDirectoryMap[] = []

    if (remoteFolderPath && localFolderPath) {
      syncDirectories.push({ remote: remoteFolderPath, local: localFolderPath })
    } else {
      syncDirectories.push(...(await getSyncDirectories(target, isLocal)))
    }

    if (!syncDirectories.length) {
      process.logger?.info('There are no directories to sync.')
      return ReturnCode.Success
    }

    for (const obj of syncDirectories) {
      const outputFolder = await this.getOutputPath()

      try {
        process.logger?.info('generating program to get remote hash')
        const program = await generateProgramToGetRemoteHash(obj.remote)
        await createProgramFile(
          program,
          path.join(outputFolder, 'getRemoteHash.sas')
        )

        process.logger?.info('executing program to get remote hash')
        const { log } = await executeCode(target, program)
        await saveLog(
          log,
          path.join(outputFolder, 'getRemoteHash.log'),
          '',
          false
        )

        process.logger?.info('extracting hashes from log')
        const remoteHashes = extractHashArray(log)
        await createHashFile(
          JSON.stringify(remoteHashes, null, 2),
          path.join(outputFolder, 'hashesBeforeSync.json')
        )

        process.logger?.info('creating the hash of local folder')
        const localHash = await getHash(obj.local)

        const remoteHashMap = remoteHashes.reduce(
          (map: { [key: string]: string }, item: any) => {
            const relativePath = getRelativePath(obj.remote, item.FILE_PATH)
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
          obj.remote
        )
        await createProgramFile(
          syncProgram,
          path.join(outputFolder, 'syncProgram.sas')
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
            const relativePath = getRelativePath(obj.remote, item.FILE_PATH)
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
          process.logger?.log(
            `The following resources were synced to: ${obj.remote}`
          )
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
      } catch (error: any) {
        const logPath = path.join(outputFolder, 'error.log')

        await createErrorLogFile(error, logPath)

        process.logger?.error(
          `An error has occurred. For more info see ${logPath}`
        )

        return ReturnCode.InternalError
      }
    }

    return ReturnCode.Success
  }
}

const createHashFile = async (content: string, fileName: string) => {
  process.logger?.info(`Creating json file at ${fileName} .`)
  await createFile(fileName, content)
  process.logger?.success(`Hashes saved to  ${fileName} .`)
}

const createProgramFile = async (program: string, fileName: string) => {
  process.logger?.info(`Creating program file at ${fileName} .`)
  await createFile(fileName, program)
  process.logger?.success(`Program saved to  ${fileName} .`)
}

const createErrorLogFile = async (error: any, logPath: string) => {
  if (error.log) {
    return await createFile(logPath, error.log)
  }

  if (error instanceof Error) {
    return await createFile(logPath, error.toString())
  }

  if (typeof error === 'object') {
    return await createFile(logPath, JSON.stringify(error, null, 2))
  }

  await createFile(logPath, error)
}

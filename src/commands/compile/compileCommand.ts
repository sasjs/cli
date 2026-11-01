import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'
import { displayError } from '../../utils'
import { compile } from './compile'
import path from 'path'
import { compileSingleFile } from './compileSingleFile'
import { getAbsolutePath } from '@sasjs/utils'

enum CompileSubCommand {
  Job = 'job',
  Service = 'service',
  Test = 'test',
  Identify = 'identify'
}

const syntax = 'compile [subCommand]'
const aliases = ['c']
const usage = 'Usage: sasjs compile [subCommand] [options]'
const description =
  'Compiles jobs and services in the project by inlining all dependencies and adds init and term programs as configured in the specified target. With a subCommand (job, service, test or identify) and --source, compiles a single file to the folder matching its type.'
const examples: CommandExample[] = [
  {
    command: 'sasjs compile -t myTarget',
    description: 'compiles every job and service in the project'
  },
  {
    command: 'sasjs c -t myTarget',
    description: 'the same, using the alias'
  },
  {
    command: 'sasjs compile job --source sasjs/jobs/daily/load.sas -t myTarget',
    description: 'compiles one job'
  },
  {
    command:
      'sasjs compile identify --source sasjs/services/admin/users.sas -t myTarget -o /tmp/out',
    description: 'works out the file type and compiles it below /tmp/out'
  }
]

const subCommandParseOptions = {
  source: { type: 'string', alias: 's', demandOption: true },
  output: { type: 'string', alias: 'o' }
}

export class CompileCommand extends TargetCommand {
  constructor(args: string[]) {
    let parseOptions = {}
    const subCommand = args[3]

    if (
      [
        CompileSubCommand.Job,
        CompileSubCommand.Service,
        CompileSubCommand.Test,
        CompileSubCommand.Identify
      ].includes(subCommand as CompileSubCommand)
    ) {
      parseOptions = subCommandParseOptions
    }

    super(args, { parseOptions, syntax, usage, description, examples, aliases })
  }

  public get source(): string {
    return this.parsed.source as string
  }

  /**
   * The base folder requested with `--output`, or undefined to let the compile
   * use the build folder for the file's type. The type sub folder, the
   * configured folder's name and the file's own path below it are added by
   * compileSingleFile, so there is one implementation of the destination.
   */
  public getOutputPath(): string | undefined {
    const value = this.parsed.output as string

    return value ? getAbsolutePath(value, process.currentDir) : undefined
  }

  public async execute() {
    return this.parsed.subCommand
      ? await this.executeSingleFileCompile()
      : await this.executeCompile()
  }

  async executeCompile() {
    const { target } = await this.getTargetInfo()
    const { buildDestinationFolder } = process.sasjsConstants

    return await compile(target)
      .then(() => {
        process.logger?.success(
          `The project was successfully compiled for ${target.serverType} using target '${target.name}'\nThe compile output is located in the ${buildDestinationFolder} directory.`
        )

        return ReturnCode.Success
      })
      .catch((err) => {
        displayError(err, 'An error has occurred during compilation.')

        return ReturnCode.InternalError
      })
  }

  async executeSingleFileCompile() {
    const { target } = await this.getTargetInfo()

    // 'identify' is resolved once, in compileSingleFile, so the command and
    // other callers such as `sasjs run --compile` cannot disagree about it.
    return await compileSingleFile(
      target,
      this.parsed.subCommand as string,
      this.source,
      this.getOutputPath()
    )
      .then((res) => {
        process.logger?.success(
          `Source has been successfully compiled!\nThe compiled output is located at: ${res.destinationPath}`
        )

        return ReturnCode.Success
      })
      .catch((err) => {
        displayError(err, 'Error compiling source.')

        return ReturnCode.InternalError
      })
  }
}

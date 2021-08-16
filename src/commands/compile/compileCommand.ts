import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'
import { displayError } from '../../utils'
import { compile } from './compile'
import path from 'path'
import {
  getDestinationJobPath,
  getDestinationServicePath
} from './internal/getDestinationPath'
import { compileSingleFile } from './compileSingleFile'

enum CompileSubCommand {
  Job = 'job',
  Service = 'service',
  Identify = 'identify'
}

const syntax = 'compile [subCommand]'
const aliases = ['c']
const usage = 'Usage: sasjs compile [subCommand] [options]'
const description =
  'Compiles jobs and services in the project by inlining all dependencies and adds init and term programs as configured in the specified target.'
const examples: CommandExample[] = [
  {
    command: 'sasjs compile -t myTarget',
    description: ''
  },
  {
    command: 'sasjs c -t myTarget',
    description: ''
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
        CompileSubCommand.Identify,
        CompileSubCommand.Service
      ].includes(subCommand as CompileSubCommand)
    ) {
      parseOptions = subCommandParseOptions
    }
    super(args, { parseOptions, syntax, usage, description, examples, aliases })
  }

  public get source(): string {
    return this.parsed.source as string
  }

  public get output(): string {
    const value = this.parsed.output as string
    const sourcefilePathParts = this.source.split(path.sep)
    sourcefilePathParts.splice(-1, 1)
    const sourceFolderPath = sourcefilePathParts.join(path.sep)
    const leafFolderName = sourceFolderPath.split(path.sep).pop() as string

    let outputPath: string
    if (value)
      outputPath = path.isAbsolute(value)
        ? path.join(value, `${this.subCommand}s`, leafFolderName)
        : path.join(
            process.currentDir!,
            value,
            `${this.subCommand}s`,
            leafFolderName
          )
    else
      outputPath =
        this.subCommand === 'job'
          ? getDestinationJobPath(sourceFolderPath)
          : getDestinationServicePath(sourceFolderPath)

    return outputPath
  }

  public async execute() {
    return this.parsed.subCommand
      ? await this.executeSingleFileCompile()
      : await this.executeCompile()
  }

  async executeCompile() {
    const { target } = await this.getTargetInfo()
    const { buildDestinationFolder } = process.sasjsConstants

    return await compile(target, true)
      .then(() => {
        process.logger?.success(
          `Services have been successfully compiled!\nThe compile output is located in the ${buildDestinationFolder} directory.`
        )
        return ReturnCode.Success
      })
      .catch((err) => {
        displayError(err, 'An error has occurred when compiling services.')
        return ReturnCode.InternalError
      })
  }

  async executeSingleFileCompile() {
    const { target } = await this.getTargetInfo()
    const output = await this.output
    return await compileSingleFile(
      target,
      this.parsed.subCommand as string,
      this.source,
      output
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

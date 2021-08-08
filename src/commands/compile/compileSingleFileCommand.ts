import path from 'path'
import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'
import { displayError } from '../../utils'
import { compileSingleFile } from './compileSingleFile'
import {
  getDestinationJobPath,
  getDestinationServicePath
} from './internal/getDestinationPath'

const syntax = 'compile <subCommand>'
const usage = 'sasjs compile <subCommand> [options]'
const aliases = ['c <subCommand>']
const example: CommandExample = {
  command: 'sasjs compile job -t myTarget | sasjs c job -t myTarget',
  description:
    'Compiles the single job or service specified by inlining all dependencies and adds init and term programs as configured in the specified target.'
}

export class CompileSingleFileCommand extends TargetCommand {
  constructor(args: string[]) {
    const parseOptions = {
      source: { type: 'string', alias: 's', demandOption: true },
      output: { type: 'string', alias: 'o' }
    }
    super(args, { parseOptions, usage, example, syntax, aliases })
  }

  public get source(): string {
    return this.parsed.source as string
  }

  public get output(): Promise<string> {
    const value = this.parsed.output as string
    let sourcefilePathParts = this.source.split(path.sep)
    sourcefilePathParts.splice(-1, 1)
    const sourceFolderPath = sourcefilePathParts.join(path.sep)
    const leafFolderName = sourceFolderPath.split(path.sep).pop() as string
    return value
      ? path.isAbsolute(value)
        ? Promise.resolve(
            path.join(value, `${this.subCommand}s`, leafFolderName)
          )
        : Promise.resolve(
            path.join(
              process.currentDir!,
              value,
              `${this.subCommand}s`,
              leafFolderName
            )
          )
      : this.subCommand === 'job'
      ? getDestinationJobPath(sourceFolderPath)
      : getDestinationServicePath(sourceFolderPath)
  }

  public async execute() {
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

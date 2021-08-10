import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'
import { displayError } from '../../utils'
import { compile } from './compile'

const syntax = 'compile'
const aliases = ['c']
const usage = 'Usage: sasjs compile [options]'
const description =
  'Compiles all jobs and services in the project by inlining all dependencies and adds init and term programs as configured in the specified target.'
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

export class CompileCommand extends TargetCommand {
  constructor(args: string[]) {
    super(args, { syntax, usage, description, examples, aliases })
  }

  public async execute() {
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
}

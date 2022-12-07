import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'
import { compile } from '../compile/compile'
import { build } from './build'

const syntax = 'compilebuild'
const aliases = ['cb']
const usage = 'sasjs compilebuild [options]'
const description =
  'Compiles and then builds jobs and services in the project into a single .sas file and a .json file for deployment. Uses configuration from the specified target.'
const examples: CommandExample[] = [
  {
    command: 'sasjs compilebuild -t myTarget',
    description: ''
  },
  {
    command: 'sasjs cb -t myTarget',
    description: ''
  }
]

export class CompileBuildCommand extends TargetCommand {
  constructor(args: string[]) {
    super(args, { syntax, usage, aliases, description, examples })
  }

  public async execute() {
    const { target } = await this.getTargetInfo()

    let returnCode = await compile(target, true)
      .then(() => ReturnCode.Success)
      .catch((err) => {
        process.logger?.error('Error compiling project: ', err)
        return ReturnCode.InternalError
      })

    if (returnCode === ReturnCode.InternalError) {
      return returnCode
    }

    const { buildDestinationFolder } = process.sasjsConstants

    process.logger?.success(
      `The project was successfully compiled using the '${target.name}' target (serverType '${target.serverType}')!\nThe compile output is located in the ${buildDestinationFolder} directory.`
    )

    returnCode = await build(target)
      .then(() => ReturnCode.Success)
      .catch((err) => {
        process.logger?.error('Error building project: ', err)
        return ReturnCode.InternalError
      })

    if (returnCode === ReturnCode.InternalError) {
      return returnCode
    }

    process.logger?.success(
      `Services have been successfully built!\nThe build output is located in the ${buildDestinationFolder} directory.`
    )
    return returnCode
  }
}

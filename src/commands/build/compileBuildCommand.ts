import { getConstants } from '../../constants'
import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'
import { compile } from '../compile/compile'
import { build } from './build'

const usage = 'Usage: sasjs build [options]'
const example: CommandExample = {
  command: 'sasjs compilebuild -t myTarget | sasjs cb -t myTarget',
  description:
    'Compiles and then builds jobs and services in the project into a single .sas file and a .json file for deployment. Uses configuration from the specified target.'
}

export class CompileBuildCommand extends TargetCommand {
  constructor(args: string[]) {
    super(args, {}, ['cb'], usage, example)
  }

  public async execute() {
    const { target } = await this.target

    let returnCode = await compile(target, true)
      .then(() => ReturnCode.Success)
      .catch((err) => {
        process.logger?.error('Error compiling project: ', err)
        return ReturnCode.InternalError
      })

    if (returnCode === ReturnCode.InternalError) {
      return returnCode
    }

    process.logger?.success(
      `Services have been successfully compiled!\nThe compile output is located in the 'sasjsbuild' directory.`
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

    const { buildDestinationFolder } = await getConstants()
    process.logger?.success(
      `Services have been successfully built!\nThe build output is located in the ${buildDestinationFolder} directory.`
    )
    return returnCode
  }
}

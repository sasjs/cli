import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'
import { displayError } from '../../utils'
import { build } from './build'
import { deploy } from '../deploy/deploy'

const syntax = 'builddeploy'
const aliases = ['bd']
const usage = 'sasjs builddeploy [options]'
const description =
  'Builds the project and deploys the result to the server configured in the specified target. Unlike compilebuilddeploy it does not recompile first: it ships the compiled services already in the build folder, and the compile step only runs when that folder is missing.'
const examples: CommandExample[] = [
  {
    command: 'sasjs builddeploy -t myTarget',
    description: ''
  },
  {
    command: 'sasjs bd -t myTarget',
    description: ''
  }
]

export class BuildDeployCommand extends TargetCommand {
  constructor(args: string[]) {
    super(args, { syntax, usage, aliases, description, examples })
  }

  public async execute() {
    const { target, isLocal } = await this.getTargetInfo()

    const buildReturnCode = await build(target)
      .then(() => {
        const { buildDestinationFolder } = process.sasjsConstants

        process.logger?.success(
          `Services have been successfully built!\nThe build output is located in the ${buildDestinationFolder} directory.`
        )

        return ReturnCode.Success
      })
      .catch((err) => {
        displayError(err, 'An error has occurred when building services.')
        return ReturnCode.InternalError
      })

    if (buildReturnCode === ReturnCode.InternalError) return buildReturnCode

    return await deploy(target, isLocal)
      .then(() => {
        process.logger?.success(
          `Services have been successfully deployed to ${target.serverUrl}.`
        )
        return ReturnCode.Success
      })
      .catch((err) => {
        process.logger?.error(
          `An error has occurred when deploying services: ${err}`
        )
        return ReturnCode.InternalError
      })
  }
}

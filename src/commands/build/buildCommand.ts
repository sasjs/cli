import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'
import { displayError } from '../../utils'
import { build } from './build'

const syntax = 'build'
const aliases = ['b']
const usage = 'sasjs build [options]'
const description =
  'Collates all the compiled jobs and services in the project into a single .sas file and a .json file for deployment. Uses configuration from the specified target.'
const examples: CommandExample[] = [
  {
    command: 'sasjs build -t myTarget',
    description: ''
  },
  {
    command: 'sasjs b -t myTarget',
    description: ''
  }
]

export class BuildCommand extends TargetCommand {
  constructor(args: string[]) {
    super(args, { syntax, usage, description, examples, aliases })
  }

  public async execute() {
    const { target } = await this.getTargetInfo()
    return await build(target)
      .then(async () => {
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
  }
}

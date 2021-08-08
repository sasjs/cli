import { getConstants } from '../../constants'
import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'
import { displayError } from '../../utils'
import { build } from './build'

const syntax = 'build'
const aliases = ['b']
const usage = 'sasjs build [options]'
const example: CommandExample = {
  command: 'sasjs build -t myTarget | sasjs b -t myTarget',
  description:
    'Collates all the compiled jobs and services in the project into a single .sas file and a .json file for deployment. Uses configuration from the specified target.'
}

export class BuildCommand extends TargetCommand {
  constructor(args: string[]) {
    super(args, { syntax, usage, example, aliases })
  }

  public async execute() {
    const { target } = await this.getTargetInfo()
    return await build(target)
      .then(async () => {
        const { buildDestinationFolder } = await getConstants()
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

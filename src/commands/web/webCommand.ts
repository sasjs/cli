import { getConstants } from '../../constants'
import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'
import { displayError, displaySuccess } from '../../utils'
import { createWebAppServices } from './web'

const syntax = 'web'
const aliases = ['w']
const usage = 'Usage: sasjs web [options]'
const example: CommandExample = {
  command: 'sasjs web -t myTarget | sasjs w -t myTarget',
  description:
    'compiles the web app service and place at webSourcePath specified in target.'
}

export class WebCommand extends TargetCommand {
  constructor(args: string[]) {
    super(args, { syntax, usage, example, aliases })
  }

  public async execute() {
    const { target } = await this.getTargetInfo()
    const { buildDestinationFolder } = await getConstants()

    return await createWebAppServices(target)
      .then(async () => {
        displaySuccess(
          `Web app services have been successfully built!\nThe build output is located in the ${buildDestinationFolder} directory.`
        )
        return ReturnCode.Success
      })
      .catch((err) => {
        displayError(
          err,
          'An error has occurred when building web app services.'
        )
        return ReturnCode.InternalError
      })
  }
}

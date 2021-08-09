import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'
import { displayError } from '../../utils'
import { printVersion } from './version'

const syntax = 'version'
const aliases = ['v', '-v', '--v']
const usage = 'Usage: sasjs version'
const example: CommandExample = {
  command: 'sasjs version | sasjs v | sasjs --version | sasjs -v',
  description: 'displays currently installed version.'
}

export class VersionCommand extends TargetCommand {
  constructor(args: string[]) {
    super(args, { syntax, usage, example, aliases })
  }

  public async execute() {
    return await printVersion()
      .then(async () => {
        return ReturnCode.Success
      })
      .catch((err) => {
        displayError(err, 'An error has occurred while checking version.')
        return ReturnCode.InternalError
      })
  }
}

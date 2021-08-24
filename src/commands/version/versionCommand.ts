import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'
import { displayError } from '../../utils'
import { printVersion } from './version'

const syntax = 'version'
const aliases = ['v']
const usage = 'Usage: sasjs version'
const description = 'displays currently installed version.'
const examples: CommandExample[] = [
  { command: 'sasjs version', description },
  { command: 'sasjs v', description }
]

export class VersionCommand extends TargetCommand {
  constructor(args: string[]) {
    super(args, { syntax, usage, description, examples, aliases })
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

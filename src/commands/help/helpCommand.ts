import { printHelpText } from './help'
import { CommandExample, ReturnCode } from '../../types/command'
import { CommandBase } from '../../types'

const syntax = 'help'
const usage = 'sasjs help'
const description = 'Print SASjs CLI help text.'
const examples: CommandExample[] = [
  {
    command: 'sasjs help',
    description: ''
  }
]

export class HelpCommand extends CommandBase {
  constructor(args: string[]) {
    super(args, {
      syntax,
      usage,
      description,
      examples
    })
  }

  public async execute() {
    return await printHelpText()
      .then(() => {
        return ReturnCode.Success
      })
      .catch(() => {
        return ReturnCode.InternalError
      })
  }
}

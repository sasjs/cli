import { TargetScope } from '../../types'
import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'
import { addCredential } from './addCredential'

// The syntax here needs to use square brackets for the subCommand(i.e. make it optional) since
// the alias `auth` does not have a subCommand
const syntax = 'add [cred]'
const aliases = ['auth']
const usage = 'sasjs add cred [options] | sasjs auth [options]'
const description =
  'Authenticates against the specified target and creates a `.env.{targetName}` file at the root of the current project.'
const examples: CommandExample[] = [
  {
    command: 'sasjs add cred -t myTarget',
    description: ''
  },
  {
    command: 'sasjs auth -t myTarget',
    description: ''
  }
]

export class AddCredentialCommand extends TargetCommand {
  constructor(args: string[]) {
    const parseOptions: { [key: string]: Object } = {
      insecure: {
        type: 'boolean',
        alias: 'i',
        default: false,
        description:
          'Allows the command to bypass the HTTPs requirement. Not recommended.'
      }
    }
    super(args, { parseOptions, usage, description, examples, syntax, aliases })
  }

  public get insecure(): boolean {
    return !!this.parsed.insecure
  }

  public async execute() {
    const { target, isLocal } = await this.getTargetInfo()
    const scope = isLocal ? TargetScope.Local : TargetScope.Global
    return await addCredential(target, this.insecure, scope)
      .then(() => {
        process.logger?.success('Credentials successfully added!')
        return ReturnCode.Success
      })
      .catch((err) => {
        process.logger?.error('Error adding credentials: ', err)
        return ReturnCode.InternalError
      })
  }
}

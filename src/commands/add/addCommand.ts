import { TargetScope } from '../../types'
import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'
import { addCredential } from './addCredential'
import { addTarget } from './addTarget'

enum AddSubCommand {
  Cred = 'cred'
}

enum AddAlias {
  Auth = 'auth'
}

// The syntax here needs to use square brackets for the subCommand(i.e. make it optional) since
// the alias `auth` does not have a subCommand
const syntax = 'add [subCommand] [options]'
const aliases = Object.values(AddAlias)
const usage = 'sasjs add | sasjs add cred [options] | sasjs auth [options]'
const description =
  'Authenticates against the specified target and creates a `.env.{targetName}` file at the root of the current project.'
const examples: CommandExample[] = [
  {
    command: 'sasjs add',
    description: ''
  },
  {
    command: 'sasjs add --insecure',
    description: ''
  },
  {
    command: 'sasjs add cred --target <target-name> --insecure',
    description: ''
  },
  {
    command: 'sasjs add cred -t <target-name> -i',
    description: ''
  },
  {
    command: 'sasjs auth --target <target-name> --insecure',
    description: ''
  },
  {
    command: 'sasjs auth -t <target-name> -i',
    description: ''
  }
]

export class AddCommand extends TargetCommand {
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
    const commandNameEntered = this.parsed._[0]

    return commandNameEntered === AddAlias.Auth ||
      this.parsed.subCommand === AddSubCommand.Cred
      ? await this.executeCred()
      : await this.executeTarget()
  }

  public async executeCred() {
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

  public async executeTarget() {
    return await addTarget(this.insecure)
      .then(() => {
        process.logger?.success('Target has been successfully added!')
        return ReturnCode.Success
      })
      .catch((err) => {
        process.logger?.error('Error adding target: ', err)
        return ReturnCode.InternalError
      })
  }
}

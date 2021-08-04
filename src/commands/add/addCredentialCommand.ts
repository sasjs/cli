import { TargetScope } from '../../types'
import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'
import { addCredential } from './addCredential'

const usage = 'Usage: sasjs add cred [options] | sasjs auth [options]'
const example: CommandExample = {
  command: 'sasjs add cred -t myTarget',
  description:
    'Authenticates against the specified target and creates a `.env.{targetName}` file at the root of the current project.'
}

export class AddCredentialCommand extends TargetCommand {
  constructor(args: string[]) {
    const parseOptions: { [key: string]: Object } = {
      insecure: {
        type: 'boolean',
        alias: 'i',
        default: false,
        description:
          'Allows the command to bypass the HTTPs requirement. Not recommended.'
      },
      target: {
        type: 'string',
        alias: 't',
        description: 'The target to authenticate against.'
      }
    }
    super(args, parseOptions, ['auth'], usage, example)
  }

  public get insecure(): boolean {
    return !!this.parsed.insecure
  }

  public async execute() {
    const { target, isLocal } = await this.target
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

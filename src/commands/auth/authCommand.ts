import { TargetScope } from '../../types'
import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'
import { addCredential } from '../add/addCredential'
import { authLogin } from './login'

enum AuthSubCommand {
  Login = 'login'
}

// The syntax here uses square brackets for the subCommand (i.e. makes it
// optional) since `sasjs auth` without a subCommand retains its historical
// behaviour (it used to be an alias of `sasjs add cred`).
const syntax = 'auth [subCommand] [options]'
const usage = 'sasjs auth login --target <target-name> | sasjs auth [options]'
const description =
  `Authenticates against the specified target.\n` +
  `With the 'login' subCommand, authentication is performed with a SAS username and password ` +
  `(no OAuth client/secret required, SASVIYA targets only) and the resulting tokens are saved.\n` +
  `Without a subCommand, behaves like 'sasjs add cred' (client/secret based authentication).`
const examples: CommandExample[] = [
  {
    command: 'sasjs auth login --target <target-name>',
    description:
      'Logs in with SAS username/password (no client/secret required).'
  },
  {
    command: 'sasjs auth login -t <target-name>',
    description: ''
  },
  {
    command: 'sasjs auth --target <target-name>',
    description: 'Legacy behaviour, equivalent to `sasjs add cred`.'
  }
]

export class AuthCommand extends TargetCommand {
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
    super(args, { parseOptions, usage, description, examples, syntax })
  }

  public get insecure(): boolean {
    return !!this.parsed.insecure
  }

  public async execute() {
    return this.subCommand === AuthSubCommand.Login
      ? await this.executeLogin()
      : await this.executeCred()
  }

  public async executeLogin() {
    const { target } = await this.getTargetInfo()

    return await authLogin(target, this.insecure)
      .then(() => ReturnCode.Success)
      .catch((err) => {
        process.logger?.error('Error logging in.', err?.message || err)

        return ReturnCode.InternalError
      })
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
        process.logger?.error('Error adding credentials.', err.toString())

        return ReturnCode.InternalError
      })
  }
}

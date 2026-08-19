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
  `Without a subCommand, behaves like 'sasjs add cred' (client/secret based authentication).\n` +
  `\n` +
  `Non-interactive use (CI/agents): set SAS_USERNAME and SAS_PASSWORD environment variables, ` +
  `or pipe the password and use --password-stdin.`
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
    command:
      'SAS_USERNAME=usr SAS_PASSWORD=pass sasjs auth login -t <target-name>',
    description:
      'Non-interactive: read credentials from SAS_USERNAME/SAS_PASSWORD env vars (CI/agents).'
  },
  {
    command:
      'echo "$SAS_PASSWORD" | sasjs auth login --password-stdin -t <target-name>',
    description:
      'Non-interactive: read the password from stdin (avoids shell history).'
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
      },
      passwordStdin: {
        type: 'boolean',
        default: false,
        description:
          'Read the password from stdin instead of prompting or reading the ' +
          'SAS_PASSWORD env var. Use this in CI/scripts to avoid leaking the ' +
          'password in shell history (e.g. ' +
          '`echo "$SAS_PASSWORD" | sasjs auth login --password-stdin -t <target>`).'
      }
    }
    super(args, { parseOptions, usage, description, examples, syntax })
  }

  public get insecure(): boolean {
    return !!this.parsed.insecure
  }

  public get passwordStdin(): boolean {
    return !!this.parsed.passwordStdin
  }

  public async execute() {
    return this.subCommand === AuthSubCommand.Login
      ? await this.executeLogin()
      : await this.executeCred()
  }

  public async executeLogin() {
    const { target } = await this.getTargetInfo()

    try {
      await authLogin(target, this.insecure, this.passwordStdin)
      return ReturnCode.Success
    } catch (err: any) {
      process.logger?.error('Error logging in.', err?.message || err)
      return ReturnCode.InternalError
    }
  }

  public async executeCred() {
    const { target, isLocal } = await this.getTargetInfo()
    const scope = isLocal ? TargetScope.Local : TargetScope.Global

    try {
      await addCredential(target, this.insecure, scope)
      process.logger?.success('Credentials successfully added!')
      return ReturnCode.Success
    } catch (err: any) {
      process.logger?.error('Error adding credentials.', err.toString())
      return ReturnCode.InternalError
    }
  }
}

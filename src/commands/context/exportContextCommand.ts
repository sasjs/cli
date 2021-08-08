import SASjs from '@sasjs/adapter/node'
import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'
import { getAuthConfig } from '../../utils'
import { exportContext } from './export'

const syntax = 'context <subCommand> <contextName>'
const usage = 'sasjs context export <context-name> --target <target-name>'
const example: CommandExample = {
  command: 'sasjs context export myContext -t myTarget',
  description:
    'Exports the definition for the specified context into a JSON file in the current directory.'
}

export class ExportContextCommand extends TargetCommand {
  constructor(args: string[]) {
    super(args, {
      usage,
      example,
      syntax
    })
  }

  public async execute() {
    const { target } = await this.getTargetInfo()
    const sasjs = new SASjs({
      serverUrl: target.serverUrl,
      allowInsecureRequests: target.allowInsecureRequests,
      appLoc: target.appLoc,
      serverType: target.serverType
    })

    const authConfig = await getAuthConfig(target).catch((err) => {
      process.logger?.error(
        'Unable to create context. Error fetching auth config: ',
        err
      )
      return null
    })
    if (!authConfig) {
      return ReturnCode.InternalError
    }

    const returnCode = await exportContext(
      this.parsed.contextName as string,
      sasjs,
      authConfig.access_token
    )
      .then(() => {
        return ReturnCode.Success
      })
      .catch(() => {
        return ReturnCode.InternalError
      })

    return returnCode
  }
}

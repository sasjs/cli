import SASjs from '@sasjs/adapter/node'
import { ServerType } from '@sasjs/utils'
import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'
import { getAuthConfig } from '../../utils'
import { list } from './list'

const syntax = 'context <subCommand>'
const usage = 'sasjs context list --target <target-name>'
const example: CommandExample = {
  command: 'sasjs context list -t myTarget',
  description:
    'Lists the accessible and inaccessible compute contexts on the server specified in the target.'
}

export class ListContextCommand extends TargetCommand {
  constructor(args: string[]) {
    super(args, {
      usage,
      example,
      syntax
    })
  }

  public async execute() {
    const { target } = await this.getTargetInfo()
    if (target.serverType !== ServerType.SasViya) {
      process.logger?.error(
        `'context list' command is only supported for SAS Viya build targets.\nPlease try again with a different target.`
      )
      return ReturnCode.InternalError
    }

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

    const returnCode = await list(target, sasjs, authConfig)
      .then(() => {
        return ReturnCode.Success
      })
      .catch(() => {
        return ReturnCode.InternalError
      })

    return returnCode
  }
}

import SASjs from '@sasjs/adapter/node'
import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'
import { getAuthConfig } from '../../utils'
import { deleteContext } from './delete'

const syntax = 'context <subCommand> <contextName>'
const usage = 'sasjs context delete <context-name> --target <target-name>'
const example: CommandExample = {
  command: 'sasjs context delete myContext -t myTarget',
  description:
    'Deletes the specified context from the server specified in the target.'
}

export class DeleteContextCommand extends TargetCommand {
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

    const returnCode = await deleteContext(
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

import SASjs from '@sasjs/adapter/node'
import { ServerType } from '@sasjs/utils'
import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'
import { getAuthConfig } from '../../utils'
import { prefixAppLoc } from '../../utils/prefixAppLoc'
import { list } from './list'

const syntax = 'folder list <folderPath>'
const usage = 'sasjs folder list <folderPath> --target <target-name>'
const description =
  'Lists the first level children folders of the given folder.'
const examples: CommandExample[] = [
  {
    command: 'sasjs folder list /Public/app -t myTarget',
    description: ''
  }
]

export class ListFolderCommand extends TargetCommand {
  constructor(args: string[]) {
    super(args, {
      usage,
      description,
      examples,
      syntax
    })
  }

  public async execute() {
    const { target } = await this.getTargetInfo()
    if (target.serverType !== ServerType.SasViya) {
      process.logger?.error(
        `'folder list' command is only supported for SAS Viya build targets.\nPlease try again with a different target.`
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
        'Unable to list folder. Error fetching auth config: ',
        err
      )
      return null
    })
    if (!authConfig) {
      return ReturnCode.InternalError
    }

    const folderPath = prefixAppLoc(
      target.appLoc,
      this.parsed.folderPath as string
    )

    const returnCode = await list(folderPath, sasjs, authConfig.access_token)
      .then(() => {
        return ReturnCode.Success
      })
      .catch((err) => {
        process.logger?.error('Error listing folder: ', err)
        return ReturnCode.InternalError
      })

    return returnCode
  }
}

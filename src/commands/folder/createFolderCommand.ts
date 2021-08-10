import SASjs from '@sasjs/adapter/node'
import { ServerType } from '@sasjs/utils'
import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'
import { getAuthConfig } from '../../utils'
import { prefixAppLoc } from '../../utils/prefixAppLoc'
import { create } from './create'

const syntax = 'folder <subCommand> <folderPath>'
const usage = 'sasjs folder create <folderPath> --target <target-name>'
const example: CommandExample = {
  command: 'sasjs folder create /Public/app/myFolder -t myTarget',
  description: 'Lists the first level children folders of the given folder.'
}

export class CreateFolderCommand extends TargetCommand {
  constructor(args: string[]) {
    super(args, {
      parseOptions: {
        force: {
          type: 'boolean',
          default: false,
          description:
            'Forces a delete and re-create if the folder already exists.'
        }
      },
      usage,
      example,
      syntax
    })
  }

  public async execute() {
    const { target } = await this.getTargetInfo()
    if (target.serverType !== ServerType.SasViya) {
      process.logger?.error(
        `'folder create' command is only supported for SAS Viya build targets.\nPlease try again with a different target.`
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
        'Unable to create folder. Error fetching auth config: ',
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

    const returnCode = await create(
      folderPath,
      sasjs,
      authConfig.access_token,
      !!this.parsed.force
    )
      .then(() => {
        return ReturnCode.Success
      })
      .catch((err) => {
        process.logger?.error('Error creating folder: ', err)
        return ReturnCode.InternalError
      })

    return returnCode
  }
}

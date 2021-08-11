import SASjs from '@sasjs/adapter/node'
import { ServerType } from '@sasjs/utils'
import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'
import { getAuthConfig } from '../../utils'
import { prefixAppLoc } from '../../utils/prefixAppLoc'
import { create } from './create'
import { deleteFolder } from './delete'
import { list } from './list'

enum FolderSubCommand {
  Create = 'create',
  Delete = 'delete',
  List = 'list'
}

const syntax = 'folder <subCommand> <folderPath>'
const usage =
  'sasjs folder <create | delete | list> <folderPath> --target <target-name>'
const description = 'Performs operations on folders'
const examples: CommandExample[] = [
  {
    command: 'sasjs folder create /Public/app/myFolder -t myTarget',
    description: 'Lists the first level children folders of the given folder.'
  },
  {
    command: 'sasjs folder delete /Public/app/myFolder -t myTarget',
    description: 'Deletes the given folder from the server.'
  },
  {
    command: 'sasjs folder list /Public/app -t myTarget',
    description: 'Lists the first level children folders of the given folder.'
  }
]

const commandParseOptions = {
  force: {
    type: 'boolean',
    default: false,
    description: 'Forces a delete and re-create if the folder already exists.'
  }
}

export class FolderCommand extends TargetCommand {
  constructor(args: string[]) {
    const subCommand = args[3]
    const parseOptions =
      subCommand === FolderSubCommand.Create ? commandParseOptions : {}
    super(args, {
      parseOptions,
      usage,
      description,
      examples,
      syntax
    })
  }

  public async execute() {
    return this.parsed.subCommand === FolderSubCommand.Create
      ? await this.executeCreateFolder()
      : this.parsed.subCommand === FolderSubCommand.Delete
      ? await this.executeDeleteFolder()
      : this.parsed.subCommand === FolderSubCommand.List
      ? await this.executeListFolder()
      : ReturnCode.InvalidCommand
  }
  async executeCreateFolder() {
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

  async executeDeleteFolder() {
    const { target } = await this.getTargetInfo()
    if (target.serverType !== ServerType.SasViya) {
      process.logger?.error(
        `'folder delete' command is only supported for SAS Viya build targets.\nPlease try again with a different target.`
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
        'Unable to delete folder. Error fetching auth config: ',
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

    const returnCode = await deleteFolder(
      folderPath,
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

  async executeListFolder() {
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

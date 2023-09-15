import SASjs from '@sasjs/adapter/node'
import { AuthConfig, ServerType, Target } from '@sasjs/utils'
import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'
import { getAuthConfig, getSASjs } from '../../utils'
import { prefixAppLoc } from '../../utils/prefixAppLoc'
import { create } from './create'
import { deleteFolder } from './delete'
import { list } from './list'
import { move } from './move'

enum FolderSubCommand {
  Create = 'create',
  Delete = 'delete',
  List = 'list',
  Move = 'move'
}

const generalSyntax = 'folder <subCommand> <folderPath>'
const moveSyntax = 'folder <subCommand> <sourceFolderPath> <targetFolderPath>'

const usage =
  'sasjs folder <create | delete | list | move> <folderPath> [targetFolderPath] --target <target-name>'
const description = 'Performs operations on folders'
const examples: CommandExample[] = [
  {
    command: 'sasjs folder create /Public/app/myFolder -t myTarget',
    description: 'Creates the folder at the given path on the target server.'
  },
  {
    command: 'sasjs folder delete /Public/app/myFolder -t myTarget',
    description: 'Deletes the given folder from the server.'
  },
  {
    command: 'sasjs folder list /Public/app -t myTarget',
    description: 'Lists the first level children folders of the given folder.'
  },
  {
    command: 'sasjs folder move /Public/app -t myTarget',
    description: 'Lists the first level children folders of the given folder.'
  }
]

const createParseOptions = {
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
      subCommand === FolderSubCommand.Create ? createParseOptions : {}
    const syntax =
      subCommand === FolderSubCommand.Move ? moveSyntax : generalSyntax
    super(args, {
      parseOptions,
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
        `This command is only supported for SAS Viya targets.\nPlease try again with a different target.`
      )
      return ReturnCode.InternalError
    }

    const sasjs = getSASjs(target)

    const authConfig = await getAuthConfig(target).catch((err) => {
      process.logger?.error(
        'Unable to execute folder command. Error fetching auth config: ',
        err
      )
      return null
    })

    if (!authConfig) {
      return ReturnCode.InternalError
    }

    return this.parsed.subCommand === FolderSubCommand.Create
      ? await this.executeCreateFolder(target, sasjs, authConfig)
      : this.parsed.subCommand === FolderSubCommand.Delete
      ? await this.executeDeleteFolder(target, sasjs, authConfig)
      : this.parsed.subCommand === FolderSubCommand.List
      ? await this.executeListFolder(target, sasjs, authConfig)
      : ReturnCode.InvalidCommand
  }

  async executeCreateFolder(
    target: Target,
    sasjs: SASjs,
    authConfig: AuthConfig
  ) {
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

  async executeDeleteFolder(
    target: Target,
    sasjs: SASjs,
    authConfig: AuthConfig
  ) {
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

  async executeListFolder(
    target: Target,
    sasjs: SASjs,
    authConfig: AuthConfig
  ) {
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

  public async executeMoveFolder() {
    const { target } = await this.getTargetInfo()
    if (target.serverType !== ServerType.SasViya) {
      process.logger?.error(
        `'folder move' command is only supported for SAS Viya build targets.\nPlease try again with a different target.`
      )
      return ReturnCode.InternalError
    }

    const sasjs = getSASjs(target)

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

    const sourceFolderPath = prefixAppLoc(
      target.appLoc,
      this.parsed.sourceFolderPath as string
    )

    const targetFolderPath = prefixAppLoc(
      target.appLoc,
      this.parsed.targetFolderPath as string
    )

    const returnCode = await move(
      sourceFolderPath,
      targetFolderPath,
      sasjs,
      authConfig.access_token
    )
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

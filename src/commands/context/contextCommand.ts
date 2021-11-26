import SASjs from '@sasjs/adapter/node'
import { readFile, ServerType } from '@sasjs/utils'
import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'
import { getAuthConfig } from '../../utils'
import { create } from './create'
import { deleteContext } from './delete'
import { edit } from './edit'
import { exportContext } from './export'
import { parseConfig } from './internal/parseConfig'
import { validateConfigPath } from './internal/validateConfigPath'
import { list } from './list'

enum ContextSubCommand {
  Create = 'create',
  Delete = 'delete',
  Edit = 'edit',
  Export = 'export',
  List = 'list'
}

const syntax = {
  [ContextSubCommand.Create]: 'context <subCommand>',
  [ContextSubCommand.Delete]: 'context <subCommand> <contextName>',
  [ContextSubCommand.Edit]: 'context <subCommand> [contextName]',
  [ContextSubCommand.Export]: 'context <subCommand> <contextName>',
  [ContextSubCommand.List]: 'context <subCommand>'
}
const usage = {
  [ContextSubCommand.Create]:
    'sasjs context create --source <source-JSON-file-path> --target <target-name>',
  [ContextSubCommand.Delete]:
    'sasjs context delete <context-name> --target <target-name>',
  [ContextSubCommand.Edit]:
    'sasjs context edit <contextName> --source <source-JSON-file-path> --target <target-name>',
  [ContextSubCommand.Export]:
    'sasjs context export <context-name> --target <target-name>',
  [ContextSubCommand.List]: 'sasjs context list --target <target-name>'
}
const description = 'Performs operations on contexts.'
const examples: CommandExample[] = [
  {
    command: 'sasjs context create -s source.json -t myTarget',
    description:
      'Creates a context using the configuration from the provided JSON file on the server specified in the target.'
  },
  {
    command: 'sasjs context delete myContext -t myTarget',
    description:
      'Deletes the specified context from the server specified in the target.'
  },
  {
    command: 'sasjs context edit  -s source.json -t myTarget',
    description:
      'Edit a context using the configuration from the provided JSON file on the server specified in the target.'
  },
  {
    command: 'sasjs context export myContext -t myTarget',
    description:
      'Exports the definition for the specified context into a JSON file in the current directory.'
  },
  {
    command: 'sasjs context list -t myTarget',
    description:
      'Lists the accessible and inaccessible compute contexts on the server specified in the target.'
  }
]

const commandParseOptions = {
  source: {
    type: 'string',
    alias: 's',
    demandOption: true,
    description: 'Path to a JSON file containing the context configuration.'
  }
}

export class ContextCommand extends TargetCommand {
  private _config?: Object
  constructor(args: string[]) {
    const subCommand = args[3]
    const parseOptions =
      subCommand === ContextSubCommand.Create ||
      subCommand === ContextSubCommand.Edit
        ? commandParseOptions
        : {}

    super(args, {
      parseOptions,
      usage:
        usage[subCommand as ContextSubCommand] ??
        usage[ContextSubCommand.Create],
      description,
      examples,
      syntax:
        syntax[subCommand as ContextSubCommand] ??
        syntax[ContextSubCommand.Create]
    })
  }

  public async execute() {
    let returnCode: ReturnCode
    switch (this.parsed.subCommand) {
      case ContextSubCommand.Create:
        returnCode = await this.executeCreateContext()
        break
      case ContextSubCommand.Delete:
        returnCode = await this.executeDeleteContext()
        break
      case ContextSubCommand.Edit:
        returnCode = await this.executeEditContext()
        break
      case ContextSubCommand.Export:
        returnCode = await this.executeExportContext()
        break
      case ContextSubCommand.List:
        returnCode = await this.executeListContext()
        break
      default:
        returnCode = ReturnCode.InvalidCommand
        break
    }
    return returnCode
  }

  public async getConfig(): Promise<Object> {
    if (this._config) {
      return this._config
    }

    const configPath = this.parsed.source as string
    const isValidPath = await validateConfigPath(configPath)
    if (!isValidPath) {
      throw new Error('Invalid source JSON path.')
    }

    const content = await readFile(configPath).catch(() => {
      throw new Error(`Error reading file at ${configPath}.`)
    })

    this._config = parseConfig(content)

    return this._config!
  }

  async executeCreateContext() {
    const { target } = await this.getTargetInfo()
    const sasjs = new SASjs({
      serverUrl: target.serverUrl,

      appLoc: target.appLoc,
      serverType: target.serverType
    })
    const config = await this.getConfig().catch((err) => {
      process.logger?.error(
        `Unable to create context. Error fetching context configuration from ${this.parsed.source}: `,
        err
      )
      return null
    })
    if (!config) {
      return ReturnCode.InternalError
    }

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

    const returnCode = await create(config, sasjs, authConfig.access_token)
      .then(() => {
        return ReturnCode.Success
      })
      .catch(() => {
        return ReturnCode.InternalError
      })

    return returnCode
  }

  async executeDeleteContext() {
    const { target } = await this.getTargetInfo()
    const sasjs = new SASjs({
      serverUrl: target.serverUrl,

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

  async executeEditContext() {
    const { target } = await this.getTargetInfo()
    const sasjs = new SASjs({
      serverUrl: target.serverUrl,

      appLoc: target.appLoc,
      serverType: target.serverType
    })
    const config = await this.getConfig().catch((err) => {
      process.logger?.error(
        `Unable to edit context. Error fetching context configuration from ${this.parsed.source}: `,
        err
      )
      return null
    })
    if (!config) {
      return ReturnCode.InternalError
    }

    const authConfig = await getAuthConfig(target).catch((err) => {
      process.logger?.error(
        'Unable to edit context. Error fetching auth config: ',
        err
      )
      return null
    })
    if (!authConfig) {
      return ReturnCode.InternalError
    }

    const returnCode = await edit(
      this.parsed.contextName as string,
      config,
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

  async executeExportContext() {
    const { target } = await this.getTargetInfo()
    const sasjs = new SASjs({
      serverUrl: target.serverUrl,

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

  async executeListContext() {
    const { target } = await this.getTargetInfo()
    if (target.serverType !== ServerType.SasViya) {
      process.logger?.error(
        `'context list' command is only supported for SAS Viya build targets.\nPlease try again with a different target.`
      )
      return ReturnCode.InternalError
    }

    const sasjs = new SASjs({
      serverUrl: target.serverUrl,

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

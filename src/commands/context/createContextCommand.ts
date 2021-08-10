import SASjs from '@sasjs/adapter/node'
import { readFile } from '@sasjs/utils'
import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'
import { getAuthConfig } from '../../utils'
import { create } from './create'
import { parseConfig } from './internal/parseConfig'
import { validateConfigPath } from './internal/validateConfigPath'

const syntax = 'context <subCommand>'
const usage =
  'sasjs context create --source <source-JSON-file-path> --target <target-name>'
const description =
  'Creates a context using the configuration from the provided JSON file on the server specified in the target.'
const examples: CommandExample[] = [
  {
    command: 'sasjs context create -s source.json -t myTarget',
    description: ''
  }
]

export class CreateContextCommand extends TargetCommand {
  private _config?: Object
  constructor(args: string[]) {
    super(args, {
      parseOptions: {
        source: {
          type: 'string',
          alias: 's',
          demandOption: true,
          description:
            'Path to a JSON file containing the context configuration.'
        }
      },
      usage,
      description,
      examples,
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
}

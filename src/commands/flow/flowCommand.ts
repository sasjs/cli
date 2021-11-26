import path from 'path'
import { AuthConfig, Target } from '@sasjs/utils'
import SASjs from '@sasjs/adapter/node'
import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'
import { displayError, getAuthConfig } from '../../utils'
import { execute } from './execute'

enum FlowSubCommand {
  Execute = 'execute'
}

const syntax = 'flow <subCommand> [options]'

const usage = 'sasjs flow <execute> --source <flowPath> [options]'
const description = 'Performs operations on flows of jobs.'
const examples: CommandExample[] = [
  {
    command:
      'sasjs flow execute --source /local/flow.json --logFolder /local/log/folder --csvFile /local/some.csv --target myTarget --streamLog',
    description: ''
  },
  {
    command:
      'sasjs flow execute -s /local/flow.json -l /local/log/folder -c /local/some.csv -t myTarget --streamLog',
    description: ''
  }
]

const executeParseOptions = {
  source: {
    type: 'string',
    alias: 's',
    demandOption: true,
    description: 'Path to the flow definition source file (*.json)'
  },
  logFolder: {
    type: 'string',
    alias: 'l',
    description: 'Path to the folder where job logs will be saved.'
  },
  csvFile: {
    type: 'string',
    alias: 'c',
    description: 'Path to the CSV file containing job statuses will be saved.'
  },
  streamLog: {
    type: 'boolean',
    description:
      'Flag indicating whether the logs should be streamed to a local file as the job executes.'
  }
}

export class FlowCommand extends TargetCommand {
  constructor(args: string[]) {
    const subCommand = args[3]
    const parseOptions =
      subCommand === FlowSubCommand.Execute ? executeParseOptions : {}
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

    const sasjs = new SASjs({
      serverUrl: target.serverUrl,
      appLoc: target.appLoc,
      serverType: target.serverType
    })

    const authConfig = await getAuthConfig(target as Target).catch((err) => {
      displayError(err, 'Error while getting access token.')
      return null
    })

    if (!authConfig) return ReturnCode.InternalError

    return this.parsed.subCommand === FlowSubCommand.Execute
      ? await this.executeFlow(target, sasjs, authConfig)
      : ReturnCode.InvalidCommand
  }

  async executeFlow(target: Target, sasjs: SASjs, authConfig: AuthConfig) {
    const source = this.parsed.source as string
    const csvFile = this.parsed.csvFile as string
    const logFolder = this.parsed.logFolder as string
    const streamLog = this.parsed.streamLog as boolean

    const returnCode = await execute(
      target,
      sasjs,
      authConfig,
      source,
      logFolder,
      csvFile,
      streamLog
    )
      .then((csvFilePath) => {
        const pathSepRegExp = new RegExp(path.sep.replace(/\\/g, '\\\\'), 'g')
        process.logger?.info(
          `CSV file located at: ${(csvFilePath as string).replace(
            pathSepRegExp,
            '/'
          )}`
        )
        return ReturnCode.Success
      })
      .catch((err) => {
        displayError(err, 'An error has occurred when executing this flow.')

        return ReturnCode.InternalError
      })

    return returnCode
  }
}

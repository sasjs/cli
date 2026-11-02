import path from 'path'
import { AuthConfig, Target } from '@sasjs/utils'
import SASjs from '@sasjs/adapter/node'
import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'
import { displayError, getAuthConfig, getSASjs } from '../../utils'
import { execute, isFlowFailure } from './execute'
import {
  isLogCheckFailure,
  logCheckModeOf,
  setLogCheckMode
} from '../../utils/logcheck'

enum FlowSubCommand {
  Execute = 'execute'
}

const syntax = 'flow <subCommand> [options]'

const usage = 'sasjs flow <execute> --source <flowPath> [options]'
// the codes are read from the enum rather than written out, so a member
// inserted ahead of them cannot make this text describe numbers the command no
// longer returns. A function rather than a constant: `types/command/index.ts`
// re-exports `parse` before `ReturnCode`, and `parse` loads every command, so
// reading the enum while this module initialises finds it undefined.
const commandDescription = () =>
  'Performs operations on flows of jobs.\n' +
  `Exits ${ReturnCode.FlowError} when a flow finishes with a job that did not ` +
  `succeed, and ${ReturnCode.InternalError} when the flow could not be executed ` +
  'at all.'
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
  },
  logcheck: {
    type: 'boolean',
    default: undefined,
    description:
      'Check the log of every job in the flow, and fail when logCheck in sasjsconfig.json says so. --no-logcheck switches both the report and the verdict off. A log streamed with --streamLog goes straight to its file and is not checked.'
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
      description: commandDescription(),
      examples,
      syntax
    })
  }

  public async execute() {
    setLogCheckMode(logCheckModeOf(this.parsed.logcheck))

    const { target } = await this.getTargetInfo()
    const sasjs = getSASjs(target)

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
        // execute() resolves a path or rejects. Anything else is a contract
        // violation, and reporting it as a successful flow would hide it - the
        // shape that used to arrive here was `false` for a failed flow, which is
        // what turned a failure into a TypeError
        if (typeof csvFilePath !== 'string') {
          displayError(
            new Error(
              `The flow reported completion without a CSV path (resolved ${typeof csvFilePath}).`
            ),
            'An error has occurred when executing this flow.'
          )

          return ReturnCode.InternalError
        }

        const pathSepRegExp = new RegExp(path.sep.replace(/\\/g, '\\\\'), 'g')
        process.logger?.info(
          `CSV file located at: ${csvFilePath.replace(pathSepRegExp, '/')}`
        )

        return ReturnCode.Success
      })
      .catch((err) => {
        if (isLogCheckFailure(err)) return ReturnCode.LogCheckError

        if (isFlowFailure(err)) {
          displayError(err, 'The flow did not complete successfully.')

          return ReturnCode.FlowError
        }

        displayError(err, 'An error has occurred when executing this flow.')

        return ReturnCode.InternalError
      })

    return returnCode
  }
}

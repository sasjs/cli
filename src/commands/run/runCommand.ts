import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'
import { displayError } from '../../utils'
import {
  isLogCheckFailure,
  logCheckModeOf,
  setLogCheckMode
} from '../../utils/logcheck'
import { runSasCode } from './run'

const syntax = 'run <sasFilePath> [options]'
const usage = 'sasjs run <sasFilePath> --target <target-name>'
const description =
  `Lets the user run a given SAS file against a specified target.\n` +
  `The target can exist either in the local project configuration or in the global .sasjsrc file.`
const examples: CommandExample[] = [
  {
    command: 'sasjs run ./path/run-job.sas --target targetName',
    description: ''
  },
  {
    command: 'sasjs run ./path/run-job.sas -t targetName --compile',
    description: ''
  },
  {
    command: 'sasjs run ./path/run-job.sas -t targetName -c',
    description: ''
  },
  {
    command:
      'sasjs run ./path/run-job.sas -t targetName -c --log ./path/file.log',
    description: ''
  },
  {
    command:
      'sasjs run ./path/run-job.sas -t targetName --source ./path/source.json',
    description: ''
  }
]

export class RunCommand extends TargetCommand {
  constructor(args: string[]) {
    super(args, {
      parseOptions: {
        compile: {
          type: 'boolean',
          alias: 'c',
          default: false,
          description:
            'Used to compile the program prior to execution. Useful for including dependent macros and includes. More info here: https://cli.sasjs.io/compile'
        },
        log: {
          type: 'string',
          alias: 'l',
          default: '',
          description: 'Path where the log of the finished job will be saved.'
        },
        source: {
          type: 'string',
          alias: 's',
          description: 'Path to an input JSON containing job variables.'
        },
        logcheck: {
          type: 'boolean',
          default: undefined,
          description:
            'Check the SAS log this command received, and fail when logCheck in sasjsconfig.json says so. --no-logcheck switches both the report and the verdict off.'
        }
      },
      syntax,
      usage,
      description,
      examples
    })
  }

  public async execute() {
    const { target } = await this.getTargetInfo()

    const { sasFilePath, compile, log, source } = this.parsed

    setLogCheckMode(logCheckModeOf(this.parsed.logcheck))

    return await runSasCode(
      target,
      sasFilePath as string,
      compile as boolean,
      log as string,
      source as string
    )
      .then(() => {
        return ReturnCode.Success
      })
      .catch((err) => {
        if (isLogCheckFailure(err)) return ReturnCode.LogCheckError

        displayError(err, 'An error has occurred when running your SAS code.')
        return ReturnCode.InternalError
      })
  }
}

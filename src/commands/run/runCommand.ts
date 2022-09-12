import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'
import { displayError } from '../../utils'
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

    const { sasFilePath, compile, log } = this.parsed

    return await runSasCode(
      target,
      sasFilePath as string,
      compile as boolean,
      log as string
    )
      .then(() => {
        return ReturnCode.Success
      })
      .catch((err) => {
        displayError(err, 'An error has occurred when running your SAS code.')
        return ReturnCode.InternalError
      })
  }
}

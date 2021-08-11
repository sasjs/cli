import { ServerType } from '@sasjs/utils'
import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'
import { displayError, getAuthConfig } from '../../utils'
import { runSasJob } from './request'

const syntax = 'request <sasProgramPath> [options]'
const usage =
  'sasjs request <sasProgramPath> --data <path-to-datafile> --config <path-to-configfile> --target <target-name>'
const description =
  `Lets the user run a SAS job against a specified target.\n` +
  `The target can exist either in the local project configuration or in the global .sasjsrc file.`
const examples: CommandExample[] = [
  {
    command: 'sasjs request ./path/run-job.sas --target targetName',
    description: ''
  },
  {
    command:
      'sasjs request ./path/run-job.sas -t targetName --data ./path/data.json --config ./path/config.json',
    description: ''
  },
  {
    command:
      'sasjs request ./path/run-job.sas -t targetName -d ./path/data.json -c ./path/config.json',
    description: ''
  }
]

export class RequestCommand extends TargetCommand {
  constructor(args: string[]) {
    super(args, {
      parseOptions: {
        data: {
          type: 'string',
          alias: 'd',
          description:
            'The path to a json file containing the input data passed into the request.'
        },
        config: {
          type: 'string',
          alias: 'c',
          description:
            'The path to a json file containting the config to be used when executing a request.'
        }
      },
      syntax,
      usage,
      description,
      examples
    })
  }

  public async execute() {
    const { target, isLocal } = await this.getTargetInfo()

    const authConfig =
      target.serverType === ServerType.SasViya
        ? await getAuthConfig(target)
        : undefined

    const { sasProgramPath, data, config } = this.parsed

    return await runSasJob(
      target,
      isLocal as boolean,
      sasProgramPath as string,
      data as string,
      config as string,
      authConfig
    )
      .then(() => {
        return ReturnCode.Success
      })
      .catch((err) => {
        displayError(err, 'An error has occurred when running your SAS job.')
        return ReturnCode.InternalError
      })
  }
}

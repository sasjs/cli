import { ServerType } from '@sasjs/utils'
import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'
import { displayError } from '../../utils'
import { servicePackDeploy } from './deploy'

const syntax = 'servicepack <subCommand>'
const usage =
  'sasjs servicepack <deploy> --source <path-to-JSON-file> --target <target-name>'
const description =
  'Performs operations on Service Packs (collections of jobs & folders).'
const examples: CommandExample[] = [
  {
    command:
      'sasjs servicepack deploy --source ./path/services.json --target targetName',
    description: ''
  },
  {
    command:
      'sasjs servicepack deploy -s ./path/services.json -t targetName -f',
    description: ''
  }
]

export class ServicePackCommand extends TargetCommand {
  constructor(args: string[]) {
    super(args, {
      parseOptions: {
        source: {
          type: 'string',
          alias: 's',
          demandOption: true,
          description: 'JSON file containing the services and folders.'
        },
        force: {
          type: 'boolean',
          alias: 'f',
          default: false,
          description:
            'Used to force a deploy, eg even if the folders / services already exist (they will then be overwritten)'
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
    if (target.serverType !== ServerType.SasViya) {
      process.logger?.error(
        `Unable to deploy service pack to target ${target.name}. This command is only supported for server type ${ServerType.SasViya}.`
      )
      return ReturnCode.InternalError
    }

    const { source, force } = this.parsed

    return await servicePackDeploy(target, source as string, force as boolean)
      .then(() => {
        return ReturnCode.Success
      })
      .catch((err) => {
        displayError(err, 'An error has occurred when processing servicepack.')
        return ReturnCode.InternalError
      })
  }
}

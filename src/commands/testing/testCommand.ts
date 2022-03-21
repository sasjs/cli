import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'
import { displayError } from '../../utils'
import { runTest } from './test'

const syntax = 'test [filteringString..]'
const usage =
  'Usage: sasjs test [filtering-strings..] --source <test-flow-path> --outDirectory <folder-path> --target <target-name> --ignoreFail'
const description = 'Triggers SAS unit tests.'
const examples: CommandExample[] = [
  {
    command:
      'sasjs test jobs/standalone1 jobs/standalone2 --source <test-flow-path> --outDirectory <folder-path> --target <target-name> --ignoreFail',
    description: ''
  },
  {
    command:
      'sasjs test jobs/standalone1 jobs/standalone2 -s <test-flow-path> --out <folder-path> --t <target-name> --if',
    description: ''
  }
]

export class TestCommand extends TargetCommand {
  constructor(args: string[]) {
    super(args, {
      parseOptions: {
        outDirectory: {
          type: 'string',
          alias: 'out',
          description: 'Path to output folder for tests resuls.'
        },
        source: {
          type: 'string',
          alias: 's',
          description: 'Test flow located at source will be executed.'
        },
        ignoreFail: {
          type: 'boolean',
          default: false,
          alias: 'if',
          description:
            'If present, CLI will return exit code 0 even if tests are failing.'
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

    const { filteringString, outDirectory, source, ignoreFail } = this.parsed

    return await runTest(
      target,
      filteringString as string[],
      outDirectory as string,
      source as string,
      ignoreFail as boolean
    )
      .then(() => {
        return ReturnCode.Success
      })
      .catch((err) => {
        displayError(err, 'An error has occurred when running tests.')
        return ReturnCode.InternalError
      })
  }
}

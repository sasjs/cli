import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'
import { generateDot } from './generateDot'

const syntax = 'doc lineage'
const aliases = ['docs']
const usage = 'sasjs doc lineage'
const description = 'Generates lineage for the current project in dot language.'
const examples: CommandExample[] = [
  {
    command: 'sasjs doc lineage',
    description: ''
  }
]

export class GenerateDotCommand extends TargetCommand {
  constructor(args: string[]) {
    super(args, {
      parseOptions: {
        outDirectory: {
          type: 'string',
          alias: 'o',
          description:
            'Path to the directory where the doc output will be generated.'
        }
      },
      usage,
      description,
      examples,
      syntax,
      aliases
    })
  }

  public async execute() {
    const { target } = await this.getTargetInfo()
    const returnCode = await generateDot(
      target,
      this.parsed.outDirectory as string
    )
      .then((res) => {
        process.logger?.success(
          `Dot files have been generated!\nFiles are located in the ${res.outDirectory}' directory.`
        )
        return ReturnCode.Success
      })
      .catch((err) => {
        process.logger?.error('Error generating docs: ', err)
        return ReturnCode.InternalError
      })

    return returnCode
  }
}

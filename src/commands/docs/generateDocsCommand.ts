import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'
import { generateDocs } from './generateDocs'

const syntax = 'doc'
const aliases = ['docs']
const usage = 'sasjs doc'
const description =
  'Generates documentation for the current project using Doxygen.'
const examples: CommandExample[] = [
  {
    command: 'sasjs doc',
    description: ''
  }
]

export class GenerateDocsCommand extends TargetCommand {
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
    const returnCode = await generateDocs(
      target,
      this.parsed.outDirectory as string
    )
      .then((res) => {
        process.logger?.success(
          `Docs have been generated!\nThe docs are located in the ${res.outDirectory}' directory.\nClick to open: ${res.outDirectory}/index.html`
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

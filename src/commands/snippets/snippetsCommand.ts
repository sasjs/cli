import { generateSnippets } from './snippets'
import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'

const syntax = 'snippets'
const usage = 'sasjs snippets'
const description = `Generates VS Code snippets from SAS Macros.`
const examples: CommandExample[] = [
  {
    command: 'sasjs snippets',
    description: 'Generates VS Code snippets from SAS Macros.'
  }
]

const parseOptions = {
  outDirectory: {
    type: 'string',
    alias: 'o',
    description:
      'Path to the directory where the VS Code snippets output will be generated.'
  }
}

/**
 * 'snippets' command class.
 */
export class SnippetsCommand extends TargetCommand {
  constructor(args: string[]) {
    super(args, { syntax, usage, description, examples, parseOptions })
  }

  /**
   * Command execution method.
   * @returns promise that results into return code.
   */
  public async execute() {
    const { target } = await this.getTargetInfo()
    const config = process.sasjsConfig
    const { outDirectory } = this.parsed

    // Generate snippets
    return await generateSnippets(target, config, outDirectory as string)
      .then((filePath) => {
        process.logger?.success(
          `VS Code snippets generated! File location: ${filePath}`
        )
        process.logger?.info(
          `Follow these instructions https://cli.sasjs.io/snippets/#import-snippets-to-vs-code to import generated VS Code snippets into your VS Code.`
        )

        return ReturnCode.Success
      })
      .catch((err) => {
        process.logger?.error('Error generating VS Code snippets: ', err)

        return ReturnCode.InternalError
      })
  }
}

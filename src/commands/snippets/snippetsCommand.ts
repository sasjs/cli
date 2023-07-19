import { generateSnippets } from './snippets'
import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'

const syntax = 'snippets'
const usage = 'sasjs snippets'
const description = `Generates VS Code snippets from @sasjs/core.`
const examples: CommandExample[] = [
  {
    command: 'sasjs snippets',
    description: 'Generates VS Code snippets from @sasjs/core.'
  }
]

const parseOptions = {
  outDirectory: {
    type: 'string',
    alias: 'o',
    description:
      'Path to the directory where the snippets output will be generated.'
  }
}

export class SnippetsCommand extends TargetCommand {
  constructor(args: string[]) {
    super(args, { syntax, usage, description, examples, parseOptions })
  }

  public async execute() {
    const { target } = await this.getTargetInfo()
    const config = process.sasjsConfig
    const { outDirectory } = this.parsed

    return await generateSnippets(target, config, outDirectory as string)
      .then((filePath) => {
        process.logger?.success(
          `VS Code snippets generated! File location: ${filePath}`
        )

        return ReturnCode.Success
      })
      .catch((err) => {
        process.logger?.error('Error generating VS Code snippets: ', err)

        return ReturnCode.InternalError
      })
  }
}

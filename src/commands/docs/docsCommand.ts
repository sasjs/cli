import { generateDocs, generateDot, initDocs } from '..'
import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'
import { getLocalConfig } from '../../utils'

enum DocSubCommand {
  Init = 'init',
  Lineage = 'lineage'
}

const syntax = 'doc [subCommand]'
const aliases = ['docs']
const usage = 'sasjs doc [init | lineage]'
const description =
  'Generates docs for SAS Programs / Macros / Jobs / Services listed in the sasjsconfig.json file by default and supplied Target.'
const examples: CommandExample[] = [
  {
    command: 'sasjs doc',
    description:
      'Generates documentation for the current project using Doxygen.'
  },
  {
    command: 'sasjs doc lineage',
    description: 'Generates lineage for the current project in dot language.'
  },
  {
    command: 'sasjs doc init',
    description:
      'Initialises doxygen configuration for existing SASjs projects. Can also be used to reset the configuration and content.'
  }
]

const commandParseOptions = {
  outDirectory: {
    type: 'string',
    alias: 'o',
    description: 'Path to the directory where the doc output will be generated.'
  }
}

export class DocsCommand extends TargetCommand {
  constructor(args: string[]) {
    const subCommand = args[3]
    const parseOptions =
      subCommand === DocSubCommand.Init ? {} : commandParseOptions
    super(args, {
      parseOptions,
      usage,
      description,
      examples,
      syntax,
      aliases
    })
  }

  public async execute() {
    return this.parsed.subCommand === DocSubCommand.Init
      ? await this.executeInitDocs()
      : this.parsed.subCommand === DocSubCommand.Lineage
      ? await this.executeGenerateDot()
      : await this.executeGenerateDocs()
  }

  async executeGenerateDocs() {
    const { target } = await this.getTargetInfo()
    const config = process.sasjsConfig
    const returnCode = await generateDocs(
      target,
      config,
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

  async executeGenerateDot() {
    const { target } = await this.getTargetInfo()
    const config = process.sasjsConfig
    const returnCode = await generateDot(
      target,
      config,
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

  async executeInitDocs() {
    const returnCode = await initDocs()
      .then(() => {
        process.logger?.success(
          'The doxygen configuration files have been initialised under `/sasjs/doxy/`. You can now run `sasjs doc`.'
        )
        return ReturnCode.Success
      })
      .catch((err) => {
        process.logger?.error('Error initialising docs: ', err)
        return ReturnCode.InternalError
      })

    return returnCode
  }
}

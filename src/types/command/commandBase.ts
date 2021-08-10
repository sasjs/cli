import yargs from 'yargs'
import { CommandExample } from './commandExample'
import { ReturnCode } from './returnCode'
import { unalias } from './unalias'

const commandMap = new Map<string, string[]>([
  ['compile', ['job', 'service', 'identify']],
  ['context', ['list', 'create', 'edit', 'delete']]
])

interface Command {
  name: string
  subCommand: string
  value: string
  execute: (...parameters: any) => Promise<ReturnCode>
}

export interface CommandOptions {
  parseOptions?: { [key: string]: Object }
  syntax?: string
  aliases?: string[]
  usage?: string
  description?: string
  examples?: CommandExample[]
  strict?: boolean
}

export const defaultCommandOptions: CommandOptions = {
  parseOptions: {},
  syntax: '*',
  aliases: [],
  usage: '',
  description: '',
  examples: [],
  strict: true
}

export class CommandBase implements Command {
  protected parsed

  constructor(args: string[], options: CommandOptions = defaultCommandOptions) {
    const commandOptions = { ...defaultCommandOptions, ...options }
    const {
      parseOptions,
      syntax,
      aliases,
      usage,
      description,
      examples,
      strict
    } = commandOptions

    const command = unalias(syntax!.split(' ')[0])

    let builder = (y: yargs.Argv) =>
      y.example(
        examples!.map((example: CommandExample) => [
          example.command,
          example.description
        ])
      )
    if ([...commandMap.keys()].includes(command)) {
      builder = (y: yargs.Argv) =>
        y
          .example(
            examples!.map((example: CommandExample) => [
              example.command,
              example.description
            ])
          )
          .positional('subCommand', {
            choices: commandMap.get(command)
          })
    }

    this.parsed = yargs(args.slice(2))
      .help(false)
      .version(false)
      .options(parseOptions!)
      .command([syntax!, ...aliases!], description!, builder)
      .usage(usage!)
      .strict(strict!).argv
  }

  public get name() {
    if (this.parsed.name) {
      return unalias(this.parsed.name as string)
    }

    return unalias(`${this.parsed._[0]}`)
  }

  public get subCommand() {
    if (this.parsed.subCommand) {
      return this.parsed.subCommand as string
    }
    if (
      this.parsed._.length > 1 &&
      [...commandMap.keys()].includes(unalias(this.name))
    ) {
      return `${this.parsed._[1]}`
    }
    return ''
  }

  public get value() {
    if (this.parsed.value) {
      return this.parsed.value as string
    }
    if (this.parsed._.length > 2) {
      return `${this.parsed._[2]}`
    } else if (
      this.parsed._.length > 1 &&
      ![...commandMap.keys()].includes(unalias(this.name))
    ) {
      return `${this.parsed._[1]}`
    }
    return ''
  }

  public async execute(): Promise<ReturnCode> {
    throw new Error(
      'CommandBase does not provide an `execute` method. Please implement the specific `execute` method for your command.'
    )
  }
}

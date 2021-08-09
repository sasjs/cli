import yargs from 'yargs'
import { CommandExample } from './commandExample'
import { ReturnCode } from './returnCode'
import { unalias } from './unalias'

const commandsWithSubCommands = [
  'job',
  'flow',
  'context',
  'folder',
  'add',
  'compile',
  'doc'
]

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
  example?: CommandExample
  strict?: boolean
}

export const defaultCommandOptions: CommandOptions = {
  parseOptions: {},
  syntax: '*',
  aliases: [],
  usage: '',
  example: { command: '', description: '' },
  strict: true
}

export class CommandBase implements Command {
  protected parsed

  constructor(args: string[], options: CommandOptions = defaultCommandOptions) {
    const commandOptions = { ...defaultCommandOptions, ...options }
    const { parseOptions, syntax, aliases, usage, example, strict } =
      commandOptions

    this.parsed = yargs(args.slice(2))
      .help(false)
      .version(false)
      .options(parseOptions!)
      .command([syntax!, ...aliases!], example!.description)
      .usage(usage!)
      .example(example!.command, example!.description)
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
      commandsWithSubCommands.includes(unalias(this.name))
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
      !commandsWithSubCommands.includes(unalias(this.name))
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

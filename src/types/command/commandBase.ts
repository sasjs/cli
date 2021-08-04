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
  'compile'
]

interface Command {
  name: string
  subCommand: string
  value: string
  execute: (...parameters: any) => Promise<ReturnCode>
}

export class CommandBase implements Command {
  protected parsed

  constructor(
    args: string[],
    protected parseOptions = {},
    protected aliases: string[] = [],
    protected usage = '',
    protected example: CommandExample = { command: '', description: '' },
    strict = true
  ) {
    this.parsed = yargs(args.slice(2))
      .help(false)
      .version(false)
      .options(parseOptions)
      .usage(usage)
      .example(example.command, example.description)
      .strict(strict).argv
  }

  public get name() {
    return unalias(`${this.parsed._[0]}`)
  }

  public get subCommand() {
    if (
      this.parsed._.length > 1 &&
      commandsWithSubCommands.includes(unalias(this.name))
    ) {
      return `${this.parsed._[1]}`
    }
    return ''
  }

  public get value() {
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

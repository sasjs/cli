import { CommandBase } from '../../types'
import { CommandExample, ReturnCode } from '../../types/command'
import { addTarget } from './addTarget'

const syntax = 'add'
const usage = 'sasjs add [options]'
const description = 'Adds a target to your local or global SASjs configuration.'
const examples: CommandExample[] = [
  {
    command: 'sasjs add',
    description: ''
  }
]

export class AddTargetCommand extends CommandBase {
  constructor(args: string[]) {
    const parseOptions: { [key: string]: Object } = {
      insecure: {
        type: 'boolean',
        alias: 'i',
        default: false,
        description:
          'Allows the command to bypass the HTTPs requirement. Not recommended.'
      }
    }
    super(args, { parseOptions, syntax, usage, description, examples })
  }

  public get insecure(): boolean {
    return !!this.parsed.insecure
  }

  public async execute() {
    return await addTarget(this.insecure)
      .then(() => {
        process.logger?.success('Target has been successfully added!')
        return ReturnCode.Success
      })
      .catch((err) => {
        process.logger?.error('Error adding target: ', err)
        return ReturnCode.InternalError
      })
  }
}

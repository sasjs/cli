import { Target } from '@sasjs/utils'
import {
  findTargetInConfiguration,
  loadTargetEnvVariables,
  validateTargetName
} from '../../utils'
import { CommandBase } from './commandBase'
import { CommandExample } from './commandExample'
import { ReturnCode } from './returnCode'

export class TargetCommand extends CommandBase {
  protected _targetInfo?: { target: Target; isLocal: boolean }

  constructor(
    args: string[],
    parseOptions: { [key: string]: Object },
    aliases: string[],
    usage: string,
    example: CommandExample
  ) {
    parseOptions = {
      ...parseOptions,
      target: {
        type: 'string',
        alias: 't',
        description: 'The target to execute this command against.'
      }
    }
    super(args, parseOptions, aliases, usage, example)
  }

  public get target(): Promise<{ target: Target; isLocal: boolean }> {
    if (this._targetInfo) {
      return Promise.resolve(this._targetInfo)
    }

    const targetName = validateTargetName(this.parsed.target as string)
    return loadTargetEnvVariables(targetName)
      .then(() => {
        return findTargetInConfiguration(targetName)
          .then((res) => {
            this._targetInfo = res
            return res
          })
          .catch((err) => {
            process.logger?.error(
              'Error reading target from configuration: ',
              err
            )
            process.exit(ReturnCode.InternalError)
          })
      })
      .catch((err) => {
        process.logger?.error(
          `Error loading environment variables for target ${targetName}: `,
          err
        )
        process.exit(ReturnCode.InternalError)
      })
  }
}

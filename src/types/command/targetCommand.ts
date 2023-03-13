import { Target } from '@sasjs/utils'
import {
  findTargetInConfiguration,
  loadTargetEnvVariables,
  validateTargetName,
  getLocalConfig,
  getGlobalRcFile,
  setConstants
} from '../../utils'
import { CommandBase, CommandOptions } from './commandBase'
import { ReturnCode } from './returnCode'

export class TargetCommand extends CommandBase {
  protected _targetInfo?: { target: Target; isLocal: boolean }

  constructor(args: string[], options: CommandOptions) {
    const parseOptions = {
      ...(options.parseOptions || {}),
      target: {
        type: 'string',
        alias: 't',
        description: 'The target to execute this command against.'
      }
    }
    super(args, { ...options, parseOptions })
  }

  public async getTargetInfo(): Promise<{ target: Target; isLocal: boolean }> {
    if (this._targetInfo) {
      return Promise.resolve(this._targetInfo)
    }

    const targetName = validateTargetName(this.parsed.target as string)

    await loadTargetEnvVariables(targetName).catch((err) => {
      process.logger?.error(
        `Error loading environment variables for target ${targetName}: `,
        err
      )
      process.exit(ReturnCode.InternalError)
    })

    return await findTargetInConfiguration(targetName)
      .then(async (res) => {
        this._targetInfo = res

        const configuration = res.isLocal
          ? await getLocalConfig()
          : await getGlobalRcFile()

        await setConstants(res.isLocal, res.target, configuration)
        process.sasjsConfig = configuration

        return res
      })
      .catch((err) => {
        process.logger?.error('Error reading target from configuration: ', err)
        process.exit(ReturnCode.InternalError)
      })
  }
}

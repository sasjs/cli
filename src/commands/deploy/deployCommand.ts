import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'
import { deploy } from './deploy'

const syntax = 'deploy'
const aliases = ['d']
const usage = 'sasjs deploy [options]'
const example: CommandExample = {
  command: 'sasjs deploy -t myTarget | sasjs d -t myTarget',
  description: 'Deploys a built project to the server specified in the target.'
}

export class DeployCommand extends TargetCommand {
  constructor(args: string[]) {
    super(args, { syntax, usage, example, aliases })
  }

  public async execute() {
    const { target, isLocal } = await this.getTargetInfo()

    return await deploy(target, isLocal)
      .then(() => {
        process.logger?.success(
          `Services have been successfully deployed to ${target.serverUrl}.`
        )
        return ReturnCode.Success
      })
      .catch((err) => {
        process.logger?.error(
          'An error has occurred when deploying services: ',
          err
        )
        return ReturnCode.InternalError
      })
  }
}

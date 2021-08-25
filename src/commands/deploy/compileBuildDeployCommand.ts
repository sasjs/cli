import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'
import { compile } from '../compile/compile'
import { build } from '../build/build'
import { deploy } from './deploy'

const syntax = 'compilebuilddeploy'
const aliases = ['cbd']
const usage = 'sasjs compilebuilddeploy [options]'
const description =
  'Compiles, builds and deploys jobs and services in the project to the server configured in the specified target.'
const examples: CommandExample[] = [
  {
    command: 'sasjs compilebuilddeploy -t myTarget',
    description: ''
  },
  {
    command: 'sasjs cbd -t myTarget',
    description: ''
  }
]

export class CompileBuildDeployCommand extends TargetCommand {
  constructor(args: string[]) {
    super(args, { syntax, usage, aliases, description, examples })
  }

  public async execute() {
    const { target, isLocal } = await this.getTargetInfo()

    let returnCode = await compile(target, true)
      .then(() => ReturnCode.Success)
      .catch((err) => {
        process.logger?.error('Error compiling project: ', err)
        return ReturnCode.InternalError
      })

    if (returnCode === ReturnCode.InternalError) {
      return returnCode
    }

    const { buildDestinationFolder } = process.sasjsConstants

    process.logger?.success(
      `Services have been successfully compiled!\nThe compile output is located in the ${buildDestinationFolder} directory.`
    )

    returnCode = await build(target)
      .then(() => ReturnCode.Success)
      .catch((err) => {
        process.logger?.error('Error building project: ', err)
        return ReturnCode.InternalError
      })

    if (returnCode === ReturnCode.InternalError) {
      return returnCode
    }

    process.logger?.success(
      `Services have been successfully built!\nThe build output is located in the ${buildDestinationFolder} directory.`
    )

    returnCode = await deploy(target, isLocal)
      .then(() => ReturnCode.Success)
      .catch((err) => {
        process.logger?.error('Error deploying project: ', err)
        return ReturnCode.InternalError
      })

    if (returnCode === ReturnCode.InternalError) {
      return returnCode
    }

    process.logger?.success(
      `Services have been successfully deployed to ${target.serverUrl}`
    )

    return returnCode
  }
}

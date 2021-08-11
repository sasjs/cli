import { init } from './init'
import { CommandExample, ReturnCode } from '../../types/command'
import { CommandBase } from '../../types'

const syntax = 'init'
const usage = 'sasjs init'
const description =
  'Adds SASjs to an existing project located in the current working directory.'
const examples: CommandExample[] = [
  {
    command: 'sasjs init',
    description: ''
  }
]

export class InitCommand extends CommandBase {
  constructor(args: string[]) {
    super(args, {
      syntax,
      usage,
      description,
      examples
    })
  }

  public async execute() {
    return await init()
      .then(() => {
        process.logger?.success(
          'This project is now powered by SASjs!\nYou can use any sasjs command within the project.\n\nFor more information, type `sasjs help` or visit https://cli.sasjs.io/'
        )
        return ReturnCode.Success
      })
      .catch((err: any) => {
        process.logger?.error('Error initialising SASjs: ', err)
        return ReturnCode.InternalError
      })
  }
}

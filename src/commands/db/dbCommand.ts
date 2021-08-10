import { buildDB } from './db'
import { CommandExample, ReturnCode } from '../../types/command'
import { CommandBase } from '../../types'

const syntax = 'db'
const aliases = ['build-DB', 'build-db']
const usage = 'sasjs db'
const description =
  'Concatenates the DDL and SAS files within the `sasjs/db` directory.'
const examples: CommandExample[] = [
  {
    command: 'sasjs db',
    description: ''
  }
]

export class DbCommand extends CommandBase {
  constructor(args: string[]) {
    super(args, {
      syntax,
      aliases,
      usage,
      description,
      examples
    })
  }

  public async execute() {
    return await buildDB()
      .then(() => {
        process.logger?.success('DB build completed!')
        return ReturnCode.Success
      })
      .catch((err) => {
        process.logger?.error('Error building DB: ', err)
        return ReturnCode.InternalError
      })
  }
}

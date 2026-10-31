import { buildDB } from './db'
import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'

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

export class DbCommand extends TargetCommand {
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
    // Resolving the target is what sets process.sasjsConstants - buildDB reads
    // the source and destination db folders from there.
    await this.getTargetInfo()

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

import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'
import { displayError } from '../../utils'
import { runTest } from './test'

const syntax = 'test'
const usage = 'Usage: sasjs test [options]'
const example: CommandExample = {
  command: 'sasjs test -t myTarget | sasjs c -t myTarget',
  description:
    'tests all jobs and services in the project by inlining all dependencies and adds init and term programs as configured in the specified target.'
}

export class TestCommand extends TargetCommand {
  constructor(args: string[]) {
    super(args, { syntax, usage, example })
  }

  public async execute() {
    const { target } = await this.getTargetInfo()
    const { buildDestinationFolder } = process.sasjsConstants

    return await runTest(target)
      .then(() => {
        return ReturnCode.Success
      })
      .catch((err) => {
        displayError(err, 'An error has occurred when running tests.')
        return ReturnCode.InternalError
      })
  }
}

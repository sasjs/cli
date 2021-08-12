import { initLint } from './initLint'
import { lintFix, processLint } from './processLint'
import { CommandExample, ReturnCode } from '../../types/command'
import { CommandBase } from '../../types'
import { displayError, displaySuccess } from '../../utils'

const syntax = 'lint [subCommand]'
const usage = 'sasjs lint [ fix | lint ]'
const description = `Provides the capability to identify, for SAS file, whether there are any ERRORs or WARNINGs present and if so, which line number they are on.`
const examples: CommandExample[] = [
  {
    command: 'sasjs lint',
    description:
      'Lints all .sas files in the current project.\n' +
      'All the exceptions (along with line / column numbers) will be shown in the console.'
  },
  {
    command: 'sasjs lint fix',
    description:
      'Fixes lint violations in all .sas files in the current project.\n' +
      'All the exceptions (along with line / column numbers) will be fixed.'
  },
  {
    command: 'sasjs lint init',
    description: `Creates a SASjs Lint configuration file. Its name will be of the form '.sasjslint'`
  }
]

export class LintCommand extends CommandBase {
  constructor(args: string[]) {
    super(args, {
      syntax,
      usage,
      description,
      examples
    })
  }

  public async execute() {
    const { subCommand } = this.parsed

    if (subCommand === 'init') {
      return await initLint()
        .then((res: { fileAlreadyExisted: boolean }) => {
          if (res.fileAlreadyExisted)
            displaySuccess(
              'The lint configuration file `.sasjslint` is already present.'
            )
          else
            displaySuccess(
              'The lint configuration file `.sasjslint` has been created. You can now run `sasjs lint`.'
            )
          return ReturnCode.Success
        })
        .catch((err: any) => {
          displayError(
            err,
            'An error has occurred whilst initialising SASjs Lint.'
          )
          return ReturnCode.InternalError
        })
    }

    if (subCommand === 'fix') {
      return await lintFix()
        .then(() => ReturnCode.Success)
        .catch((err) => {
          displayError(
            err,
            'An error has occurred while running SASjs Lint Fix.'
          )
          return ReturnCode.LintError
        })
    }

    return await processLint()
      .then((result) => {
        if (result.errors) {
          displayError('Please fix the identified lint errors.')
          return ReturnCode.LintError
        }
        if (result.warnings) {
          process.logger.warn('Please fix the identified lint warnings.')
          return ReturnCode.Success
        }
        displaySuccess('All matched files use @sasjs/lint code style!')
        return ReturnCode.Success
      })
      .catch((err) => {
        displayError(
          err,
          'An error has occurred when processing lint operation.'
        )
        return ReturnCode.InternalError
      })
  }
}

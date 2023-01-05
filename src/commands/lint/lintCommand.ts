import { initLint } from './initLint'
import { lintFix, processLint } from './processLint'
import { CommandExample, ReturnCode } from '../../types/command'
import { CommandBase } from '../../types'
import { displayError, displaySuccess } from '../../utils'

const syntax = 'lint <subCommand> [filterStrings..]'
const usage = 'sasjs lint [ find | fix | init ]'
const description = `Provides the capability to identify, for SAS file, whether there are any ERRORs or WARNINGs present and if so, which line number they are on.`
const examples: CommandExample[] = [
  {
    command: 'sasjs lint',
    description:
      'Lints all .sas files in the current project.\n' +
      'All the exceptions (along with line / column numbers) will be shown in the console.'
  },
  {
    command: 'sasjs lint find mf_a mf_b',
    description:
      'Lints all .sas files starting from mf_a or mf_b in the current project.\n' +
      'All the exceptions (along with line / column numbers) will be shown in the console.'
  },
  {
    command: 'sasjs lint find /home/user/project/sasjs/services/appinit.sas',
    description:
      'Lints only appinit.sas file present in services folder.\n' +
      'All the exceptions (along with line / column numbers) will be shown in the console.'
  },
  {
    command: 'sasjs lint find sasjs/macros',
    description:
      'Lints all .sas files present in sasjs/macros folder.\n' +
      'All the exceptions (along with line / column numbers) will be shown in the console.'
  },
  {
    command: 'sasjs lint fix',
    description:
      'Fixes lint violations in all .sas files in the current project.\n' +
      'All the exceptions (along with line / column numbers) will be fixed.'
  },
  {
    command: 'sasjs lint fix mf_a mf_b',
    description:
      'Fixes lint violations in all .sas files starting from mf_a or mf_b in the current project.\n' +
      'All the exceptions (along with line / column numbers) will be fixed.'
  },
  {
    command: 'sasjs lint fix /home/user/project/sasjs/services/appinit.sas',
    description:
      'Fixes lint violations in only appinit.sas in services folder.\n' +
      'All the exceptions (along with line / column numbers) will be fixed.'
  },
  {
    command: 'sasjs lint fix sasjs/macros/',
    description:
      'Fixes lint violations in all .sas files in the macros folder.\n' +
      'All the exceptions (along with line / column numbers) will be fixed.'
  },
  {
    command: 'sasjs lint init',
    description: `Creates a SASjs Lint configuration file. Its name will be of the form '.sasjslint'`
  }
]

export class LintCommand extends CommandBase {
  constructor(args: string[]) {
    if (args.length < 4) {
      args.splice(3, 0, 'find')
    }

    super(args, {
      syntax,
      usage,
      description,
      examples
    })
  }

  public async execute() {
    const { subCommand, filterStrings } = this.parsed

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
      return await lintFix(filterStrings as string[])
        .then(() => ReturnCode.Success)
        .catch((err) => {
          displayError(
            err,
            'An error has occurred while running SASjs Lint Fix.'
          )
          return ReturnCode.LintError
        })
    }

    return await processLint(filterStrings as string[])
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

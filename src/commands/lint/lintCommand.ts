import { initLint } from './initLint'
import { lintFix, processLint } from './processLint'
import { CommandExample, ReturnCode } from '../../types/command'
import { CommandBase } from '../../types'
import { displayError, displaySuccess } from '../../utils'

const subCommands = ['init', 'fix', 'find']
const failOnValues = ['error', 'warning']

type FailOn = 'error' | 'warning'

const syntax = 'lint <subCommand> [filterStrings..]'
const usage = 'sasjs lint [ find | fix | init ] [--fail-on error|warning]'
const description = `Provides the capability to identify, for SAS file, whether there are any ERRORs or WARNINGs present and if so, which line number they are on.`

/**
 * Inserts the default `find` subcommand unless the first argument is already a
 * subcommand, so `sasjs lint --fail-on warning` and `sasjs lint src/app.sas`
 * both report rather than fail to parse. The check is made on the arguments
 * rather than on their number, because an option and its value count as
 * arguments and used to push the subcommand out of position.
 */
const withDefaultSubCommand = (args: string[]): string[] => {
  const firstPositional = args.slice(3).find((arg) => !arg.startsWith('-'))

  return firstPositional && subCommands.includes(firstPositional)
    ? args
    : [...args.slice(0, 3), 'find', ...args.slice(3)]
}

const examples: CommandExample[] = [
  {
    command: 'sasjs lint',
    description:
      'Lints all .sas files in the current project.\n' +
      'All the exceptions (along with line / column numbers) will be shown in the console.'
  },
  {
    command: 'sasjs lint --fail-on warning',
    description:
      'Lints all .sas files in the current project and fails on a warning as well as an error.\n' +
      'The same can be set for every run by adding `"default": "error"` to `severityLevel` in `.sasjslint`.'
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
    super(withDefaultSubCommand(args), {
      syntax,
      usage,
      description,
      examples,
      parseOptions: {
        'fail-on': {
          type: 'string',
          description: `Lowest severity that fails the command: ${failOnValues.join(
            ', '
          )}. Defaults to error, so a warning is reported without failing. Applies to the report run, not to lint fix.`
        }
      }
    })
  }

  public async execute() {
    const { subCommand, filterStrings, failOn } = this.parsed

    if (failOn !== undefined && !failOnValues.includes(failOn as FailOn)) {
      displayError(
        new Error(
          `Invalid value for --fail-on: ${failOn}. Use one of ${failOnValues.join(
            ', '
          )}.`
        )
      )

      return ReturnCode.InvalidCommand
    }

    const failOnSeverity: FailOn = (failOn as FailOn) ?? 'error'

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
        if (result.warnings && failOnSeverity === 'warning') {
          const count = result.warningCount
          displayError(
            count === 1
              ? '1 lint warning treated as an error because of --fail-on warning. Please fix it.'
              : `${count} lint warnings treated as errors because of --fail-on warning. Please fix them.`
          )
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

import { CommandExample, ReturnCode } from '../../types/command'
import { CommandBase } from '../../types'
import { displayError, displaySuccess } from '../../utils'
import { processFormat } from './processFormat'

const syntax = 'format [filterStrings..]'
const usage = 'sasjs format [filterStrings..] [--check]'
const description = `Rewrites .sas files into the project's canonical form: the rules in .sasjslint (header, wrapping, trailing space) and then the layout from the SAS language engine (indentation, statement breaks, keyword case). With --check nothing is written and the command fails if any file would change.`

const examples: CommandExample[] = [
  {
    command: 'sasjs format',
    description:
      'Rewrites every .sas file in the current project into its canonical form.'
  },
  {
    command: 'sasjs format --check',
    description:
      'Reports the files that would change and fails without writing any of them, which is how a pipeline gates on formatting.'
  },
  {
    command: 'sasjs format sasjs/macros',
    description: 'Rewrites the .sas files whose path matches sasjs/macros.'
  },
  {
    command: 'sasjs format /home/user/project/sasjs/services/appinit.sas',
    description: 'Rewrites only appinit.sas, named by its absolute path.'
  }
]

/**
 * `sasjs format` is `sasjs lint fix`'s pass with the layout engine attached -
 * both call `formatText` in `@sasjs/lint`, and the difference is that the engine
 * indents, breaks statements and cases keywords, which a per-rule fixer cannot do
 * without changing lines its rule never flagged.
 *
 * They are separate commands on purpose. Making `lint fix` lay files out would
 * reformat every project that already uses it, in a patch release, with no way to
 * opt out; a user who wants canonical formatting asks for it here.
 */
export class FormatCommand extends CommandBase {
  constructor(args: string[]) {
    super(args, {
      syntax,
      usage,
      description,
      examples,
      parseOptions: {
        check: {
          type: 'boolean',
          description:
            'Write nothing; report the files that would change and fail if there are any.'
        }
      }
    })
  }

  public async execute() {
    const { filterStrings, check } = this.parsed

    // `filterStrings` is absent rather than empty when nothing was given.
    return await processFormat(
      (filterStrings as string[]) ?? [],
      Boolean(check)
    )
      .then((outcome) => {
        if (check && outcome.changedFilePaths.length) {
          process.logger?.info(
            `${outcome.changedFilePaths.length} of ${outcome.examinedCount} files are not canonically formatted:`
          )
          outcome.changedFilePaths.forEach((filePath) =>
            process.logger?.info(filePath)
          )
          displayError('Run `sasjs format` to rewrite them.')

          return ReturnCode.FormatError
        }

        if (!outcome.changedFilePaths.length) {
          displaySuccess(
            `All ${outcome.examinedCount} files are canonically formatted.`
          )

          return ReturnCode.Success
        }

        process.logger?.success(
          `Rewrote ${outcome.changedFilePaths.length} of ${outcome.examinedCount} files.`
        )
        outcome.changedFilePaths.forEach((filePath) =>
          process.logger?.info(filePath)
        )

        return ReturnCode.Success
      })
      .catch((err) => {
        displayError(err, 'An error has occurred while formatting.')

        return ReturnCode.InternalError
      })
  }
}

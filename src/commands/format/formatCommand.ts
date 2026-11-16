import { CommandExample, ReturnCode } from '../../types/command'
import { CommandBase } from '../../types'
import { displayError, displaySuccess } from '../../utils'
import { processFormat } from './processFormat'

const syntax = 'format [filterStrings..]'
const usage = 'sasjs format [filterStrings..] [--check]'
const description = `Rewrites .sas files into the project's canonical form. The SAS language engine reprints each file - indentation, statement breaks, keyword case - and the rules in .sasjslint (header, wrapping, trailing space) then run over its output. With --check nothing is written and the command fails if any file would change.`

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
        // A run without the engine is a rule-only run, and must not read as a
        // clean one: the layout pass this command exists for never happened.
        if (outcome.engineUnavailable) {
          displayError(
            'The SAS language engine could not be loaded, so only the linting rules were applied. Run `sasjs build` and try again, or install the CLI again.'
          )

          return ReturnCode.FormatError
        }

        // A filter that named nothing means the run covered nothing the user asked
        // for - a mistyped path or a renamed folder must not read as a clean run,
        // and must never pass a `--check` gate.
        if (outcome.unmatchedFilters.length) {
          outcome.unmatchedFilters.forEach((filter) =>
            process.logger?.warn(`No .sas file matched the filter: ${filter}`)
          )
          displayError(
            `${outcome.unmatchedFilters.length} filter(s) named no file, so the run did not cover them.`
          )

          return ReturnCode.FormatError
        }

        // Unsettled files were left as they were found, so the run did not do
        // what was asked for those files either.
        if (outcome.unsettledFilePaths.length) {
          process.logger?.info(
            `${outcome.unsettledFilePaths.length} file(s) did not settle and were left unchanged:`
          )
          outcome.unsettledFilePaths.forEach((filePath) =>
            process.logger?.info(filePath)
          )
          displayError(
            'Formatting did not settle for those files, so nothing was written to them.'
          )

          return ReturnCode.FormatError
        }

        // A filter this command will not format, or a file it could not finish,
        // means the run did not do what it was asked - reported, not skipped
        // quietly, so a pipeline does not read a partial run as a clean one.
        if (outcome.rejectedFilePaths.length) {
          outcome.rejectedFilePaths.forEach(({ filePath, message }) =>
            process.logger?.warn(`${filePath}: ${message}`)
          )
          displayError(
            `${outcome.rejectedFilePaths.length} path(s) were not formatted.`
          )

          return ReturnCode.FormatError
        }

        if (outcome.failedFilePaths.length) {
          outcome.failedFilePaths.forEach(({ filePath, message }) =>
            process.logger?.error(`${filePath}: ${message}`)
          )
          displayError(
            `${outcome.failedFilePaths.length} file(s) could not be formatted.`
          )

          return ReturnCode.FormatError
        }

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

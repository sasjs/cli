import { CommandExample, ReturnCode } from '../../types/command'
import { CommandBase } from '../../types'
import { displayError } from '../../utils'
import { mergeConfig, readLogCheckConfig } from './logCheckConfig'
import { processLogCheck } from './processLogCheck'
import { renderLogCheck } from './renderLogCheck'
import { FailOn, OutputFormat } from './types'

const failOnValues: FailOn[] = ['error', 'warning', 'note', 'never']
const formats: OutputFormat[] = ['human', 'json', 'annotations']

const syntax = 'logcheck [paths..]'
const aliases = ['lc']
const usage =
  'sasjs logcheck [path..] [--fail-on error|warning|note|never] [--format human|json|annotations]'
const description =
  `Checks SAS logs for what SAS itself printed - ERRORs, WARNINGs and the notes that flag a problem - and fails when the failure policy is broken.\n` +
  `With no path, the results folder of the current project is checked, which is where run, job and test leave their logs.\n` +
  `No target, no login and no project are needed: a log from Enterprise Guide, or from a server somewhere else, checks the same way.`
const examples: CommandExample[] = [
  {
    command: 'sasjs logcheck',
    description:
      "Checks every log in the project's sasjsresults folder and fails on any ERROR."
  },
  {
    command: 'sasjs logcheck ./logs',
    description:
      'Checks every file under ./logs, skipping the ones that are not SAS logs.'
  },
  {
    command: 'sasjs logcheck run.log --fail-on warning',
    description: 'Checks one log, and fails on a WARNING as well as an ERROR.'
  },
  {
    command: 'sasjs logcheck --max-warnings 10',
    description:
      'Fails when the checked logs carry more than ten warnings in total.'
  },
  {
    command: 'sasjs logcheck --ignore-code 49-169',
    description:
      'Reports everything except the notes carrying the SAS message code 49-169.'
  },
  {
    command: 'sasjs logcheck --format json',
    description: 'Prints the result as JSON, for a pipeline to read.'
  },
  {
    command: 'sasjs logcheck --format annotations',
    description:
      'Prints GitHub Actions annotations, underlining each issue in the workflow log.'
  }
]

export class LogCheckCommand extends CommandBase {
  constructor(args: string[]) {
    super(args, {
      parseOptions: {
        'fail-on': {
          type: 'string',
          description: `Lowest severity that fails the check: ${failOnValues.join(
            ', '
          )}. Defaults to the logCheck.failOn setting in sasjsconfig.json, or error.`
        },
        'max-warnings': {
          type: 'number',
          description:
            'Number of warnings tolerated before the check fails, whatever --fail-on says.'
        },
        'ignore-code': {
          type: 'array',
          description:
            'SAS message code to suppress, e.g. 49-169. Repeatable, and added to any codes already suppressed in sasjsconfig.json.'
        },
        'ignore-path': {
          type: 'array',
          description:
            'Log path to leave out, as a substring or a glob. Repeatable.'
        },
        format: {
          type: 'string',
          default: 'human',
          description: `How to print the result: ${formats.join(
            ', '
          )}. Defaults to human.`
        },
        json: {
          type: 'boolean',
          default: false,
          description: 'Shorthand for --format json.'
        },
        verbose: {
          type: 'boolean',
          alias: 'v',
          default: false,
          description: 'List the files that were skipped, and why.'
        }
      },
      syntax,
      aliases,
      usage,
      description,
      examples
    })
  }

  public async execute() {
    const {
      paths,
      failOn,
      maxWarnings,
      ignoreCode,
      ignorePath,
      format,
      json,
      verbose
    } = this.parsed

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

    if (format !== undefined && !formats.includes(format as OutputFormat)) {
      displayError(
        new Error(
          `Invalid value for --format: ${format}. Use one of ${formats.join(
            ', '
          )}.`
        )
      )

      return ReturnCode.InvalidCommand
    }

    try {
      const config = mergeConfig(await readLogCheckConfig(), {
        failOn: failOn as string | undefined,
        maxWarnings: maxWarnings as number | undefined,
        ignoreCodes: toStringArray(ignoreCode),
        ignorePaths: toStringArray(ignorePath)
      })

      const summary = await processLogCheck({
        paths: toStringArray(paths),
        config
      })

      renderLogCheck(summary, config, {
        format: json ? 'json' : (format as OutputFormat),
        verbose: !!verbose
      })

      return summary.failure ? ReturnCode.LogCheckError : ReturnCode.Success
    } catch (error) {
      displayError(
        error as Error,
        'An error has occurred when checking SAS logs.'
      )

      return ReturnCode.InternalError
    }
  }
}

/**
 * yargs hands back an array for a repeatable option, and nothing at all when it
 * is not given, so every consumer gets a list.
 */
const toStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((item) => String(item)) : []

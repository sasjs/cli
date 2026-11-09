import { LogLevel, Logger } from '@sasjs/utils/logger'
import { loadProjectEnvVariables, setProjectDir } from './utils'
import {
  commandNames,
  parse,
  requestedCommandName
} from './types/command/parse'
import { printHelpText } from './commands/help/help'
import { ReturnCode } from './types/command'

/**
 * The line printed when the arguments name no command the CLI registers.
 *
 * Kept apart from the printing so it can be asserted without standing up a
 * logger, and so the two cases - a typo, and no argument at all - stay
 * distinguishable in a script's output.
 *
 * @param name - the command as typed, empty when none was given
 */
export const unknownCommandMessage = (name: string): string =>
  name
    ? `Invalid SASjs command: ${name}.`
    : 'No command given - here is what this CLI can do.'

/**
 * The registered command nearest to what was typed, when one is close enough to
 * be worth naming - so `sasjs lc` finds `logcheck` rather than only saying no.
 *
 * @param name - the command as typed
 * @returns the suggestion, or `undefined` when nothing is close
 */
export const closestCommand = (name: string): string | undefined => {
  const typed = name.toLowerCase()
  const names = commandNames()

  return names
    .map((candidate) => ({
      candidate,
      // A prefix is what the user was reaching for, so it outranks a short
      // edit distance: `logc` means `logcheck`, not `doc`.
      prefix: candidate.toLowerCase().startsWith(typed),
      distance: editDistance(typed, candidate.toLowerCase())
    }))
    .filter(({ prefix, distance }) => prefix || distance <= 2)
    .sort(
      (a, b) => Number(b.prefix) - Number(a.prefix) || a.distance - b.distance
    )[0]?.candidate
}

const editDistance = (a: string, b: string): number => {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i])

  for (let j = 1; j <= b.length; j++) rows[0][j] = j

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
  }

  return rows[a.length][b.length]
}

export async function cli(args: string[]) {
  await setProjectDir(args)
  await instantiateLogger()
  await loadProjectEnvVariables()

  const command = parse(args)

  if (!command) {
    // The root answers the question its own error raises. Telling a user to run
    // `sasjs help` for a list, and stopping there, made the one entry point
    // every session starts at the least informative command in the CLI - a
    // mis-invoked command at least printed its usage and examples.
    const name = requestedCommandName(args)

    process.logger?.error(unknownCommandMessage(name))

    if (!name) {
      await printHelpText()

      process.exit(ReturnCode.InvalidCommand)

      return
    }

    const suggestion = closestCommand(name)

    if (suggestion) {
      process.logger?.info(`Did you mean \`sasjs ${suggestion}\`?`)
    }

    process.logger?.info(`Commands: ${commandNames().sort().join(', ')}`)
    process.logger?.info(
      'Run `sasjs help` for the full text, or `sasjs <command> --help` for one command.'
    )

    process.exit(ReturnCode.InvalidCommand)

    return
  }

  const returnCode = await command.execute()

  process.exit(returnCode)
}

export async function instantiateLogger() {
  const logLevel = (process.env.LOG_LEVEL || LogLevel.Info) as LogLevel
  const logger = new Logger(logLevel)
  process.logger = logger
}

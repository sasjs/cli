import { getBaseCommand } from '../../utils/getBaseCommand'
import { CommandBase } from './commandBase'
import { commandFactory } from './commandFactory'

// `sasjs version`, `sasjs v`, `sasjs -v` and `sasjs --version` all mean the
// same thing. yargs reads a leading `-v`/`--version` as an option rather than
// a command, and its own version handling is switched off, so the token is
// rewritten to the command name before dispatch.
const versionFlags = ['-v', '--version']

/**
 * Rewrites a version flag in the command position to the `version` command.
 *
 * @param args - the process arguments, as `[node, sasjs, ...]`
 */
export const normaliseArgs = (args: string[]): string[] => {
  const [, , command] = args

  return versionFlags.includes(command)
    ? [...args.slice(0, 2), 'version', ...args.slice(3)]
    : args
}

/**
 * Resolves the arguments to the command that will run them.
 *
 * @param args - the process arguments, as `[node, sasjs, ...]`
 * @returns the command, or `undefined` when the arguments name no command the
 * CLI registers. Printing the help and choosing the exit code is the caller's
 * job, so this stays a pure lookup.
 */
export const parse = (args: string[]): CommandBase | undefined => {
  const commandArgs = normaliseArgs(args)
  const baseCommand = getBaseCommand(commandArgs)

  return commandFactory.has(baseCommand.name)
    ? commandFactory.get(baseCommand.name)!(commandArgs)
    : undefined
}

/**
 * The command name the arguments asked for, as typed - so a message can repeat
 * it back. Empty when no command was given at all.
 *
 * @param args - the process arguments, as `[node, sasjs, ...]`
 */
export const requestedCommandName = (args: string[]): string =>
  normaliseArgs(args)[2] ?? ''

/**
 * Every command the CLI registers, so a misspelling can be answered with the
 * list rather than a pointer to another command.
 */
export const commandNames = (): string[] => Array.from(commandFactory.keys())

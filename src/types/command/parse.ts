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
 * @param args - the process arguments, as `[node, sasjs, ...]`.
 */
export const normaliseArgs = (args: string[]): string[] => {
  const [, , command] = args

  return versionFlags.includes(command)
    ? [...args.slice(0, 2), 'version', ...args.slice(3)]
    : args
}

export const parse = (args: string[]): CommandBase => {
  const commandArgs = normaliseArgs(args)
  const baseCommand = getBaseCommand(commandArgs)

  if (!Array.from(commandFactory.keys()).includes(baseCommand.name)) {
    process.logger?.error(
      'Invalid SASjs command! Run `sasjs help` for a full list of available commands.'
    )

    process.exit(1)
  }

  return commandFactory.get(baseCommand.name)!(commandArgs)
}

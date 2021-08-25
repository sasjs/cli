import { getBaseCommand } from '../../utils/getBaseCommand'
import { CommandBase } from './commandBase'
import { commandFactory } from './commandFactory'

export const parse = (args: string[]): CommandBase => {
  const baseCommand = getBaseCommand(args)

  if (!Array.from(commandFactory.keys()).includes(baseCommand.name)) {
    process.logger?.error(
      'Invalid SASjs command! Run `sasjs help` for a full list of available commands.'
    )

    process.exit(1)
  }

  return commandFactory.get(baseCommand.name)!(args)
}

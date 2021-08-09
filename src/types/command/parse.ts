import { getBaseCommand } from '../../utils/getBaseCommand'
import { CommandBase } from './commandBase'
import { commandFactory } from './commandFactory'
import { unalias } from './unalias'

export const parse = (args: string[]): CommandBase => {
  const baseCommand = getBaseCommand(args)
  const key = `${unalias(baseCommand.name)}${
    baseCommand.subCommand ? ' ' + baseCommand.subCommand : ''
  }`

  if (!Array.from(commandFactory.keys()).includes(key)) {
    process.logger?.error(
      'Invalid SASjs command! Run `sasjs help` for a full list of available commands.'
    )

    process.exit(1)
  }

  return commandFactory.get(key)!(args)
}

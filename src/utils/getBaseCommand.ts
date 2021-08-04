import { CommandBase } from '../types'

export const getBaseCommand = (args: string[]): CommandBase => {
  return new CommandBase(
    args,
    {},
    [],
    '',
    { command: '', description: '' },
    false
  )
}

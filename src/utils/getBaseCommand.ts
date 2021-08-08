import { CommandBase } from '../types'
import { defaultCommandOptions } from '../types/command/commandBase'

export const getBaseCommand = (args: string[]): CommandBase => {
  return new CommandBase(args, { ...defaultCommandOptions, strict: false })
}

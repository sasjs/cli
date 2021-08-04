import { getProjectRoot } from './config'
import { getBaseCommand } from './getBaseCommand'

export const setProjectDir = async (args: string[]) => {
  const baseCommand = getBaseCommand(args)
  const nonProjectCommands = ['create', 'init']

  if (nonProjectCommands.includes(baseCommand.name)) {
    if (!process.projectDir) process.projectDir = process.cwd()
  } else {
    process.currentDir = process.cwd()
    if (!process.projectDir) {
      process.projectDir = process.cwd()

      const rootDir = await getProjectRoot()

      if (rootDir !== process.projectDir) {
        process.projectDir = rootDir
      }
    }
  }
}

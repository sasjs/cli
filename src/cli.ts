import { LogLevel, Logger } from '@sasjs/utils/logger'
import { loadProjectEnvVariables, setProjectDir, setConstants } from './utils'
import { parse } from './types/command/parse'

export async function cli(args: string[]) {
  await setProjectDir(args)
  await instantiateLogger()
  await setConstants()
  await loadProjectEnvVariables()

  const command = parse(args)
  const returnCode = await command.execute()
  process.exit(returnCode)
}

export async function instantiateLogger() {
  const logLevel = (process.env.LOG_LEVEL || LogLevel.Info) as LogLevel
  const logger = new Logger(logLevel)
  process.logger = logger
}

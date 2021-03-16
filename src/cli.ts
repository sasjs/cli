import {
  initSasjs,
  createFileStructure,
  doc,
  buildServices,
  deployServices,
  compileServices,
  compileBuildServices,
  compileBuildDeployServices,
  buildDBs,
  showHelp,
  showVersion,
  buildWebApp,
  add,
  run,
  runRequest,
  context,
  folderManagement,
  servicepack,
  jobManagement,
  flowManagement,
  ReturnCode
} from './main'
import { fileExists } from './utils/file'
import path from 'path'
import dotenv from 'dotenv'
import { Command, parseCommand } from './utils/command'
import { getProjectRoot } from './utils/config'
import { LogLevel, Logger } from '@sasjs/utils/logger'

export async function cli(args: string[]) {
  await loadEnvironmentVariables()
  await instantiateLogger()

  const parsedCommand = parseCommand(args)

  if (!parsedCommand) {
    handleInvalidCommand()
    return
  }

  const command = new Command(parsedCommand.parameters)

  switch (parsedCommand.name) {
    case 'create':
      if (!process.projectDir) process.projectDir = process.cwd()

      break
    case 'compile':
    case 'build':
    case 'db':
    case 'compilebuild':
    case 'compilebuilddeploy':
      process.currentDir = process.cwd()
    case 'deploy':
    case 'web':
    case 'doc':
    default:
      if (!process.projectDir) {
        process.projectDir = process.cwd()

        const rootDir = await getProjectRoot()

        if (rootDir !== process.projectDir) {
          process.projectDir = rootDir
        }
      }
  }

  let result: ReturnCode

  switch (parsedCommand.name) {
    case 'init': {
      result = await initSasjs()
      break
    }
    case 'create': {
      result = await createFileStructure(command)
      break
    }
    case 'doc': {
      result = await doc(command)
      break
    }
    case 'compile': {
      result = await compileServices(command)
      break
    }
    case 'build': {
      result = await buildServices(command)
      break
    }
    case 'deploy': {
      result = await deployServices(command)
      break
    }
    case 'servicepack': {
      result = await servicepack(command)
      break
    }
    case 'db': {
      result = await buildDBs()
      break
    }
    case 'compilebuild': {
      result = await compileBuildServices(command)
      break
    }
    case 'compilebuilddeploy': {
      result = await compileBuildDeployServices(command)
      break
    }
    case 'help': {
      result = await showHelp()
      break
    }
    case 'version': {
      result = await showVersion()
      break
    }
    case 'web': {
      result = await buildWebApp(command)
      break
    }
    case 'add': {
      result = await add(command)
      break
    }
    case 'run': {
      result = await run(command)
      break
    }
    case 'request': {
      result = await runRequest(command)
      break
    }
    case 'context': {
      result = await context(command)
      break
    }
    case 'folder': {
      result = await folderManagement(command)
      break
    }
    case 'job': {
      result = await jobManagement(command)
      break
    }
    case 'flow': {
      result = await flowManagement(command)
      break
    }
    default:
      handleInvalidCommand()
      result = ReturnCode.InvalidCommand
      break
  }

  process.exit(result)
}

function handleInvalidCommand() {
  process.logger?.error(
    'Invalid SASjs command! Run `sasjs help` for a full list of available commands.'
  )
  process.exit(1)
}

export async function instantiateLogger() {
  const logLevel = (process.env.LOG_LEVEL || LogLevel.Info) as LogLevel
  const logger = new Logger(logLevel)
  process.logger = logger
}

async function loadEnvironmentVariables() {
  const envFileExistsInCurrentPath = await fileExists(
    path.join(process.cwd(), '.env')
  )
  const envFileExistsInParentPath = await fileExists(
    path.join(process.cwd(), '..', '.env')
  )
  const envFilePath = envFileExistsInCurrentPath
    ? path.join(process.cwd(), '.env')
    : envFileExistsInParentPath
    ? path.join(process.cwd(), '..', '.env')
    : null
  if (envFilePath) {
    dotenv.config({ path: envFilePath })
  }
}

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
  auth,
  run,
  runRequest,
  context,
  folderManagement,
  servicepack,
  jobManagement,
  flowManagement,
  lint,
  ReturnCode,
  test
} from './main'
import { fileExists } from '@sasjs/utils'
import path from 'path'
import dotenv from 'dotenv'
import { Command, parseCommand } from './utils/command'
import { getProjectRoot } from './utils/config'
import { LogLevel, Logger } from '@sasjs/utils/logger'

export async function cli(args: string[]) {
  await loadProjectEnvVariables()
  await instantiateLogger()

  const parsedCommand = parseCommand(args)

  if (!parsedCommand) {
    handleInvalidCommand()

    return
  }

  const command = new Command(parsedCommand.parameters)

  const targetName = command.getFlagValue('target') as string
  await loadTargetEnvVariables(targetName)

  switch (parsedCommand.name) {
    case 'create':
      if (!process.projectDir) process.projectDir = process.cwd()

      break
    case 'compile':
    case 'build':
    case 'db':
    case 'compilebuild':
    case 'compilebuilddeploy':
    case 'deploy':
    case 'web':
    case 'doc':
    default:
      process.currentDir = process.cwd()
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
    case 'auth': {
      result = await auth(command)
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
    case 'lint': {
      result = await lint(command)
      break
    }
    case 'test': {
      result = await test(command)
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

async function loadProjectEnvVariables() {
  await loadEnvVariables('.env')
}

async function loadTargetEnvVariables(targetName: string) {
  await loadEnvVariables(`.env.${targetName}`)
}

async function loadEnvVariables(fileName: string) {
  const envFileExistsInCurrentPath = await fileExists(
    path.join(process.cwd(), fileName)
  )
  const envFileExistsInParentPath = await fileExists(
    path.join(process.cwd(), '..', fileName)
  )
  const envFilePath = envFileExistsInCurrentPath
    ? path.join(process.cwd(), fileName)
    : envFileExistsInParentPath
    ? path.join(process.cwd(), '..', fileName)
    : null
  if (envFilePath) {
    dotenv.config({ path: envFilePath })
  }
}

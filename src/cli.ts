import {
  createFileStructure,
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
  flowManagement
} from './main'
import { fileExists } from './utils/file'
import path from 'path'
import dotenv from 'dotenv'
import chalk from 'chalk'
import { Command, parseCommand } from './utils/command'
import { LogLevel, Logger } from '@sasjs/utils/logger'

export async function cli(args: string[]) {
  await loadEnvironmentVariables()
  const logLevel = (process.env.LOG_LEVEL || LogLevel.Error) as LogLevel
  const logger = new Logger(logLevel)

  const parsedCommand = parseCommand(args)
  if (!parsedCommand) {
    showInvalidCommandText()
    return
  }
  process.projectDir = path.join(process.cwd())
  switch (parsedCommand.name) {
    case 'compile':
    case 'build':
    case 'deploy':
    case 'db':
    case 'compilebuild':
    case 'compilebuilddeploy':
    case 'web':
      try {
        await checkProjectDirectory(logger)
      } catch (err) {
        logger.error('An error occurred', err)
        return
      }
      break
  }

  const command = new Command(parsedCommand.parameters)

  switch (parsedCommand.name) {
    case 'create': {
      await createFileStructure(command)
      break
    }
    case 'compile': {
      await compileServices(command)
      break
    }
    case 'build': {
      await buildServices(command)
      break
    }
    case 'deploy': {
      await deployServices(command)
      break
    }
    case 'servicepack': {
      await servicepack(command)
      break
    }
    case 'db': {
      await buildDBs()
      break
    }
    case 'compilebuild': {
      await compileBuildServices(command)
      break
    }
    case 'compilebuilddeploy': {
      await compileBuildDeployServices(command)
      break
    }
    case 'help': {
      await showHelp()
      break
    }
    case 'version': {
      await showVersion()
      break
    }
    case 'web': {
      await buildWebApp(command)
      break
    }
    case 'add': {
      await add(command)
      break
    }
    case 'run': {
      await run(command)
      break
    }
    case 'request': {
      await runRequest(command)

      break
    }
    case 'context': {
      await context(command)

      break
    }
    case 'folder': {
      await folderManagement(command)

      break
    }
    case 'job': {
      await jobManagement(command)

      break
    }
    case 'flow': {
      await flowManagement(command)

      break
    }
    default:
      showInvalidCommandText()

      break
  }
}

function showInvalidCommandText() {
  console.log(
    chalk.redBright.bold(
      'Invalid SASjs command! Run `sasjs help` for a full list of available commands.'
    )
  )
}

async function checkProjectDirectory(logger: Logger) {
  const buildSourceFolder = path.join(process.projectDir, 'sasjs')
  let newBSF = buildSourceFolder,
    found = false
  do {
    const pathExists = await fileExists(path.join(newBSF, 'sasjsconfig.json'))
    if (pathExists) {
      found = true
    } else {
      let strBreak = newBSF.split(path.sep)
      strBreak.splice(-1, 1)
      newBSF = strBreak.join(path.sep)
    }
  } while (newBSF.length && !found)
  if (found) {
    let strBreak = newBSF.split(path.sep)
    strBreak.splice(-1, 1)
    let newProDir = strBreak.join(path.sep)
    process.projectDir = newProDir
    logger.info(`Current project directory is: ${process.projectDir}`)
  } else {
    throw new Error(
      'Not a sasjs project directory OR sub-directory, please setup sasjs app first.'
    )
  }
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

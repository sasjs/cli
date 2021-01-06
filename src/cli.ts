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
  flowManagement,
  ReturnCode
} from './main'
import { fileExists } from './utils/file'
import path from 'path'
import dotenv from 'dotenv'
import { Command, parseCommand } from './utils/command'
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
    case 'compile':
    case 'build':
    case 'deploy':
    case 'db':
    case 'compilebuild':
    case 'compilebuilddeploy':
    case 'web':
      try {
        await checkAndSetProjectDirectory()
      } catch (err) {
        process.logger.error('An error occurred', err)
        return
      }
      break
    default:
      process.projectDir = process.cwd()
  }

  let result: ReturnCode

  switch (parsedCommand.name) {
    case 'create': {
      result = await createFileStructure(command)
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

export async function checkAndSetProjectDirectory() {
  const projectDir = process.projectDir
  if (
    !projectDir ||
    projectDir.trim() === 'null' ||
    projectDir.trim() === 'undefined'
  ) {
    process.projectDir = process.cwd()
  }
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
    process.logger?.info(`Current project directory is: ${process.projectDir}`)
  } else {
    throw new Error(
      `${process.projectDir} is not a SASjs project directory or sub-directory. Please set up your SASjs app first using \`sasjs create\`.\nYou can find more info on this and all other SASjs commands at https://cli.sasjs.io/.`
    )
  }
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

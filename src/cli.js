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
import chalk from 'chalk'

function parseCommand(rawArgs) {
  checkNodeVersion()

  const isWin = process.platform === 'win32'
  const isMSys = !!process.env.MSYSTEM
  const prefix = process.env.EXEPATH
    ? process.env.EXEPATH.replace(/\\/g, '/')
    : ''
  const homedir = require('os').homedir()

  const argsTemp =
    isWin && isMSys
      ? rawArgs.slice(2).map((arg) => arg.replace(prefix, ''))
      : rawArgs.slice(2)

  const args = argsTemp.map((arg) =>
    arg.replace('~', homedir.replace(/\\/g, '/'))
  )

  if (args.length) {
    const name = getUnaliasedCommand(args[0])

    return { name, parameters: args }
  }
  return null
}

function getUnaliasedCommand(command) {
  if (
    command === 'version' ||
    command === '--version' ||
    command === '-version' ||
    command === '-v' ||
    command === '--v' ||
    command === 'v'
  ) {
    return 'version'
  }

  if (
    command === 'help' ||
    command === '--help' ||
    command === '-help' ||
    command === '-h' ||
    command === '--h' ||
    command === 'h'
  ) {
    return 'help'
  }

  if (command === 'create') {
    return 'create'
  }

  if (command === 'compile' || command === 'c') {
    return 'compile'
  }

  if (command === 'build' || command === 'b') {
    return 'build'
  }

  if (command === 'deploy' || command === 'd') {
    return 'deploy'
  }

  if (command === 'servicepack') {
    return 'servicepack'
  }

  if (command === 'build-DB' || command === 'DB' || command === 'db') {
    return 'db'
  }

  if (command === 'compilebuild' || command === 'cb') {
    return 'compilebuild'
  }

  if (command === 'cbd') {
    return 'compilebuilddeploy'
  }
  if (command === 'web' || command === 'w') {
    return 'web'
  }

  if (command === 'add' || command === 'a') {
    return 'add'
  }

  if (command === 'run' || command === 'r') {
    return 'run'
  }

  if (command === 'request' || command === 'rq') {
    return 'request'
  }

  if (command === 'context') return 'context'

  if (command === 'folder') return 'folder'

  return command
}

function checkNodeVersion() {
  const nodeVersion = process.versions.node
  const majorVersion = parseInt(nodeVersion.substr(0, 2))
  if (majorVersion < 12) {
    console.log(
      chalk.redBright(
        'SASjs CLI requires at least NodeJS version 12. Please upgrade NodeJS and try again.'
      )
    )
    process.exit(1)
  }
}

export async function cli(args) {
  await loadEnvironmentVariables()
  const command = parseCommand(args)
  if (!command) {
    showInvalidCommandText()
    return
  }
  process.projectDir = path.join(process.cwd())
  switch (command.name) {
    case 'compile':
    case 'build':
    case 'deploy':
    case 'db':
    case 'compilebuild':
    case 'compilebuilddeploy':
    case 'web':
      try {
        await checkProjectDirectory()
      } catch (err) {
        console.log(chalk.redBright(err))
        return
      }
      break
  }
  switch (command.name) {
    case 'create': {
      await createFileStructure(command.parameters)
      break
    }
    case 'compile': {
      await compileServices(command.parameters)
      break
    }
    case 'build': {
      await buildServices(command.parameters)
      break
    }
    case 'deploy': {
      await deployServices(command.parameters)
      break
    }
    case 'servicepack': {
      await servicepack(command.parameters)
      break
    }
    case 'db': {
      await buildDBs()
      break
    }
    case 'compilebuild': {
      await compileBuildServices(command.parameters)
      break
    }
    case 'compilebuilddeploy': {
      await compileBuildDeployServices(command.parameters)
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
      await buildWebApp(command.parameters)
      break
    }
    case 'add': {
      await add(command.parameters)
      break
    }
    case 'run': {
      await run(command.parameters)
      break
    }
    case 'request': {
      await runRequest(command.parameters)

      break
    }
    case 'context': {
      await context(command.parameters)

      break
    }
    case 'folder': {
      await folderManagement(command.parameters)

      break
    }
    case 'job': {
      await jobManagement(command.parameters)

      break
    }
    case 'flow': {
      await flowManagement(command.parameters)

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

async function checkProjectDirectory() {
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
    console.log(
      chalk.cyanBright(
        `Project directory: ${chalk.cyanBright.italic(process.projectDir)}`
      )
    )
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
    require('dotenv').config({ path: envFilePath })
  }
}

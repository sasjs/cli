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
  listContexts,
  add,
  run
} from './main'
import { fileExists } from './utils/file-utils'
import path from 'path'
import chalk from 'chalk'
import { exit } from 'process'

function parseCommand(rawArgs) {
  checkNodeVersion()
  const args = rawArgs.slice(2)
  if (args.length) {
    const name = getUnaliasedCommand(args[0])
    if (name === 'run') {
      const parameters = processRunParameters(args.slice(1))
      return { name, parameters }
    }
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

  if (command === 'listcontexts' || command === 'lc') {
    return 'listcontexts'
  }

  if (command === 'add' || command === 'a') {
    return 'add'
  }

  if (command === 'run' || command === 'r') {
    return 'run'
  }

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
    case 'create':
      const { projectName, appType } = processCreateParameters(
        command.parameters
      )
      await createFileStructure(projectName, appType)
      break
    case 'compile':
      await compileServices(command.parameters[1])
      break
    case 'build':
      await buildServices(command.parameters[1])
      break
    case 'deploy':
      await deployServices(command.parameters[1])
      break
    case 'db':
      await buildDBs(command.parameters[1])
      break
    case 'compilebuild':
      await compileBuildServices(command.parameters[1])
      break
    case 'compilebuilddeploy':
      await compileBuildDeployServices(command.parameters[1])
      break
    case 'help':
      await showHelp()
      break
    case 'version':
      await showVersion()
      break
    case 'web':
      await buildWebApp(command.parameters[1])
      break
    case 'listcontexts':
      await listContexts(command.parameters[1])
      break
    case 'add':
      await add(command.parameters[1])
      break
    case 'run':
      const { filePath, targetName } = command.parameters
      await run(filePath, targetName)
      break
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
      let strBreak = newBSF.split('/')
      strBreak.splice(-1, 1)
      newBSF = strBreak.join('/')
    }
  } while (newBSF.length && !found)
  if (found) {
    let strBreak = newBSF.split('/')
    strBreak.splice(-1, 1)
    let newProDir = strBreak.join('/')
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

function processRunParameters(parameters) {
  if (!parameters) {
    throw new Error(
      'Invalid syntax.\nPlease use `sasjs run <path/to/file>` or `sasjs run <path/to/file> -t <targetName>`.'
    )
  }

  if (!parameters.length || parameters.length > 3) {
    throw new Error(
      'Invalid syntax.\nPlease use `sasjs run <path/to/file>` or `sasjs run <path/to/file> -t <targetName>`.'
    )
  }

  return {
    filePath: parameters[0],
    targetName: parameters.length === 3 ? parameters[2] : 'default'
  }
}

function invalidSyntax() {
  console.error(
    chalk.redBright(
      `Invalid usage.\nCorrect syntax is ${chalk.cyanBright(
        'sasjs create <app-name> -t <app-type>'
      )} or ${chalk.cyanBright(
        'sasjs create <app-name> --template <app-type>'
      )}.`
    )
  )
  exit(1)
}

function invalidAppType() {
  console.error(
    chalk.redBright(
      `Invalid web app type.\nSupported types are ${chalk.cyanBright(
        'angular'
      )}, ${chalk.cyanBright('react')} and ${chalk.cyanBright('minimal')}.`
    )
  )
  exit(1)
}

function processCreateParameters(parameters) {
  const supportedTypes = ['react', 'angular', 'minimal', 'sasonly']
  let params = { projectName: undefined, appType: undefined }
  switch (parameters.length) {
    case 1: // sasjs create
      break
    case 2: // sasjs create <app_name>
      params.projectName = parameters[1]
      break
    case 3: // sasjs create -t <type>
      if (parameters[1] === '-t' || parameters[1] === '--template')
        params.appType = parameters[2].trim()
      else invalidSyntax()
      if (!supportedTypes.includes(params.appType)) invalidAppType()
      break
    case 4: // sasjs create <app_name> -t <type>
      if (parameters[2] === '-t' || parameters[2] === '--template') {
        params.projectName = parameters[1]
        params.appType = parameters[3].trim()
      } else invalidSyntax()
      if (!supportedTypes.includes(params.appType)) invalidAppType()
      break
    default:
      invalidSyntax()
  }
  return params
}

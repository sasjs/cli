import {
  addTarget,
  build,
  processContext,
  create,
  buildDB,
  deploy,
  folder,
  printHelpText,
  processJob,
  runSasJob,
  runSasCode,
  processServicepack,
  printVersion,
  createWebAppServices
} from './commands'
import chalk from 'chalk'
import { displayResult } from './utils/displayResult'
import { Command } from './utils/command'

export async function createFileStructure(commandLine) {
  const command = new Command(commandLine)
  const template = command.getFlagValue('template')
  const parentFolderName = command.values.shift()

  let result

  await create(parentFolderName || '.', template)
    .then(() => {
      result = true

      displayResult(
        null,
        null,
        `Project ${
          parentFolderName ? `${parentFolderName} created` : `updated`
        } successfully.\nGet ready to Unleash your SAS!`
      )
    })
    .catch((err) => {
      result = err

      displayResult(err, 'An error has occurred whilst creating your project.')
    })

  return result
}

export async function showHelp() {
  await printHelpText()
}

export async function showVersion() {
  await printVersion()
}

export async function buildServices(commandLine) {
  const command = new Command(commandLine)
  let targetName = command.getFlagValue('target')

  if (!targetName) {
    targetName = command.getTargetWithoutFlag()
  }

  await build(targetName)
    .then(() =>
      displayResult(
        null,
        null,
        `Services have been successfully built!\nThe build output is located in the ${chalk.cyanBright(
          'sasjsbuild'
        )} directory.`
      )
    )
    .catch((err) => {
      displayResult(err, 'An error has occurred when building services.')
    })
}

export async function compileServices(targetName) {
  await build(targetName, true) // compileOnly is true
    .then(() =>
      displayResult(
        null,
        null,
        `Services have been successfully compiled!\nThe build output is located in the ${chalk.cyanBright(
          'sasjsbuild'
        )} directory.`
      )
    )
    .catch((err) => {
      displayResult(err, 'An error has occurred when building services.')
    })
}

export async function deployServices(commandLine) {
  const command = new Command(commandLine)
  let targetName = command.getFlagValue('target')

  if (!targetName) {
    targetName = command.getTargetWithoutFlag()
  }

  await deploy(targetName, null)
    .then(() =>
      displayResult(null, null, `Services have been successfully deployed!`)
    )
    .catch((err) => {
      if (err.hasOwnProperty('body')) {
        displayResult(err, 'An error has occurred when building services.')
      } else {
        displayResult(err, 'An error has occurred when deploying services.')
      }
    })
}

export async function compileBuildServices(targetName) {
  await build(targetName, null, true) // enforcing compile & build
    .then(() =>
      displayResult(
        null,
        null,
        `Services have been successfully compiled & built!\nThe build output is located in the ${chalk.cyanBright(
          'sasjsbuild'
        )} directory.`
      )
    )
    .catch((error) => {
      if (Array.isArray(error)) {
        const nodeModulesErrors = error.find((err) =>
          err.includes('node_modules/@sasjs/core')
        )

        if (nodeModulesErrors)
          displayResult(
            null,
            null,
            `Suggestion: @sasjs/core dependency is missing. Try running 'npm install @sasjs/core' command.`
          )
      } else {
        displayResult(error, 'An error has occurred when building services.')
      }
    })
}

export async function compileBuildDeployServices(commandLine) {
  const command = new Command(commandLine)
  const isForced = command.getFlagValue('force')
  let targetName = command.getFlagValue('target')

  if (!targetName) {
    targetName = command.getTargetWithoutFlag()
  }

  let result

  await build(targetName, null, null, true, isForced) // enforcing compile & build & deploy
    .then(() => {
      result = true

      displayResult(
        null,
        null,
        `Services have been successfully compiled & built!\nThe build output is located in the ${chalk.cyanBright(
          'sasjsbuild'
        )} directory.`
      )
    })
    .catch((err) => {
      result = err

      displayResult(err, 'An error has occurred when building services')
    })

  return result
}

export async function buildDBs() {
  let result = false
  await buildDB()
    .then(() => {
      result = true
      displayResult(
        null,
        null,
        `DB have been successfully built!\nThe build output is located in the ${chalk.cyanBright(
          'sasjsbuild/db'
        )} directory.`
      )
    })
    .catch((err) => {
      result = err
      displayResult(err, 'An error has occurred when building DBs.')
    })
  return result
}

export async function buildWebApp(commandLine) {
  await createWebAppServices(commandLine)
    .then(() =>
      displayResult(
        null,
        null,
        `Web app services have been successfully built!\nThe build output is located in the ${chalk.cyanBright(
          'sasjsbuild'
        )} directory.`
      )
    )
    .catch((err) => {
      displayResult(
        err,
        'An error has occurred when building web app services.'
      )
    })
}

export async function add(commandLine) {
  const command = new Command(commandLine)
  let result = false

  if (command && command.name === 'add') {
    await addTarget()
      .then(() => {
        displayResult(null, null, 'Target successfully added!')
        result = true
      })
      .catch((err) => {
        displayResult(err, 'An error has occurred when adding the target.')
        result = err
      })
  }

  return result
}

export async function run(commandLine) {
  await runSasCode(commandLine).catch((err) => {
    displayResult(err, 'An error has occurred when running your SAS code.')
  })
}

export async function runRequest(commandLine) {
  let result = false

  await runSasJob(commandLine)
    .then((res) => (result = res))
    .catch((err) => {
      result = err

      displayResult(err, 'An error has occurred when running your SAS job')
    })

  return result
}

export async function context(command) {
  if (!command)
    displayResult(null, `Please provide action for the 'context' command.`)

  await processContext(command).catch((err) =>
    displayResult(err, 'An error has occurred when processing context.')
  )
}

export async function servicepack(command) {
  if (!command)
    displayResult(null, `Please provide action for the 'servicepack' command.`)

  await processServicepack(command).catch((err) =>
    displayResult(err, 'An error has occurred when processing servicepack.')
  )
}

export async function folderManagement(command) {
  if (!command)
    displayResult(null, `Please provide action for the 'folder' command.`)

  await folder(command).catch((err) => {
    displayResult(
      err,
      'An error has occurred when processing folder operation.'
    )
  })
}

export async function jobManagement(command) {
  if (!command)
    displayResult(null, `Please provide action for the 'job' command.`)

  await processJob(command).catch((err) => {
    displayResult(err, 'An error has occurred when processing job operation.')
  })
}

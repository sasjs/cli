import {
  addCredential,
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
  createWebAppServices,
  processFlow
} from './commands'
import chalk from 'chalk'
import { displayResult } from './utils/displayResult'
import { Command } from './utils/command'
import { compile } from './commands/compile/compile'

export async function createFileStructure(commandLine: string | string[]) {
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
    .catch((err: any) => {
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

export async function buildServices(commandLine: string | string[]) {
  const command = new Command(commandLine)
  let targetName = command.getFlagValue('target')

  if (!targetName) {
    targetName = command.getTargetWithoutFlag()
  }

  let result
  await build(targetName)
    .then(() => {
      result = true

      displayResult(
        null,
        null,
        `Services have been successfully built!\nThe build output is located in the ${chalk.cyanBright(
          'sasjsbuild'
        )} directory.`
      )
    })
    .catch((err) => {
      result = err

      displayResult(err, 'An error has occurred when building services.')
    })
  return result
}

export async function compileServices(commandLine: string | string[]) {
  const command = new Command(commandLine)
  let targetName = command.getFlagValue('target')

  if (!targetName) {
    targetName = command.getTargetWithoutFlag()
  }

  let result
  await compile(targetName)
    .then(() => {
      result = true
      displayResult(
        null,
        null,
        `Services have been successfully compiled!\nThe build output is located in the ${chalk.cyanBright(
          'sasjsbuild'
        )} directory.`
      )
    })
    .catch((err) => {
      result = err
      displayResult(err, 'An error has occurred when building services.')
    })
  return result
}

export async function deployServices(commandLine: string | string[]) {
  const command = new Command(commandLine)
  let targetName = command.getFlagValue('target')

  if (!targetName) {
    targetName = command.getTargetWithoutFlag()
  }

  await deploy(targetName)
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

export async function compileBuildServices(commandLine: string | string[]) {
  const command = new Command(commandLine)
  let targetName = command.getFlagValue('target')

  if (!targetName) {
    targetName = command.getTargetWithoutFlag()
  }

  let result
  await compileServices(commandLine)
  await build(targetName)
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
    .catch((error) => {
      result = error
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
  return result
}

export async function compileBuildDeployServices(
  commandLine: string | string[]
) {
  const command = new Command(commandLine)
  let targetName = command.getFlagValue('target')

  if (!targetName) {
    targetName = command.getTargetWithoutFlag()
  }

  let result

  await build(targetName) // enforcing compile & build & deploy
  await deployServices(commandLine)
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

export async function buildWebApp(commandLine: string | string[]) {
  const command = new Command(commandLine)
  let targetName: string = command.getFlagValue('target')

  if (!targetName) {
    targetName = command.getTargetWithoutFlag()
  }

  await createWebAppServices(targetName)
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

export async function add(commandLine: string | string[]) {
  const command = new Command(commandLine)
  const subCommand = command.getSubCommand()
  let targetName = command.getFlagValue('target')

  if (!targetName) {
    targetName = command.getTargetWithoutFlag()
  }

  let result = false

  if (command && command.name === 'add') {
    if (subCommand === 'cred') {
      await addCredential(targetName)
        .then(() => {
          console.log(chalk.greenBright('Credential successfully added!'))
          result = true
        })
        .catch((err) => {
          console.log(err)
          displayResult(
            err,
            'An error has occurred when adding the credential.'
          )
          result = err
        })
    } else if (subCommand === 'target' || !subCommand) {
      await addTarget()
        .then(() => {
          console.log(chalk.greenBright('Target successfully added!'))
          result = true
        })
        .catch((err) => {
          displayResult(err, 'An error has occurred when adding the target.')
          result = err
        })
    }
  }

  return result
}

export async function run(commandLine: string | string[]) {
  await runSasCode(commandLine).catch((err) => {
    displayResult(err, 'An error has occurred when running your SAS code.')
  })
}

export async function runRequest(commandLine: string | string[]) {
  let result: any = false

  await runSasJob(commandLine)
    .then((res) => (result = res))
    .catch((err) => {
      result = err

      displayResult(err, 'An error has occurred when running your SAS job')
    })

  return result
}

export async function context(commandLine: string | string[]) {
  if (!commandLine)
    displayResult(null, `Please provide action for the 'context' command.`)

  await processContext(commandLine).catch((err) =>
    displayResult(err, 'An error has occurred when processing context.')
  )
}

export async function servicepack(commandLine: string | string[]) {
  if (!commandLine)
    displayResult(null, `Please provide action for the 'servicepack' command.`)

  await processServicepack(commandLine).catch((err) =>
    displayResult(err, 'An error has occurred when processing servicepack.')
  )
}

export async function folderManagement(commandLine: string | string[]) {
  if (!commandLine)
    displayResult(null, `Please provide action for the 'folder' command.`)

  await folder(commandLine).catch((err) => {
    displayResult(
      err,
      'An error has occurred when processing folder operation.'
    )
  })
}

export async function jobManagement(commandLine: string | string[]) {
  if (!commandLine)
    displayResult(null, `Please provide action for the 'job' command.`)

  await processJob(commandLine).catch((err) => {
    displayResult(err, 'An error has occurred when processing job operation.')
  })
}

export async function flowManagement(commandLine: string | string[]) {
  if (!commandLine)
    console.log(
      chalk.redBright(`Please provide action for the 'flow' command.`)
    )

  await processFlow(commandLine).catch((err) => {
    console.log(
      chalk.redBright(
        'An error has occurred when processing flow operation.',
        err
      )
    )
  })
}

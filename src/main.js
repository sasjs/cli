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

export async function createFileStructure(commandLine) {
  const command = new Command(commandLine)
  const template = command.getFlagValue('template')
  const parentFolderName = command.values.shift()

  let result

  await create(parentFolderName || '.', template)
    .then(() => {
      result = true

      console.log(
        chalk.greenBright.bold.italic(
          `Project ${
            parentFolderName ? `${parentFolderName} created` : `updated`
          } successfully.\nGet ready to Unleash your SAS!`
        )
      )
    })
    .catch((err) => {
      result = err

      console.log(
        chalk.redBright(
          'An error has occurred whilst creating your project.',
          err
        )
      )
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

  let result
  await build(targetName)
    .then(() => {
      result = true
      console.log(
        chalk.greenBright.bold.italic(
          `Services have been successfully built!\nThe build output is located in the ${chalk.cyanBright(
            'sasjsbuild'
          )} directory.`
        )
      )
    })
    .catch((err) => {
      result = err
      if (err.hasOwnProperty('body')) {
        const body = JSON.parse(err.body)
        const message = body.message || ''
        const details = body.details || ''

        console.log(
          chalk.redBright(
            'An error has occurred when building services.',
            `${message}${details ? '\n' + details : ''}`
          )
        )
      } else {
        console.log(
          chalk.redBright('An error has occurred when building services.', err)
        )
      }
    })
  return result
}

export async function compileServices(targetName) {
  await build(targetName, true) // compileOnly is true
    .then(() =>
      console.log(
        chalk.greenBright.bold.italic(
          `Services have been successfully compiled!\nThe build output is located in the ${chalk.cyanBright(
            'sasjsbuild'
          )} directory.`
        )
      )
    )
    .catch((err) => {
      if (err.hasOwnProperty('body')) {
        const body = JSON.parse(err.body)
        const message = body.message || ''
        const details = body.details || ''

        console.log(
          chalk.redBright(
            'An error has occurred when compiling services.',
            `${message}${details ? '\n' + details : ''}`
          )
        )
      } else {
        console.log(
          chalk.redBright('An error has occurred when compiling services.', err)
        )
      }
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
      console.log(
        chalk.greenBright.bold.italic(
          `Services have been successfully deployed!\n`
        )
      )
    )
    .catch((err) => {
      if (err.hasOwnProperty('body')) {
        const body = JSON.parse(err.body)
        const message = body.message || ''
        const status = err.status
        const details = body.details || ''

        console.log(
          chalk.redBright(
            'An error has occurred when deploying services.',
            `${message}
            ${details ? '\n' + details : ''}`
          )
        )
      } else {
        console.log(
          chalk.redBright('An error has occurred when deploying services.', err)
        )
      }
    })
}

export async function compileBuildServices(targetName) {
  await build(targetName, null, true) // enforcing compile & build
    .then(() =>
      console.log(
        chalk.greenBright.bold.italic(
          `Services have been successfully compiled & built!\nThe build output is located in the ${chalk.cyanBright(
            'sasjsbuild'
          )} directory.`
        )
      )
    )
    .catch((error) => {
      if (Array.isArray(error)) {
        const nodeModulesErrors = error.find((err) =>
          err.includes('node_modules/@sasjs/core')
        )

        if (nodeModulesErrors)
          console.log(
            chalk.yellowBright(
              `Suggestion: @sasjs/core dependency is missing. Try running 'npm install @sasjs/core' command.`
            )
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

      console.log(
        chalk.greenBright.bold.italic(
          `Services have been successfully compiled & built!\nThe build output is located in the ${chalk.cyanBright(
            'sasjsbuild'
          )} directory.`
        )
      )
    })
    .catch((err) => {
      result = err

      if (err.hasOwnProperty('body')) {
        const body = JSON.parse(err.body)
        const message = body.message || ''
        const status = err.status
        const details = body.details || ''

        console.log(
          chalk.redBright(
            'An error has occurred when building services.',
            `${message}${details ? '\n' + details : ''}`
          )
        )
      } else {
        console.log(
          chalk.redBright('An error has occurred when building services.', err)
        )
      }
    })

  return result
}

export async function buildDBs() {
  let result = false
  await buildDB()
    .then(() => {
      result = true
      console.log(
        chalk.greenBright.bold.italic(
          `DB have been successfully built!\nThe build output is located in the ${chalk.cyanBright(
            'sasjsbuild/db'
          )} directory.`
        )
      )
    })
    .catch((err) => {
      result = err
      console.log(
        chalk.redBright('An error has occurred when building DBs.', err)
      )
    })
  return result
}

export async function buildWebApp(commandLine) {
  await createWebAppServices(commandLine)
    .then(() =>
      console.log(
        chalk.greenBright.bold.italic(
          `Web app services have been successfully built!\nThe build output is located in the ${chalk.cyanBright(
            'sasjsbuild'
          )} directory.`
        )
      )
    )
    .catch((err) => {
      console.log(
        chalk.redBright(
          'An error has occurred when building web app services.',
          err
        )
      )
    })
}

export async function add(commandLine) {
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

export async function run(commandLine) {
  await runSasCode(commandLine).catch((err) => {
    console.log(
      chalk.redBright('An error has occurred when running your SAS code.', err)
    )
  })
}

export async function runRequest(commandLine) {
  let result = false

  await runSasJob(commandLine)
    .then((res) => (result = res))
    .catch((err) => {
      result = err
      console.log(
        chalk.redBright('An error has occurred when running your SAS job', err)
      )
    })

  return result
}

export async function context(command) {
  if (!command)
    console.log(
      chalk.redBright(`Please provide action for the 'context' command.`)
    )

  await processContext(command).catch((err) =>
    console.log(
      chalk.redBright('An error has occurred when processing context.', err)
    )
  )
}

export async function servicepack(command) {
  if (!command)
    console.log(
      chalk.redBright(`Please provide action for the 'servicepack' command.`)
    )

  await processServicepack(command).catch((err) =>
    console.log(
      chalk.redBright('An error has occurred when processing servicepack.', err)
    )
  )
}

export async function folderManagement(command) {
  if (!command)
    console.log(
      chalk.redBright(`Please provide action for the 'folder' command.`)
    )

  await folder(command).catch((err) => {
    console.log(
      chalk.redBright(
        'An error has occurred when processing folder operation.',
        err
      )
    )
  })
}

export async function jobManagement(command) {
  if (!command)
    console.log(chalk.redBright(`Please provide action for the 'job' command.`))

  await processJob(command).catch((err) => {
    console.log(
      chalk.redBright(
        'An error has occurred when processing job operation.',
        err
      )
    )
  })
}

export async function flowManagement(command) {
  if (!command)
    console.log(
      chalk.redBright(`Please provide action for the 'flow' command.`)
    )

  await processFlow(command).catch((err) => {
    console.log(
      chalk.redBright(
        'An error has occurred when processing flow operation.',
        err
      )
    )
  })
}

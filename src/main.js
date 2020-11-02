import { build } from './sasjs-build'
import { deploy } from './sasjs-deploy'
import { processServicepack } from './sasjs-servicepack'
import { buildDB } from './sasjs-db'
import { create } from './sasjs-create'
import { printHelpText } from './sasjs-help'
import { printVersion } from './sasjs-version'
import { createWebAppServices } from './sasjs-web'
import { addTarget } from './sasjs-add'
import { runSasCode } from './sasjs-run'
import { runSasJob } from './sasjs-request'
import { processContext } from './sasjs-context'
import { folder } from './sasjs-folder'
import { processJob } from './sasjs-job'
import chalk from 'chalk'
import { displayResult } from './utils/displayResult'

export async function createFileStructure(parentFolderName, appType) {
  let result
  await create(parentFolderName, appType)
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

export async function buildServices(targetName) {
  await build(targetName)
    .then(() =>
      console.log(
        chalk.greenBright.bold.italic(
          `Services have been successfully built!\nThe build output is located in the ${chalk.cyanBright(
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
}

export async function deployServices(targetName, isForced) {
  await deploy(targetName, null, isForced)
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
            'An error has occurred when building services.',
            `${message}${
              status === 409
                ? '\nIf you still want to deploy, use force flag (-f) after target name.'
                : ''
            }${details ? '\n' + details : ''}`
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
    .catch((err) => {
      const body = JSON.parse(err.body)
      const message = body.message || ''

      console.log(
        chalk.redBright(
          'An error has occurred when building services.',
          message
        )
      )
    })
}

export async function compileBuildDeployServices(commandLine) {
  commandLine.shift()

  const indexOfForceFlag = commandLine.indexOf('-f')

  if (indexOfForceFlag !== -1) commandLine.splice(indexOfForceFlag, 1)

  const targetName = commandLine.join('')

  let result

  await build(targetName, null, null, true, indexOfForceFlag !== -1) // enforcing compile & build & deploy
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
            `${message}${
              status === 409
                ? '\nIf you still want to deploy, use force flag (-f) after target name.'
                : ''
            }${details ? '\n' + details : ''}`
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

export async function buildWebApp(targetName) {
  await createWebAppServices(targetName)
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

export async function add(resourceType = 'target') {
  let result = false
  if (resourceType === 'target') {
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
  return result
}

export async function run(filePath, targetName) {
  await runSasCode(filePath, targetName).catch((err) => {
    console.log(
      chalk.redBright('An error has occurred when running your SAS code.', err)
    )
  })
}

export async function runRequest(
  sasJobLocation,
  dataFilePath,
  configFilePath,
  targetName
) {
  let result = true
  await runSasJob(
    sasJobLocation,
    dataFilePath,
    configFilePath,
    targetName
  ).catch((err) => {
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

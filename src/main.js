import { build } from './sasjs-build'
import { deploy } from './sasjs-deploy'
import { buildDB } from './sasjs-db'
import { create } from './sasjs-create'
import { printHelpText } from './sasjs-help'
import { printVersion } from './sasjs-version'
import { createWebAppServices } from './sasjs-web'
import { addTarget } from './sasjs-add'
import { getContexts } from './sasjs-listcontexts'
import { runSasCode } from './sasjs-run'
import chalk from 'chalk'

export async function createFileStructure(parentFolderName, appType) {
  await create(parentFolderName, appType)
    .then(() =>
      console.log(
        chalk.greenBright.bold.italic(
          `Project ${
            parentFolderName ? `${parentFolderName} created` : `updated`
          } successfully.\nGet ready to Unleash your SAS!`
        )
      )
    )
    .catch((err) => {
      console.log(
        chalk.redBright(
          'An error has occurred whilst creating your project.',
          err
        )
      )
    })
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
      console.log(
        chalk.redBright('An error has occurred when building services.', err)
      )
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
      console.log(
        chalk.redBright('An error has occurred when building services.', err)
      )
    })
}

export async function deployServices(targetName) {
  await deploy(targetName)
    .then(() =>
      console.log(
        chalk.greenBright.bold.italic(
          `Services have been successfully deployed!\n`
        )
      )
    )
    .catch((err) => {
      console.log(
        chalk.redBright('An error has occurred when deploying services.', err)
      )
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
      console.log(
        chalk.redBright('An error has occurred when building services.', err)
      )
    })
}

export async function compileBuildDeployServices(targetName) {
  await build(targetName, null, null, true) // enforcing compile & build & deploy
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
      console.log(
        chalk.redBright('An error has occurred when building services.', err)
      )
    })
}

export async function buildDBs(targetName) {
  await buildDB(targetName)
    .then(() =>
      console.log(
        chalk.greenBright.bold.italic(
          `DB have been successfully built!\nThe build output is located in the ${chalk.cyanBright(
            'sasjsbuild/db'
          )} directory.`
        )
      )
    )
    .catch((err) => {
      console.log(
        chalk.redBright('An error has occurred when building DBs.', err)
      )
    })
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

export async function listContexts(targetName) {
  await getContexts(targetName)
    .then(([accessibleContexts, inaccessibleContexts]) => {
      if (accessibleContexts.length) {
        console.log(
          chalk.cyanBright.bold(
            'You have execution access to the following contexts:\n'
          )
        )
        console.log(accessibleContexts)
      } else {
        console.log(
          chalk.redBright.bold(
            'You do not have access to any compute contexts on this server.'
          )
        )
      }
      if (inaccessibleContexts.length) {
        console.log(
          chalk.cyanBright.bold(
            'You do not have execution access to the following contexts:\n'
          )
        )
        console.log(inaccessibleContexts)
      } else {
        if (accessibleContexts.length) {
          console.log(
            chalk.greenBright.bold(
              'You have access to all the compute contexts on this server.'
            )
          )
        }
      }
    })
    .catch((err) => {
      console.log(
        chalk.redBright(
          'An error has occurred when fetching compute contexts.',
          err
        )
      )
    })
}

export async function add(resourceType = 'target') {
  if (resourceType === 'target') {
    await addTarget()
      .then(() => {
        console.log(chalk.greenBright('Target successfully added!'))
      })
      .catch((err) => {
        console.log(
          chalk.redBright('An error has occurred when adding the target.', err)
        )
      })
  }
}

export async function run(filePath, targetName) {
  await runSasCode(filePath, targetName).catch((err) => {
    console.log(
      chalk.redBright('An error has occurred when running your SAS code', err)
    )
  })
}

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
  processFlow,
  generateDocs,
  generateDot,
  initDocs
} from './commands'
import { displayError, displaySuccess } from './utils/displayResult'
import { Command } from './utils/command'
import { compile } from './commands/compile/compile'
import { getConstants } from './constants'
import { findTargetInConfiguration } from './utils/config'
import { Target } from '@sasjs/utils/types'

export enum ReturnCode {
  Success,
  InvalidCommand,
  InternalError
}

export async function createFileStructure(command: Command) {
  const template = command.getFlagValue('template') as string
  const parentFolderName = command.values.shift()

  return await create(parentFolderName || '.', template)
    .then(() => {
      displaySuccess(
        `Project ${
          parentFolderName ? `${parentFolderName} created` : `updated`
        } successfully.\nGet ready to Unleash your SAS!`
      )
      return ReturnCode.Success
    })
    .catch((err: any) => {
      displayError(err, 'An error has occurred whilst creating your project.')
      return ReturnCode.InternalError
    })
}
export async function doc(command: Command) {
  const subCommand = command.getSubCommand()

  if (subCommand === 'init') {
    return await initDocs()
      .then(() => {
        displaySuccess(
          'The doxygen configuration files have been initialised under `/sasjs/doxy/`. You can now run sasjs doc.'
        )
        return ReturnCode.Success
      })
      .catch((err: any) => {
        displayError(err, 'An error has occurred whilst initiating docs.')
        return ReturnCode.InternalError
      })
  }

  const targetName = command.getFlagValue('target') as string
  const outDirectory = command.getFlagValue('outDirectory') as string

  if (subCommand === 'lineage') {
    return await generateDot(targetName, outDirectory)
      .then((res) => {
        displaySuccess(
          `Dot files have been generated!\nFiles are located at ${res.outDirectory}' directory.`
        )
        return ReturnCode.Success
      })
      .catch((err: any) => {
        displayError(err, 'An error has occurred whilst initiating docs.')
        return ReturnCode.InternalError
      })
  }

  return await generateDocs(targetName, outDirectory)
    .then((res) => {
      displaySuccess(
        `Docs have been generated!\nThe docs are located at ${res.outDirectory}' directory.`
      )
      return ReturnCode.Success
    })
    .catch((err: any) => {
      displayError(err, 'An error has occurred whilst generating docs.')
      return ReturnCode.InternalError
    })
}

export async function showHelp() {
  await printHelpText()
  return ReturnCode.Success
}

export async function showVersion() {
  await printVersion()
  return ReturnCode.Success
}

export async function compileServices(command: Command) {
  let targetName = command.getFlagValue('target') as string

  if (!targetName) {
    targetName = command.getTargetWithoutFlag() as string
  }

  const { target } = await findTargetInConfiguration(targetName)

  return await executeCompile(target)
}

export async function buildServices(command: Command) {
  let targetName = command.getFlagValue('target') as string

  if (!targetName) {
    targetName = command.getTargetWithoutFlag() as string
  }

  const { target } = await findTargetInConfiguration(targetName)

  return await executeBuild(target)
}

export async function deployServices(command: Command) {
  let targetName = command.getFlagValue('target') as string

  if (!targetName) {
    targetName = command.getTargetWithoutFlag() as string
  }

  const { target, isLocal } = await findTargetInConfiguration(targetName)

  return await executeDeploy(target, isLocal)
}

export async function compileBuildServices(command: Command) {
  let targetName = command.getFlagValue('target') as string

  if (!targetName) {
    targetName = command.getTargetWithoutFlag() as string
  }

  const { target } = await findTargetInConfiguration(targetName)

  return await executeCompile(target).then(async (returnCode) => {
    if (returnCode === ReturnCode.Success) {
      return await executeBuild(target)
    } else {
      return ReturnCode.InternalError
    }
  })
}

export async function compileBuildDeployServices(command: Command) {
  let targetName = command.getFlagValue('target') as string

  if (!targetName) {
    targetName = command.getTargetWithoutFlag() as string
  }

  const { target, isLocal } = await findTargetInConfiguration(targetName)

  return await executeCompile(target)
    .then(async (returnCode) => {
      if (returnCode === ReturnCode.Success) {
        return await executeBuild(target)
      } else {
        displayError(
          null,
          'There was an error executing the compile step of this `cbd` command.'
        )
        return ReturnCode.InternalError
      }
    })
    .then(async (returnCode) => {
      if (returnCode === ReturnCode.Success) {
        return await executeDeploy(target, isLocal)
      } else {
        displayError(
          null,
          'There was an error executing the build step of this `cbd` command.'
        )
        return ReturnCode.InternalError
      }
    })
}

export async function buildDBs() {
  return await buildDB()
    .then(() => {
      const { buildDestinationDbFolder } = getConstants()
      displaySuccess(
        `DBs been successfully built!\nThe build output is located in the ${buildDestinationDbFolder} directory.`
      )
      return ReturnCode.Success
    })
    .catch((err) => {
      displayError(err, 'An error has occurred when building DBs.')
      return ReturnCode.InternalError
    })
}

export async function buildWebApp(command: Command) {
  let targetName: string = command.getFlagValue('target') as string

  if (!targetName) {
    targetName = command.getTargetWithoutFlag() as string
  }

  const { target } = await findTargetInConfiguration(targetName)

  return await createWebAppServices(target)
    .then(() => {
      const { buildDestinationFolder } = getConstants()
      displaySuccess(
        `Web app services have been successfully built!\nThe build output is located in the ${buildDestinationFolder} directory.`
      )
      return ReturnCode.Success
    })
    .catch((err) => {
      displayError(err, 'An error has occurred when building web app services.')
      return ReturnCode.InternalError
    })
}

export async function add(command: Command) {
  const subCommand = command.getSubCommand()
  let targetName = command.getFlagValue('target') as string
  const insecure = !!command.getFlag('insecure')

  if (!targetName) {
    targetName = command.getTargetWithoutFlag() as string
  }

  if (command && command.name === 'add') {
    if (subCommand === 'cred') {
      return await addCredential(targetName, insecure)
        .then(() => {
          displaySuccess('Credential has been successfully added!')
          return ReturnCode.Success
        })
        .catch((err) => {
          displayError(err, 'An error has occurred when adding the credential.')
          return ReturnCode.InternalError
        })
    } else if (subCommand === 'target' || !subCommand) {
      return await addTarget()
        .then(() => {
          displaySuccess('Target has been successfully added!')
          return ReturnCode.Success
        })
        .catch((err) => {
          displayError(err, 'An error has occurred when adding the target.')
          return ReturnCode.InternalError
        })
    } else {
      displayError(
        null,
        'Invalid add command: supported sub-commands are - target, cred.'
      )
      return ReturnCode.InvalidCommand
    }
  } else {
    displayError(
      null,
      'Invalid command: supported commands are - sasjs add target, sasjs add cred.'
    )
    return ReturnCode.InvalidCommand
  }
}

export async function run(command: Command) {
  return await runSasCode(command)
    .then(() => {
      return ReturnCode.Success
    })
    .catch((err) => {
      displayError(err, 'An error has occurred when running your SAS code.')
      return ReturnCode.InternalError
    })
}

export async function runRequest(command: Command) {
  return await runSasJob(command)
    .then(() => {
      return ReturnCode.Success
    })
    .catch((err) => {
      displayError(err, 'An error has occurred when running your SAS job')
      return ReturnCode.InternalError
    })
}

export async function context(command: Command) {
  if (!command) {
    displayError(null, `Please provide action for the 'context' command.`)
    return ReturnCode.InvalidCommand
  }

  return await processContext(command)
    .then(() => {
      return ReturnCode.Success
    })
    .catch((err) => {
      displayError(err, 'An error has occurred when processing context.')
      return ReturnCode.InternalError
    })
}

export async function servicepack(command: Command) {
  if (!command) {
    displayError(null, `Please provide action for the 'servicepack' command.`)
    return ReturnCode.InvalidCommand
  }

  return await processServicepack(command)
    .then(() => {
      return ReturnCode.Success
    })
    .catch((err) => {
      displayError(err, 'An error has occurred when processing servicepack.')
      return ReturnCode.InternalError
    })
}

export async function folderManagement(command: Command) {
  if (!command) {
    displayError(null, `Please provide action for the 'folder' command.`)
    return ReturnCode.InvalidCommand
  }

  return await folder(command)
    .then(() => {
      return ReturnCode.Success
    })
    .catch((err) => {
      displayError(
        err,
        'An error has occurred when processing folder operation.'
      )
      return ReturnCode.InternalError
    })
}

export async function jobManagement(command: Command) {
  if (!command) {
    displayError(null, `Please provide action for the 'job' command.`)
    return ReturnCode.InvalidCommand
  }

  return await processJob(command)
    .then(() => {
      return ReturnCode.Success
    })
    .catch((err) => {
      displayError(err, 'An error has occurred when processing job operation.')
      return ReturnCode.InternalError
    })
}

export async function flowManagement(command: Command) {
  if (!command) {
    displayError(`Please provide action for the 'flow' command.`)
    return ReturnCode.InvalidCommand
  }

  return await processFlow(command)
    .then(() => {
      return ReturnCode.Success
    })
    .catch((err) => {
      displayError('An error has occurred when processing flow operation.', err)
      return ReturnCode.InternalError
    })
}

async function executeCompile(target: Target) {
  return await compile(target, true)
    .then(() => {
      displaySuccess(
        `Services have been successfully compiled!\nThe build output is located in the 'sasjsbuild' directory.`
      )
      return ReturnCode.Success
    })
    .catch((err) => {
      displayError(err, 'An error has occurred when compiling services.')
      return ReturnCode.InternalError
    })
}

async function executeBuild(target: Target) {
  return await build(target)
    .then(() => {
      const { buildDestinationFolder } = getConstants()
      displaySuccess(
        `Services have been successfully built!\nThe build output is located in the ${buildDestinationFolder} directory.`
      )
      return ReturnCode.Success
    })
    .catch((error) => {
      if (Array.isArray(error)) {
        const nodeModulesErrors = error.find((err) =>
          err.includes('node_modules/@sasjs/core')
        )

        if (nodeModulesErrors)
          process.logger.info(
            `Suggestion: @sasjs/core dependency is missing. Try running 'npm install @sasjs/core' command.`
          )
      } else {
        displayError(error, 'An error has occurred when building services.')
      }
      return ReturnCode.InternalError
    })
}

async function executeDeploy(target: Target, isLocal: boolean) {
  return await deploy(target, isLocal)
    .then(() => {
      return ReturnCode.Success
    })
    .catch((err) => {
      displayError(err, 'An error has occurred when deploying services.')
      return ReturnCode.InternalError
    })
}

import {
  addCredential,
  addTarget,
  compile,
  compileSingleFile,
  build,
  init,
  create,
  buildDB,
  deploy,
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
  initDocs,
  processLint,
  runTest,
  initLint
} from './commands'
import { displayError, displaySuccess } from './utils/displayResult'
import { Command } from './utils/command'

import { findTargetInConfiguration } from './utils/config'
import { Target } from '@sasjs/utils/types'
import { lintFix } from './commands/lint/processLint'
import { ReturnCode } from './types/command'

export async function initSasjs() {
  return await init()
    .then(() => {
      displaySuccess(
        'This project is powered by SASjs. You can now use any sasjs command within the project. For more information, type "sasjs help" or visit https://cli.sasjs.io/'
      )
      return ReturnCode.Success
    })
    .catch((err: any) => {
      displayError(err, 'An error has occurred whilst initiating sasjs init.')
      return ReturnCode.InternalError
    })
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
      displayError(err, 'An error has occurred while creating your project.')
      return ReturnCode.InternalError
    })
}

export async function doc(command: Command) {
  const subCommand = command.getSubCommand()

  if (subCommand === 'init') {
    return await initDocs()
      .then(() => {
        displaySuccess(
          'The doxygen configuration files have been initialised under `/sasjs/doxy/`. You can now run `sasjs doc`.'
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

  // if (subCommand === 'lineage') {
  //   return await generateDot(targetName, outDirectory)
  //     .then((res) => {
  //       displaySuccess(
  //         `Dot files have been generated!\nFiles are located in the ${res.outDirectory}' directory.`
  //       )
  //       return ReturnCode.Success
  //     })
  //     .catch((err: any) => {
  //       displayError(err, 'An error has occurred whilst initiating docs.')
  //       return ReturnCode.InternalError
  //     })
  // }

  // return await generateDocs(targetName, outDirectory)
  //   .then((res) => {
  //     displaySuccess(
  //       `Docs have been generated!\nThe docs are located in the ${res.outDirectory}' directory.\nClick to open: ${res.outDirectory}/index.html`
  //     )
  //     return ReturnCode.Success
  //   })
  //   .catch((err: any) => {
  //     displayError(err, 'An error has occurred while generating docs.')
  //     return ReturnCode.InternalError
  //   })
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
  const subCommand = command.getSubCommand()
  let targetName = command.getFlagValue('target') as string

  if (!targetName) {
    targetName = command.getTargetWithoutFlag() as string
  }

  let target: Target = {} as Target
  try {
    target = (await findTargetInConfiguration(targetName)).target
  } catch (error) {
    if (targetName) {
      displayError(error, 'An error has occurred when compiling services.')
      return ReturnCode.InternalError
    }
    process.logger.info(`Proceeding without any Target`)
  }

  if (subCommand) {
    return await executeSingleFileCompile(target, command, subCommand)
  }
  return await executeCompile(target)
}

export async function buildServices(command: Command) {
  let targetName = command.getFlagValue('target') as string

  if (!targetName) {
    targetName = command.getTargetWithoutFlag() as string
  }

  let target: Target
  try {
    ;({ target } = await findTargetInConfiguration(targetName))
  } catch (error) {
    displayError(error, 'An error has occurred when building services.')
    return ReturnCode.InternalError
  }

  return await executeBuild(target)
}

export async function deployServices(command: Command) {
  let targetName = command.getFlagValue('target') as string

  if (!targetName) {
    targetName = command.getTargetWithoutFlag() as string
  }

  let target: Target, isLocal: boolean
  try {
    ;({ target, isLocal } = await findTargetInConfiguration(targetName))
  } catch (error) {
    displayError(error, 'An error has occurred when deploying services.')
    return ReturnCode.InternalError
  }

  return await executeDeploy(target, isLocal)
}

export async function compileBuildServices(command: Command) {
  let targetName = command.getFlagValue('target') as string

  if (!targetName) {
    targetName = command.getTargetWithoutFlag() as string
  }

  let target: Target
  try {
    ;({ target } = await findTargetInConfiguration(targetName))
  } catch (error) {
    displayError(
      error,
      'An error has occurred when compiling/building services.'
    )
    return ReturnCode.InternalError
  }

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

  let target: Target, isLocal: boolean
  try {
    ;({ target, isLocal } = await findTargetInConfiguration(targetName))
  } catch (error) {
    displayError(
      error,
      'An error has occurred when compiling/building/deploying services.'
    )
    return ReturnCode.InternalError
  }

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
    .then(async () => {
      const { buildDestinationDbFolder } = process.sasjsConstants
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

  let target: Target
  try {
    ;({ target } = await findTargetInConfiguration(targetName))
  } catch (error) {
    displayError(error, 'An error has occurred when building web app.')
    return ReturnCode.InternalError
  }

  return await createWebAppServices(target)
    .then(async () => {
      const { buildDestinationFolder } = process.sasjsConstants
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
      // return await addCredential(targetName, insecure)
      //   .then(() => {
      //     displaySuccess('Credential has been successfully added!')
      //     return ReturnCode.Success
      //   })
      //   .catch((err) => {
      //     displayError(err, 'An error has occurred when adding the credential.')
      //     return ReturnCode.InternalError
      //   })
    } else if (subCommand === 'target' || !subCommand) {
      return await addTarget(insecure)
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

export async function auth(command: Command) {
  let targetName = command.getFlagValue('target') as string
  const insecure = !!command.getFlag('insecure')

  if (!targetName) {
    targetName = command.getTargetWithoutFlag() as string
  }

  if (command && command.name === 'auth') {
    // return await addCredential(targetName, insecure)
    //   .then(() => {
    //     displaySuccess('Credential has been successfully added!')
    //     return ReturnCode.Success
    //   })
    //   .catch((err) => {
    //     displayError(err, 'An error has occurred when adding the credential.')
    //     return ReturnCode.InternalError
    //   })
  } else {
    displayError(null, 'Invalid command: supported commands is - sasjs auth.')
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
      displayError(err, 'An error has occurred when running your SAS job.')
      return ReturnCode.InternalError
    })
}

export async function context(command: Command) {
  // if (!command) {
  //   displayError(null, `Please provide action for the 'context' command.`)
  //   return ReturnCode.InvalidCommand
  // }
  // return await processContext(command)
  //   .then(() => {
  //     return ReturnCode.Success
  //   })
  //   .catch((err) => {
  //     displayError(err, 'An error has occurred when processing context.')
  //     return ReturnCode.InternalError
  //   })
}

export async function servicepack(command: Command) {
  // if (!command) {
  //   displayError(null, `Please provide action for the 'servicepack' command.`)
  //   return ReturnCode.InvalidCommand
  // }
  // return await processServicepack(command)
  //   .then(() => {
  //     return ReturnCode.Success
  //   })
  //   .catch((err) => {
  //     displayError(err, 'An error has occurred when processing servicepack.')
  //     return ReturnCode.InternalError
  //   })
}

export async function folderManagement(command: Command) {
  // if (!command) {
  //   displayError(null, `Please provide action for the 'folder' command.`)
  //   return ReturnCode.InvalidCommand
  // }
  // return await folder(command)
  //   .then(() => {
  //     return ReturnCode.Success
  //   })
  //   .catch((err) => {
  //     displayError(
  //       err,
  //       'An error has occurred when processing folder operation.'
  //     )
  //     return ReturnCode.InternalError
  //   })
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

export async function lint(command: Command) {
  const subCommand = command.getSubCommand()

  if (subCommand === 'init') {
    return await initLint()
      .then((res: { fileAlreadyExisted: boolean }) => {
        if (res.fileAlreadyExisted)
          displaySuccess(
            'The lint configuration file `.sasjslint` is already present.'
          )
        else
          displaySuccess(
            'The lint configuration file `.sasjslint` has been created. You can now run `sasjs lint`.'
          )
        return ReturnCode.Success
      })
      .catch((err: any) => {
        displayError(
          err,
          'An error has occurred whilst initialising SASjs Lint.'
        )
        return ReturnCode.InternalError
      })
  }

  if (subCommand === 'fix') {
    await lintFix().catch((err) => {
      displayError(err, 'An error has occurred while running SASjs Lint Fix.')
      return ReturnCode.LintError
    })
    return ReturnCode.Success
  }

  return await processLint()
    .then((result) => {
      if (result.errors) {
        displayError('Please fix the identified lint errors.')
        return ReturnCode.LintError
      }
      if (result.warnings) {
        process.logger.warn('Please fix the identified lint warnings.')
        return ReturnCode.Success
      }
      displaySuccess('All matched files use @sasjs/lint code style!')
      return ReturnCode.Success
    })
    .catch((err) => {
      displayError(err, 'An error has occurred when processing lint operation.')
      return ReturnCode.InternalError
    })
}

export async function test(command: Command) {
  // return await runTest(command)
  //   .then((_) => ReturnCode.Success)
  //   .catch((err) => {
  //     displayError(err, 'An error has occurred when running tests.')
  //     return ReturnCode.InternalError
  //   })
}

async function executeSingleFileCompile(
  target: Target,
  command: Command,
  subCommand: string
) {
  // return await compileSingleFile(target, command, subCommand)
  //   .then((res) => {
  //     displaySuccess(
  //       `Source has been successfully compiled!\nThe compiled output is located in at:\n- '${res.destinationPath}'`
  //     )
  //     return ReturnCode.Success
  //   })
  //   .catch((err) => {
  //     displayError(err, 'An error has occurred when compiling source.')
  //     return ReturnCode.InternalError
  //   })
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
    .then(async () => {
      const { buildDestinationFolder } = process.sasjsConstants
      displaySuccess(
        `Services have been successfully built!\nThe build output is located in the ${buildDestinationFolder} directory.`
      )
      return ReturnCode.Success
    })
    .catch((err) => {
      if (Array.isArray(err)) {
        const nodeModulesErrors = err.find((err) =>
          err.includes('node_modules/@sasjs/core')
        )

        if (nodeModulesErrors)
          process.logger.info(
            `Suggestion: @sasjs/core dependency is missing. Try running 'npm install @sasjs/core' command.`
          )
      } else {
        displayError(err, 'An error has occurred when building services.')
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

export const terminateProcess = (status: number) => {
  process.logger?.info(
    `Process will be terminated with the status code ${status}.`
  )

  process.exit(status)
}

import { processLint, initLint } from './commands'
import { displayError, displaySuccess } from './utils/displayResult'
import { Command } from './utils/command'

import { lintFix } from './commands/lint/processLint'
import { ReturnCode } from './types/command'

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

export const terminateProcess = (status: number) => {
  process.logger?.info(
    `Process will be terminated with the status code ${status}.`
  )

  process.exit(status)
}

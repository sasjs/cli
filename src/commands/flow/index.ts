import { Command } from '../../utils/command'
import { findTargetInConfiguration } from '../../utils/config'
import { execute } from './execute'
import { displayError } from '../../utils/displayResult'
import path from 'path'

export async function processFlow(command: Command) {
  const subCommand = command.getSubCommand()
  const source = command.getFlagValue('source') as string
  const logFolder = command.getFlagValue('logFolder') as string
  const csvFile = command.getFlagValue('csvFile') as string
  const targetName = command.getFlagValue('target') as string
  const { target } = await findTargetInConfiguration(targetName)

  let result

  switch (subCommand) {
    case 'execute':
      const csvFilePath = await execute(
        source,
        logFolder,
        csvFile,
        target,
        command.prefixAppLoc
      ).catch((err) => {
        displayError(err, 'An error has occurred when executing this flow.')

        result = err
      })

      const pathSepRegExp = new RegExp(path.sep.replace(/\\/g, '\\\\'), 'g')

      if (csvFilePath) {
        process.logger?.info(
          `CSV file located at: ${(csvFilePath as string).replace(
            pathSepRegExp,
            '/'
          )}`
        )
      }

      break
    default:
      break
  }

  return result
}

import { Command } from '../../utils/command'
import { findTargetInConfiguration } from '../../utils/config'
import { execute } from './execute'
import { displayError } from '../../utils/displayResult'

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
      await execute(
        source,
        logFolder,
        csvFile,
        target,
        command.prefixAppLoc
      ).catch((err) => {
        displayError(err, 'An error has occurred when executing this flow.')

        result = err
      })

      break
    default:
      break
  }

  return result
}
